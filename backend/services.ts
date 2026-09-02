import { DocumentRepository, UserRepository, WorkflowRepository, SettingsRepository, DocumentTypeRepository, StorageLocationRepository, DepartmentRepository, EditRequestRepository } from './repositories.js';
import * as authz from './authz.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import Tesseract from 'tesseract.js';
import { exec } from 'child_process';
import XLSX from 'xlsx';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

function slugify(input: string, fallback: string): string {
  return input
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;
}

export class ImportService {
  static async importDocumentsFromExcel(filePath: string, user: any) {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(sheet);

    const results = {
      total: data.length,
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const row of data) {
      try {
        // Map Excel columns to database fields
        // Supporting common variations in column names
        const docData: any = {
          number: row['Số hiệu'] || row['Mã số'] || row['Số văn bản'] || row['number'],
          title: row['Tiêu đề'] || row['Tên văn bản'] || row['title'],
          type: row['Loại'] || row['Loại văn bản'] || row['type'],
          sender: row['Nơi ban hành'] || row['Cơ quan ban hành'] || row['sender'],
          receiver: row['Nơi nhận'] || row['receiver'],
          dateIssued: row['Ngày ban hành'] || row['dateIssued'],
          receivedDate: row['Ngày nhận'] || row['receivedDate'],
          physicalLocation: row['Vị trí vật lý'] || row['Kho'] || row['physicalLocation'],
          status: row['Trạng thái'] || row['status'] || 'chưa xử lý',
          fileUrl: row['Đường dẫn file'] || row['File'] || row['file_path'],
          confidentiality: row['Độ mật'] || row['Bảo mật'] || row['confidentiality'] || 'Thường',
          retentionPeriod: row['Thời hạn bảo quản'] || row['Thời hạn lưu trữ'] || row['retentionPeriod'] || 'Vĩnh viễn',
          version: row['Phiên bản'] || row['version'] || '1.0',
          isoStatus: row['Trạng thái ISO'] || row['isoStatus'] || 'Đang hiệu lực'
        };

        if (!docData.number || !docData.title || !docData.type) {
          results.failed++;
          results.errors.push(`Dòng có số hiệu "${docData.number || 'N/A'}": Thiếu thông tin bắt buộc (Mã số, Tiêu đề hoặc Loại).`);
          continue;
        }

        // Route through the same path a manually-created document takes —
        // this is what applies the type/department permission check, sets
        // departmentId + createdBy, and computes the shared-pool edit
        // window. Bypassing it (as a direct repository insert once did)
        // silently produced documents nobody but Admin could ever see again.
        await DocumentService.createDocument(docData, null, user);

        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push(`Dòng "${row['Mã số'] || row['Số hiệu'] || 'N/A'}": ${err.message}`);
      }
    }

    // Attempt to cleanup the uploaded excel file
    try { fs.unlinkSync(filePath); } catch (e) {}

    return results;
  }
}

export class SettingsService {
  static async getSettings() {
    const settings: any = await SettingsRepository.getAll();
    // Provide defaults if empty
    return {
      appName: settings.appName || 'Văn Thư Pro',
      orgName: settings.orgName || 'Cơ quan',
      idSyntax: settings.idSyntax || '{TYPE}/{SEQ}/{YYYY}',
      lastSequence: settings.lastSequence || 0,
      editWindowHours: settings.editWindowHours ?? 4,
      storageRoot: settings.storageRoot || 'storage',
      storageStructure: settings.storageStructure || 'by_type',
      physicalLocations: settings.physicalLocations || ['Kho A', 'Kho B'],
      scanFolder: settings.scanFolder || 'C:/Scans',
      storageFolders: settings.storageFolders || [
        { id: 'cong_van_den', name: 'Công văn đến', physicalLocation: 'Kho A / Tủ 1' },
        { id: 'cong_van_di', name: 'Công văn đi', physicalLocation: 'Kho A / Tủ 2' },
        { id: 'quyet_dinh', name: 'Quyết định', physicalLocation: 'Kho B / Tủ 1' },
        { id: 'thong_bao', name: 'Thông báo', physicalLocation: 'Kho B / Tủ 2' },
        { id: 'van_ban_den', name: 'Văn bản đến bên ngoài', physicalLocation: 'Kho A / Tủ 3' }
      ],
      ...settings
    };
  }

  static async updateSettings(settings: any) {
    return await SettingsRepository.updateBatch(settings);
  }

