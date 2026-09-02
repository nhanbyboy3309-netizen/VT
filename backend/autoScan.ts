// Background auto-scan: periodically sweeps the configured scan folder,
// matches each file to a document (by filename first, OCR content as
// fallback) and attaches it — the automated counterpart to the manual
// "Lấy file mới nhất từ máy quét" button in DocumentForm, except this one
// figures out *which* document a file belongs to instead of always taking
// whatever the user currently has open.
import fs from 'fs';
import path from 'path';
import Tesseract from 'tesseract.js';
import { DocumentRepository, WorkflowRepository } from './repositories.js';
import { SettingsService } from './services.js';

const AUTO_SCAN_INTERVAL_MS = 30_000;
const PROCESSED_SUBDIR = 'da_xu_ly';
const OCR_EXTS = ['.jpg', '.jpeg', '.png'];

function normalizeForMatch(s: string): string {
  // NFD-decompose so accented Vietnamese letters split into base + combining
  // mark, then the alphanumeric-only filter drops the marks along with every
  // other separator — no need to target the combining-mark range explicitly.
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
}

// "1.0" -> "1.1", "1.2" -> "1.3". Falls back to "1.1" for anything that
// doesn't look like a decimal version.
function incrementVersion(version: string): string {
  const m = String(version || '1.0').match(/^(.*?)(\d+)\.(\d+)$/);
  if (!m) return '1.1';
  return `${m[1]}${m[2]}.${parseInt(m[3], 10) + 1}`;
}

async function ocrIfImage(filePath: string): Promise<string> {
  if (!OCR_EXTS.includes(path.extname(filePath).toLowerCase())) return '';
  try {
    const { data: { text } } = await Tesseract.recognize(filePath, 'vie');
    return text || '';
  } catch (err) {
    console.error('Auto-scan OCR error:', err);
    return '';
  }
}

function findMatchByFilename(fileName: string, docs: any[]): any | null {
  const base = normalizeForMatch(path.basename(fileName, path.extname(fileName)));
  if (!base) return null;
  const exact = docs.find(d => d.number && normalizeForMatch(d.number) === base);
  if (exact) return exact;
  const partial = docs.find(d => d.number && base.includes(normalizeForMatch(d.number)));
  return partial || null;
}

function findMatchByOcrText(ocrText: string, docs: any[]): any | null {
  if (!ocrText.trim()) return null;
  const normalizedText = normalizeForMatch(ocrText);
  return docs.find(d => d.number && normalizedText.includes(normalizeForMatch(d.number))) || null;
}

function moveToProcessed(scanFolder: string, fileName: string) {
  const processedDir = path.join(scanFolder, PROCESSED_SUBDIR);
  if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });
  try {
    fs.renameSync(path.join(scanFolder, fileName), path.join(processedDir, fileName));
  } catch (err) {
    console.error(`Auto-scan: không thể chuyển file "${fileName}" vào thư mục đã xử lý:`, err);
  }
}

async function processScanFile(scanFolder: string, fileName: string, docs: any[]): Promise<void> {
  const sourcePath = path.join(scanFolder, fileName);

  let matched = findMatchByFilename(fileName, docs);
  let ocrText: string | null = null;

  if (!matched) {
    ocrText = await ocrIfImage(sourcePath);
    matched = findMatchByOcrText(ocrText, docs);
    if (!matched) return; // left in place — retried on the next sweep
  }

  if (ocrText === null) {
    ocrText = await ocrIfImage(sourcePath);
  }

  const hadFileBefore = !!matched.fileUrl;
  const isDuplicate = hadFileBefore
    && !!matched.ocrText && !!ocrText
    && normalizeForMatch(ocrText) === normalizeForMatch(matched.ocrText);

  if (isDuplicate) {
    // Same content as what's already attached (a harmless re-scan) — file's
    // done its job, clear it out without touching the document.
    moveToProcessed(scanFolder, fileName);
    return;
  }

  const storageRoot = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const targetDir = path.join(storageRoot, year, month, 'auto_scan');
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const cleanNumber = (matched.number || 'DOC').replace(/\//g, '.');
  const ext = path.extname(fileName) || '.pdf';
  const destFileName = `${cleanNumber}_${Date.now()}${ext}`;
  const relativePath = path.join('storage', year, month, 'auto_scan', destFileName);
  fs.copyFileSync(sourcePath, path.join(process.cwd(), relativePath));

  // A genuine content change on a document that already had a file bumps
  // the ISO minor version; a first-time attach just fills in version 1.0 as-is.
  const newVersion = hadFileBefore ? incrementVersion(matched.version) : (matched.version || '1.0');

  await DocumentRepository.update(matched.id, {
    fileUrl: relativePath,
    ocrText: ocrText || matched.ocrText,
    version: newVersion,
    versions: [
      ...(matched.versions || []),
      {
        url: relativePath,
        timestamp: new Date().toISOString(),
        userName: 'Hệ thống (tự động quét)',
        userId: null,
        action: 'scan'
      }
    ]
  });

  await WorkflowRepository.create({
    document_id: matched.id,
    assigned_to: null,
    action: hadFileBefore ? 'Tự động cập nhật bản scan' : 'Tự động đính kèm bản scan',
    status: matched.status,
    comment: hadFileBefore
      ? `Khớp tự động với file quét "${fileName}" — nội dung thay đổi, tăng phiên bản lên ${newVersion}`
      : `Khớp tự động với file quét "${fileName}"`
  });

  moveToProcessed(scanFolder, fileName);
}

export async function runAutoScanSweep(): Promise<void> {
  const settings: any = await SettingsService.getSettings();
  if (!settings.autoScanEnabled) return;

  const scanFolder = settings.scanFolder || path.join(process.cwd(), 'scans');
  if (!fs.existsSync(scanFolder)) return;

  const files = fs.readdirSync(scanFolder, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => e.name);
  if (files.length === 0) return;

  const docs = (await DocumentRepository.getAll({})) as any[];

  for (const fileName of files) {
    try {
      await processScanFile(scanFolder, fileName, docs);
    } catch (err) {
      console.error(`Auto-scan: lỗi khi xử lý file "${fileName}":`, err);
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

// Always runs once started — each tick checks the settings flag itself, so
// toggling auto-scan on/off in Settings takes effect on the next tick
// without needing a server restart.
export function startAutoScanLoop(): void {
  if (timer) return;
  timer = setInterval(() => {
    runAutoScanSweep().catch(err => console.error('Auto-scan sweep error:', err));
  }, AUTO_SCAN_INTERVAL_MS);
}

// Whatever's still sitting directly in the scan folder (not yet moved into
// the processed subfolder) is, by construction, exactly what auto-scan has
// been unable to match — that's the admin-facing "pending" list.
export async function listPendingScanFiles(): Promise<{ name: string; mtime: string }[]> {
  const settings: any = await SettingsService.getSettings();
  const scanFolder = settings.scanFolder || path.join(process.cwd(), 'scans');
  if (!fs.existsSync(scanFolder)) return [];
  return fs.readdirSync(scanFolder, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => {
      const stat = fs.statSync(path.join(scanFolder, e.name));
      return { name: e.name, mtime: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
}