  static async getStorageFolder(id: string) {
    const settings: any = await this.getSettings();
    return (settings.storageFolders || []).find((f: any) => f.id === id) || null;
  }

  static async addStorageFolder(folder: any) {
    const settings: any = await this.getSettings();
    const folders = settings.storageFolders || [];
    if (folders.some((f: any) => f.id === folder.id)) {
      throw new Error('Thư mục lưu trữ này đã tồn tại');
    }
    await SettingsRepository.update('storageFolders', [...folders, folder]);
    return folder;
  }

  static async updateStorageFolder(id: string, patch: any) {
    const settings: any = await this.getSettings();
    const folders = settings.storageFolders || [];
    const idx = folders.findIndex((f: any) => f.id === id);
    if (idx === -1) throw new Error('Không tìm thấy thư mục lưu trữ');
    const updated = { ...folders[idx], ...patch, id: folders[idx].id };
    folders[idx] = updated;
    await SettingsRepository.update('storageFolders', folders);
    return updated;
  }

  static async deleteStorageFolder(id: string) {
    const settings: any = await this.getSettings();
    const folders = (settings.storageFolders || []).filter((f: any) => f.id !== id);
    await SettingsRepository.update('storageFolders', folders);
  }

  static async uploadLogo(file: any) {
    const storageRoot = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
    const logoDir = path.join(storageRoot, 'branding');
    if (!fs.existsSync(logoDir)) {
      fs.mkdirSync(logoDir, { recursive: true });
    }

    const fileName = `logo_${Date.now()}_${file.originalname}`;
    const targetPath = path.join(logoDir, fileName);
    fs.copyFileSync(file.path, targetPath);
    fs.unlinkSync(file.path);

    const logoUrl = `/storage/branding/${fileName}`;
    await SettingsRepository.update('logoUrl', logoUrl);
    return logoUrl;
  }
}

export class DocumentTypeService {
  static async listTypes() {
    return await DocumentTypeRepository.getAll();
  }

  static async addType(type: any) {
    return await DocumentTypeRepository.create(type);
  }

  static async updateType(id: string, type: any) {
    return await DocumentTypeRepository.update(id, type);
  }

  static async deleteType(id: string) {
    return await DocumentTypeRepository.delete(id);
  }

  static async incrementSequence(id: string) {
    const types = (await DocumentTypeRepository.getAll()) as any[];
    const type = types.find(t => t.id === id);
    if (type) {
      const nextSeq = (type.lastSequence || 0) + 1;
      await DocumentTypeRepository.update(id, { lastSequence: nextSeq });
      return nextSeq;
    }
    return 0;
  }
}

export class StorageLocationService {
  static async listAll() {
    return await StorageLocationRepository.getAll();
  }

  static async addNode(node: any) {
    const existing = (await StorageLocationRepository.getAll()) as any[];
    const id = slugify(node.name || 'vi_tri', 'vi_tri');
    let uniqueId = id;
    let suffix = 1;
    while (existing.some(n => n.id === uniqueId)) {
      uniqueId = `${id}_${++suffix}`;
    }
    await StorageLocationRepository.create({
      id: uniqueId,
      name: node.name,
      parentId: node.parentId || null,
      // Only root nodes carry a department scope — a child inherits it from
      // its ancestor, so this is ignored (and irrelevant) for non-root adds.
      departmentId: node.parentId ? null : (node.departmentId || null)
    });
    return uniqueId;
  }

  static async updateNode(id: string, node: any) {
    return await StorageLocationRepository.update(id, node);
  }

  static async deleteNode(id: string) {
    return await StorageLocationRepository.delete(id);
  }
}

export class DepartmentService {
  static async listAll() {
    return await DepartmentRepository.getAll();
  }

  static async addDepartment(name: string) {
    const existing = (await DepartmentRepository.getAll()) as any[];
    const id = slugify(name || 'phong_ban', 'phong_ban');
    let uniqueId = id;
    let suffix = 1;
    while (existing.some(d => d.id === uniqueId)) {
      uniqueId = `${id}_${++suffix}`;
    }
    await DepartmentRepository.create({ id: uniqueId, name });
    return uniqueId;
  }

  static async renameDepartment(id: string, name: string) {
    return await DepartmentRepository.update(id, { name });
  }

  static async deleteDepartment(id: string) {
    return await DepartmentRepository.delete(id);
  }
}

export class EditRequestService {
  // A pending edit request is how a Nhân viên gets back into a shared/company
  // document once their free-edit window has closed or a scan locked it —
  // only the person who registered the document may ask, and only an Admin
  // may grant it (see server.ts route guards).
  static async create(documentId: number, reason: string, user: any) {
    const doc: any = await DocumentRepository.getById(documentId);
    if (!doc) throw new Error('Không tìm thấy văn bản');
    if (doc.createdBy !== user.id) throw new Error('Bạn không có quyền yêu cầu chỉnh sửa văn bản này');
    return await EditRequestRepository.create({ documentId, requestedBy: user.id, reason });
  }

  static async listAll() {
    return await EditRequestRepository.getAll();
  }

  static async resolve(id: number, approve: boolean, resolvedBy: any) {
    const req: any = await EditRequestRepository.getById(id);
    if (!req) throw new Error('Không tìm thấy yêu cầu');
    if (req.status !== 'pending') throw new Error('Yêu cầu này đã được xử lý trước đó');

    await EditRequestRepository.resolve(id, approve ? 'approved' : 'rejected', resolvedBy.id);

    if (approve) {
      const settings: any = await SettingsService.getSettings();
      const hours = settings.editWindowHours ?? 4;
      const unlockedUntil = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      await DocumentRepository.update(req.documentId, { unlockedUntil });
    }
    return true;
  }
}

export class AuthService {
  static async login(username, password) {
    const user: any = await UserRepository.getByUsername(username);
    if (!user) throw new Error('User not found');

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new Error('Invalid password');

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, departmentId: user.departmentId || null },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        departmentId: user.departmentId || null
      }
    };
  }

  static async register(userData: any) {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    return await UserRepository.create({ ...(userData as any), password: hashedPassword });
  }

  static async listUsers() {
    return await UserRepository.getAll();
  }

  static async deleteUser(id: any) {
    return await UserRepository.delete(id);
  }
}

export class DocumentService {
  // `user` is optional so the few call sites that legitimately need the raw,
  // unfiltered list (QR lookups, sequence bookkeeping) can omit it; every
  // route that returns documents to a logged-in user must pass it.
  static async listDocuments(filters: any = {}, user?: any) {
    const docs = (await DocumentRepository.getAll(filters)) as any[];
    if (!user) return docs;
    return docs.filter(d => authz.canViewDocument(user, d));
  }

  static async getDocument(id: any, user?: any) {
    const doc: any = await DocumentRepository.getById(id);
    if (!doc) throw new Error('Document not found');
    if (user && !authz.canViewDocument(user, doc)) {
      throw new Error('Bạn không có quyền xem văn bản này');
    }
    const history = await WorkflowRepository.getByDocumentId(id);
    return { ...(doc as any), history };
  }

  // Resolves the final on-disk relative path for a document's attached file,
  // however it arrived: a fresh multipart upload, a file the scan-folder flow
  // already dropped in storage/temp, or an already-stored path (e.g. the user
  // reverted to an older version and nothing new needs copying). The
  // timestamp in the filename keeps every upload as its own file on disk —
  // without it, re-uploading under the same document number would silently
  // overwrite the previous file, making version history impossible to restore.
  static async resolveFilePath(docData: any, file: any, typeDir: string): Promise<string> {
    const storageRoot = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
    let file_path = '';

    if (file) {
      const now = new Date();
      const year = now.getFullYear();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');

      const targetDir = path.join(storageRoot, year.toString(), month, typeDir);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const cleanNumber = (docData.number || 'DOC').replace(/\//g, '.');
      const ext = path.extname(file.originalname) || '.pdf';
      const fileName = `${cleanNumber}_${Date.now()}${ext}`;

      const relativePath = path.join('storage', year.toString(), month, typeDir, fileName);
      file_path = relativePath;
      fs.copyFileSync(file.path, path.join(storageRoot, '..', file_path));
      fs.unlinkSync(file.path); // remove temp file
    } else if (docData.fileUrl && docData.fileUrl.includes('/storage/temp/')) {
      // Move from temp to actual storage
      const tempUrl = docData.fileUrl;
      const tempPath = path.join(process.cwd(), tempUrl.startsWith('/') ? tempUrl.substring(1) : tempUrl);
      if (fs.existsSync(tempPath)) {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const targetDir = path.join(storageRoot, year.toString(), month, typeDir);

        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        const cleanNumber = (docData.number || 'DOC').replace(/\//g, '.');
        const ext = path.extname(tempPath) || '.jpg';
        const fileName = `${cleanNumber}_${Date.now()}${ext}`;

        const relativePath = path.join('storage', year.toString(), month, typeDir, fileName);
        file_path = relativePath;
        fs.renameSync(tempPath, path.join(process.cwd(), file_path));
      }
    } else if (docData.fileUrl && !docData.fileUrl.startsWith('blob:')) {
      // A blob: URL is a browser-memory-only preview that was never actually
      // uploaded (e.g. the form's file input changed but nothing was sent) —
      // there is nothing real to point at, so it's treated as "no file".
      file_path = docData.fileUrl.startsWith('/') ? docData.fileUrl.substring(1) : docData.fileUrl;
    }

    return file_path;
  }

  // req.user only carries the JWT payload (id/username/role) — full_name lives
  // in the user record, so version history needs an explicit lookup to avoid
  // showing the bare login name instead of the display name shown elsewhere.
  static async resolveFullName(user: any): Promise<string> {
    if (user.full_name) return user.full_name;
    try {
      const record: any = await UserRepository.getByUsername(user.username);
      return record?.full_name || user.username || 'Hệ thống';
    } catch {
      return user.username || 'Hệ thống';
    }
  }

  static async runOcrIfImage(file_path: string): Promise<string> {
    const fullFilePath = file_path ? path.join(process.cwd(), file_path) : '';
    if (fullFilePath && fs.existsSync(fullFilePath)) {
      const ext = path.extname(fullFilePath).toLowerCase();
      if (ext === '.jpg' || ext === '.png' || ext === '.jpeg') {
        try {
          const { data: { text } } = await Tesseract.recognize(fullFilePath, 'vie');
          return text;
        } catch (err) {
          console.error('OCR Error:', err);
        }
      }
    }
    return '';
  }

  static async createDocument(docData: any, file: any, user: any) {
    // Fetch type info for folder selection
    const types = (await DocumentTypeService.listTypes()) as any[];
    const docType = types.find(t => t.id === docData.type);
    if (!authz.canCreateWithType(user, docType)) {
      throw new Error('Bạn không có quyền tạo văn bản thuộc loại này');
    }
    const typeDir = docType?.defaultFolder || docData.type || 'other';

    // A type scoped to a department makes the document that department's; a
    // type with no department is the admin-managed shared/company pool, in
    // which case a non-admin creator only gets a bounded edit window.
    const departmentId = docType?.departmentId || null;
    let editableUntil: string | null = null;
    if (!departmentId) {
      const settings: any = await SettingsService.getSettings();
      const hours = settings.editWindowHours ?? 4;
      editableUntil = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    }

    const file_path = await this.resolveFilePath(docData, file, typeDir);
    const ocr_text = await this.runOcrIfImage(file_path);

    const docId = await DocumentRepository.create({
      ...docData,
      file_path,
      ocr_text,
      departmentId,
      createdBy: user.id,
      editableUntil
    });

    // Record the initial file as version 1 so it can be told apart from
    // later re-uploads/scans and, if needed, restored to.
    if (file_path) {
      await DocumentRepository.update(docId as number, {
        versions: [{
          url: file_path,
          timestamp: new Date().toISOString(),
          userName: await this.resolveFullName(user),
          userId: user.id,
          action: docData.fileAction || (file ? 'upload' : 'scan')
        }]
      });
    }

    // Increment sequence for document type if applicable
    if (docData.type) {
      await DocumentTypeService.incrementSequence(docData.type);
    }

    // Initial workflow entry
    await WorkflowRepository.create({
      document_id: docId,
      assigned_to: user.id,
      action: 'Tạo mới văn bản',
      status: docData.status || 'chưa xử lý',
      comment: 'Văn bản được khởi tạo trên hệ thống'
    });

    return docId;
  }

  static async triggerPhysicalScan() {
    const settings: any = await SettingsRepository.getAll();
    const scanFolder = settings.scanFolder || path.join(process.cwd(), 'scans');

    if (!fs.existsSync(scanFolder)) {
      try {
        fs.mkdirSync(scanFolder, { recursive: true });
      } catch (err) {
        throw new Error(`Không thể truy cập thư mục quét: ${scanFolder}`);
      }
    }

    // Get all files in the scan folder
    const files = fs.readdirSync(scanFolder)
      .map(fileName => ({
        name: fileName,
        mtime: fs.statSync(path.join(scanFolder, fileName)).mtime
      }))
      .filter(f => fs.statSync(path.join(scanFolder, f.name)).isFile())
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    if (files.length === 0) {
      throw new Error('Thư mục quét đang trống. Vui lòng thực hiện quét tài liệu trước.');
    }

    const latestFile = files[0].name;
    const sourcePath = path.join(scanFolder, latestFile);
    
    const tempDir = path.join(process.cwd(), 'storage', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const ext = path.extname(latestFile) || '.jpg';
    const fileName = `scanned_${Date.now()}${ext}`;
    const destPath = path.join(tempDir, fileName);
    
    try {
      fs.copyFileSync(sourcePath, destPath);
      return {
        success: true,
        filePath: `/storage/temp/${fileName}`,
        originalName: latestFile,
        message: `Đã tự động lấy file mới nhất: ${latestFile}`
      };
    } catch (err: any) {
      throw new Error('Lỗi khi sao chép file từ thư mục quét: ' + err.message);
    }
  }

  static async updateStatus(id, status, comment, user) {
    const existing: any = await DocumentRepository.getById(id);
    if (!existing) throw new Error('Không tìm thấy văn bản');
    const settings: any = await SettingsService.getSettings();
    if (!authz.canEditDocument(user, existing, settings.editWindowHours ?? 4)) {
      throw new Error('Bạn không có quyền cập nhật trạng thái văn bản này');
    }
    await DocumentRepository.update(id, { status });
    await WorkflowRepository.create({
      document_id: id,
      assigned_to: user.id,
      action: 'Cập nhật trạng thái',
      status,
      comment
    });
  }

  static async updateDocument(id, docData, file, reason, user) {
    const existing: any = await DocumentRepository.getById(id);
    if (!existing) throw new Error('Không tìm thấy văn bản');

    const settings: any = await SettingsService.getSettings();
    if (!authz.canEditDocument(user, existing, settings.editWindowHours ?? 4)) {
      throw new Error('Bạn không có quyền chỉnh sửa văn bản này. Vui lòng gửi yêu cầu chỉnh sửa để quản trị viên phê duyệt.');
    }

    const { fileAction, ...rest } = docData;
    const update: any = { ...rest };

    if (existing) {
      const types = (await DocumentTypeService.listTypes()) as any[];
      const docType = types.find(t => t.id === (docData.type || existing.type));
      const typeDir = docType?.defaultFolder || docData.type || existing.type || 'other';

      const newFilePath = await this.resolveFilePath(docData, file, typeDir);

      if (newFilePath && newFilePath !== existing.fileUrl) {
        update.fileUrl = newFilePath;
        update.ocrText = await this.runOcrIfImage(newFilePath);
        update.versions = [
          ...(existing.versions || []),
          {
            url: newFilePath,
            timestamp: new Date().toISOString(),
            userName: await this.resolveFullName(user),
            userId: user.id,
            action: fileAction || (file ? 'upload' : 'revert')
          }
        ];
      } else {
        // Nothing new to attach — don't let the stale preview value (or a
        // blob: URL that was never actually uploaded) overwrite the real path.
        delete update.fileUrl;
      }
    }

    await DocumentRepository.update(id, update);
    await WorkflowRepository.create({
      document_id: id,
      assigned_to: user.id,
      action: 'Chỉnh sửa nội dung',
      status: docData.status,
      comment: reason || 'Người dùng cập nhật thông tin văn bản'
    });
  }

  static async deleteDocument(id, user: any) {
    const doc: any = await DocumentRepository.getById(id);
    if (!doc) throw new Error('Không tìm thấy văn bản');
    if (!authz.canDeleteDocument(user, doc)) {
      throw new Error('Bạn không có quyền xóa văn bản này');
    }

    // Also remove every version's file from storage, not just the current one.
    const paths = new Set<string>();
    if (doc.fileUrl) paths.add(doc.fileUrl);
    (doc.versions || []).forEach((v: any) => { if (v.url) paths.add(v.url); });
    for (const p of paths) {
      const fullPath = path.join(process.cwd(), p);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch { /* best-effort cleanup */ }
      }
    }
    return await DocumentRepository.delete(id);
  }

  // ISO 15489 disposition: records the physical/hard-copy destruction of a
  // document once its retention period has actually lapsed. This never
  // deletes the system record — it's an audit trail entry, not erasure.
  static async markPhysicalDestroyed(id, user: any) {
    const doc: any = await DocumentRepository.getById(id);
    if (!doc) throw new Error('Không tìm thấy văn bản');
    // Same ownership rule as deleting the record — checked first so a user
    // without rights over this document never learns its retention state.
    if (!authz.canDeleteDocument(user, doc)) {
      throw new Error('Bạn không có quyền đánh dấu hủy bản cứng văn bản này');
    }
    if (doc.physicalDestroyed) throw new Error('Văn bản này đã được đánh dấu hủy bản cứng trước đó');
    if (authz.getRetentionStatus(doc) !== 'expired') {
      throw new Error('Chỉ có thể hủy bản cứng khi văn bản đã hết thời hạn bảo quản');
    }
    await DocumentRepository.update(id, {
      physicalDestroyed: true,
      physicalDestroyedAt: new Date().toISOString(),
      physicalDestroyedBy: user.id
    });
    await WorkflowRepository.create({
      document_id: id,
      assigned_to: user.id,
      action: 'Hủy bản cứng (hết hạn lưu trữ)',
      status: doc.status,
      comment: 'Đã hủy tài liệu bản cứng theo thời hạn bảo quản ISO 15489'
    });
    return true;
  }
}

function getDirSizeBytes(dirPath: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return 0; // directory doesn't exist yet (nothing uploaded)
  }
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSizeBytes(fullPath);
    } else if (entry.isFile()) {
      try { total += fs.statSync(fullPath).size; } catch { /* file removed mid-scan */ }
    }
  }
  return total;
}

export class DashboardService {
  static async getStats(user: any) {
    const docs = (await DocumentService.listDocuments({}, user)) as any[];
    const types = (await DocumentTypeService.listTypes()) as any[];

    const totalDocuments = docs.length;
    const pendingDocuments = docs.filter(d => d.status === 'chưa xử lý').length;
    const completedDocuments = docs.filter(d => d.status === 'đã xử lý').length;
    const now = new Date();
    const overdueDocuments = docs.filter(d => d.expiryDate && new Date(d.expiryDate) < now).length;

    // ISO 15489 retention/disposition warnings: documents whose storage
    // retention window is about to lapse or already has, and haven't had
    // their hard copy marked destroyed yet.
    const retentionAlerts = docs
      .map(d => ({ doc: d, status: authz.getRetentionStatus(d) }))
      .filter(({ status }) => status === 'expired' || status === 'expiring_soon')
      .sort((a, b) => (a.status === 'expired' ? 0 : 1) - (b.status === 'expired' ? 0 : 1))
      .slice(0, 10)
      .map(({ doc, status }) => ({
        id: doc.id,
        number: doc.number,
        title: doc.title,
        departmentId: doc.departmentId,
        retentionPeriod: doc.retentionPeriod,
        expiryDate: authz.getRetentionExpiryDate(doc),
        status
      }));
    const retentionExpiredCount = docs.filter(d => authz.getRetentionStatus(d) === 'expired').length;
    const retentionExpiringSoonCount = docs.filter(d => authz.getRetentionStatus(d) === 'expiring_soon').length;

    const typeCounts: Record<string, number> = {};
    docs.forEach(d => { typeCounts[d.type] = (typeCounts[d.type] || 0) + 1; });
    const typeBreakdown = Object.entries(typeCounts)
      .map(([typeId, count]) => {
        const type = types.find(t => t.id === typeId);
        return {
          typeId,
          label: type?.label || typeId.replace(/_/g, ' '),
          count,
          percent: totalDocuments ? Math.round((count / totalDocuments) * 100) : 0
        };
      })
      .sort((a, b) => b.count - a.count);

    // Over-fetch then filter to documents this user can actually see, rather
    // than trimming to 6 first — otherwise another department's activity
    // could crowd out (or simply leak into) this user's feed.
    const visibleIds = new Set(docs.map(d => d.id));
    const recentActivity = ((await WorkflowRepository.getRecent(200)) as any[])
      .filter(entry => visibleIds.has(entry.document_id))
      .slice(0, 6);

    const storageRoot = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
    const storageUsedBytes = getDirSizeBytes(storageRoot);

    return {
      totalDocuments,
      pendingDocuments,
      completedDocuments,
      overdueDocuments,
      recentDocuments: docs.slice(0, 5),
      typeBreakdown,
      recentActivity,
      storageUsedBytes,
      retentionExpiredCount,
      retentionExpiringSoonCount,
      retentionAlerts
    };
  }
}
