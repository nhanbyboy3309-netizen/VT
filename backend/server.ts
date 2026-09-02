import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { AuthService, DocumentService, SettingsService, DocumentTypeService, StorageLocationService, DashboardService, DepartmentService, EditRequestService } from './services.js';
import * as authz from './authz.js';
import { startAutoScanLoop, listPendingScanFiles } from './autoScan.js';
import jwt from 'jsonwebtoken';
import { createServer as createViteServer } from 'vite';

function listDriveRoots(): { name: string; path: string }[] {
  if (process.platform === 'win32') {
    const roots: { name: string; path: string }[] = [];
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const drivePath = `${letter}:\\`;
      try {
        fs.readdirSync(drivePath);
        roots.push({ name: `Ổ đĩa ${letter}:`, path: drivePath });
      } catch {
        // drive letter not present, skip
      }
    }
    return roots;
  }
  return [
    { name: '/ (Gốc hệ thống)', path: '/' },
    { name: 'Thư mục người dùng', path: os.homedir() }
  ];
}

interface AuthenticatedRequest extends express.Request {
  user?: any;
}

async function startServer() {
  const app = express();
  const upload = multer({ dest: 'storage/temp/' });
  const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

  app.use(cors());
  app.use(express.json());
  app.use('/storage', express.static(path.join(process.cwd(), 'storage')));

  // Middleware to verify JWT
  const authenticate = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ message: 'Invalid token' });
    }
  };

  const authorizeAdmin = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    if (req.user?.role !== 'Admin') {
      return res.status(403).json({ message: 'Permission denied. Admin role required.' });
    }
    next();
  };

  // A Nhân viên with a department gets most admin-like settings screens too,
  // just scoped to that department — the per-action checks below enforce
  // that scoping. Someone with no department at all has nothing to scope to.
  const authorizeManagerOrAdmin = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    if (!authz.isAdmin(req.user) && !req.user?.departmentId) {
      return res.status(403).json({ message: 'Permission denied.' });
    }
    next();
  };

  // Best-effort decode used by the public QR-scan route: returns the JWT
  // payload if a valid session token was sent, or null — without ever
  // blocking the request, since that route has no login requirement.
  const getOptionalUser = (req: express.Request): any | null => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return null;
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch {
      return null;
    }
  };

  // API Routes
  app.get('/api/public/qr-scan', async (req, res) => {
    try {
      const { qrType, qrId } = req.query;
      if (!qrType || !qrId) {
        return res.status(400).json({ message: 'Missing qrType or qrId' });
      }

      const settings = await SettingsService.getSettings();
      const allDocs: any = await DocumentService.listDocuments();

      // This endpoint has no login requirement (it's what a physical QR label
      // resolves to). A signed-in scanner sees exactly what they'd see in the
      // app (their own department + their own shared-pool documents);
      // anonymous scans — someone just walking up to a shelf — only ever see
      // non-confidential documents, and never another department's.
      const scanUser = getOptionalUser(req);
      const docs = scanUser
        ? allDocs.filter((d: any) => authz.canViewDocument(scanUser, d))
        : allDocs.filter((d: any) => !d.departmentId && (d.confidentiality || 'Thường') === 'Thường');

      if (qrType === 'location') {
        const locationName = qrId as string;
        // Find folders in this location
        const folders = (settings.storageFolders || []).filter((f: any) => f.physicalLocation === locationName);
        // Find documents in this location
        const locationDocs = docs.filter((d: any) => d.physicalLocation === locationName);

        return res.json({
          type: 'location',
          name: locationName,
          folders,
          documents: locationDocs.map((d: any) => ({
            id: d.id,
            number: d.number,
            title: d.title,
            dateIssued: d.dateIssued,
            status: d.status
          }))
        });
      } else if (qrType === 'folder') {
        const folderId = qrId as string;
        const folder = (settings.storageFolders || []).find((f: any) => f.id === folderId);
        if (!folder || (scanUser ? !authz.canViewStorageFolder(scanUser, folder) : !!folder.departmentId)) {
          return res.status(404).json({ message: 'Folder not found' });
        }

        // Find documents in this folder
        const folderDocs = docs.filter((d: any) => d.digitalLocation === folderId || d.physicalLocation === folder.physicalLocation);

        return res.json({
          type: 'folder',
          id: folderId,
          name: folder.name,
          physicalLocation: folder.physicalLocation,
          documents: folderDocs.map((d: any) => ({
            id: d.id,
            number: d.number,
            title: d.title,
            dateIssued: d.dateIssued,
            status: d.status
          }))
        });
      } else if (qrType === 'storage_location') {
        const nodeId = qrId as string;
        const allNodes = (await StorageLocationService.listAll()) as any[];
        const node = allNodes.find((n: any) => n.id === nodeId);
        if (!node) {
          return res.status(404).json({ message: 'Vị trí lưu trữ không tồn tại' });
        }
        if (scanUser ? !authz.canViewLocationNode(scanUser, node, allNodes) : !!authz.getNodeDepartmentId(node, allNodes)) {
          return res.status(404).json({ message: 'Vị trí lưu trữ không tồn tại' });
        }

        // Matches by id (new data) or by name (legacy free-text physicalLocation values)
        const matchesNode = (loc: string | undefined) => !!loc && (loc === node.id || loc === node.name);

        const children = allNodes
          .filter((n: any) => n.parentId === node.id)
          .map((child: any) => {
            const childDocCount = docs.filter((d: any) => d.physicalLocation === child.id || d.physicalLocation === child.name).length;
            return { id: child.id, name: child.name, documentCount: childDocCount };
          });

        const nodeDocs = docs.filter((d: any) => matchesNode(d.physicalLocation));
        const nodeFolders = (settings.storageFolders || []).filter((f: any) => matchesNode(f.physicalLocation));

        // Breadcrumb: walk up the parent chain
        const breadcrumb: any[] = [];
        let cursor = node.parentId ? allNodes.find((n: any) => n.id === node.parentId) : null;
        while (cursor) {
          breadcrumb.unshift({ id: cursor.id, name: cursor.name });
          cursor = cursor.parentId ? allNodes.find((n: any) => n.id === cursor.parentId) : null;
        }

        return res.json({
          type: 'storage_location',
          id: node.id,
          name: node.name,
          breadcrumb,
          children,
          folders: nodeFolders,
          documents: nodeDocs.map((d: any) => ({
            id: d.id,
            number: d.number,
            title: d.title,
            dateIssued: d.dateIssued,
            status: d.status
          }))
        });
      }

      res.status(400).json({ message: 'Invalid qrType' });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const result = await AuthService.login(req.body.username, req.body.password);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/auth/register', authenticate, authorizeAdmin, async (req, res) => {
    try {
      const id = await AuthService.register(req.body);
      res.json({ id });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/users', authenticate, authorizeAdmin, async (req, res) => {
    try {
      const users = await AuthService.listUsers();
      res.json(users);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete('/api/users/:id', authenticate, authorizeAdmin, async (req, res) => {
    try {
      await AuthService.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/documents', authenticate, async (req: AuthenticatedRequest, res) => {
    try {
      const docs = await DocumentService.listDocuments(req.query, req.user);
      res.json(docs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/documents/:id', authenticate, async (req: AuthenticatedRequest, res) => {
    try {
      const doc = await DocumentService.getDocument(req.params.id, req.user);
      res.json(doc);
    } catch (err: any) {
      res.status(404).json({ message: err.message });
    }
  });

  app.post('/api/documents', authenticate, upload.single('file'), async (req: AuthenticatedRequest, res) => {
    try {
      const docData = JSON.parse(req.body.data);
      const id = await DocumentService.createDocument(docData, req.file, req.user);
      res.json({ id });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/documents/import', authenticate, upload.single('file'), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) throw new Error('No file uploaded');
      const { ImportService } = await import('./services.js');
      const results = await ImportService.importDocumentsFromExcel(req.file.path, req.user);
      res.json(results);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch('/api/documents/:id/status', authenticate, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      await DocumentService.updateStatus(req.params.id, req.body.status, req.body.comment, req.user);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch('/api/documents/:id', authenticate, upload.single('file'), async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const docData = JSON.parse(req.body.data);
      await DocumentService.updateDocument(req.params.id, docData, req.file, req.body.reason, req.user);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete('/api/documents/:id', authenticate, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      await DocumentService.deleteDocument(req.params.id, req.user);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch('/api/documents/:id/destroy', authenticate, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      await DocumentService.markPhysicalDestroyed(req.params.id, req.user);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Document Types Routes — each type belongs to a department (its numbering
  // is that department's own business) or to no department at all, which
  // marks it as the admin-managed shared/company-wide numbering pool.
  app.get('/api/settings/document-types', authenticate, async (req: AuthenticatedRequest, res) => {
    try {
      const types = (await DocumentTypeService.listTypes()) as any[];
      res.json(types.filter(t => authz.canViewDocType(req.user, t)));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/settings/document-types', authenticate, authorizeManagerOrAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      if (!authz.canCreateDocType(req.user, req.body.departmentId || null)) {
        return res.status(403).json({ message: 'Bạn chỉ có thể tạo loại văn bản cho phòng ban của mình' });
      }
      await DocumentTypeService.addType(req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch('/api/settings/document-types/:id', authenticate, authorizeManagerOrAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const types = (await DocumentTypeService.listTypes()) as any[];
      const existing = types.find(t => t.id === req.params.id);
      if (!existing || !authz.canManageDocType(req.user, existing)) {
        return res.status(403).json({ message: 'Bạn không có quyền sửa loại văn bản này' });
      }
      // A manager may not move a type into another department or into the shared pool.
      if (!authz.isAdmin(req.user)) delete req.body.departmentId;
      await DocumentTypeService.updateType(req.params.id, req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete('/api/settings/document-types/:id', authenticate, authorizeManagerOrAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const types = (await DocumentTypeService.listTypes()) as any[];
      const existing = types.find(t => t.id === req.params.id);
      if (!existing || !authz.canManageDocType(req.user, existing)) {
        return res.status(403).json({ message: 'Bạn không có quyền xóa loại văn bản này' });
      }
      await DocumentTypeService.deleteType(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Storage Locations Routes: Kho (root, carries a department) > Tủ > Ngăn/Hộc.
  // A root with no department is the shared/company-wide tree, admin-only.
  app.get('/api/settings/storage-locations', authenticate, async (req: AuthenticatedRequest, res) => {
    try {
      const nodes = (await StorageLocationService.listAll()) as any[];
      res.json(nodes.filter(n => authz.canViewLocationNode(req.user, n, nodes)));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/settings/storage-locations', authenticate, authorizeManagerOrAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const allNodes = (await StorageLocationService.listAll()) as any[];
      if (!authz.canCreateLocationNode(req.user, req.body, allNodes)) {
        return res.status(403).json({ message: 'Bạn chỉ có thể thêm vị trí trong phòng ban của mình' });
      }
      const id = await StorageLocationService.addNode(req.body);
      res.json({ id });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch('/api/settings/storage-locations/:id', authenticate, authorizeManagerOrAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const allNodes = (await StorageLocationService.listAll()) as any[];
      const existing = allNodes.find(n => n.id === req.params.id);
      if (!existing || !authz.canManageLocationNode(req.user, existing, allNodes)) {
        return res.status(403).json({ message: 'Bạn không có quyền sửa vị trí này' });
      }
      if (!authz.isAdmin(req.user)) delete req.body.departmentId;
      await StorageLocationService.updateNode(req.params.id, req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete('/api/settings/storage-locations/:id', authenticate, authorizeManagerOrAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const allNodes = (await StorageLocationService.listAll()) as any[];
      const existing = allNodes.find(n => n.id === req.params.id);
      if (!existing || !authz.canManageLocationNode(req.user, existing, allNodes)) {
        return res.status(403).json({ message: 'Bạn không có quyền xóa vị trí này' });
      }
      await StorageLocationService.deleteNode(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Storage-folder mapping (digital folder name -> physical location text),
  // scoped by department the same way document types and storage-location
  // roots are — a shared/company-wide entry stays admin-only.
  app.post('/api/settings/storage-folders', authenticate, authorizeManagerOrAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const folder = req.body;
      if (!authz.canCreateStorageFolder(req.user, folder.departmentId || null)) {
        return res.status(403).json({ message: 'Bạn chỉ có thể thêm thư mục lưu trữ trong phòng ban của mình' });
      }
      const saved = await SettingsService.addStorageFolder(folder);
      res.json(saved);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch('/api/settings/storage-folders/:id', authenticate, authorizeManagerOrAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const existing = await SettingsService.getStorageFolder(req.params.id);
      if (!existing || !authz.canManageStorageFolder(req.user, existing)) {
        return res.status(403).json({ message: 'Bạn không có quyền sửa thư mục lưu trữ này' });
      }
      if (!authz.isAdmin(req.user)) delete req.body.departmentId;
      const updated = await SettingsService.updateStorageFolder(req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete('/api/settings/storage-folders/:id', authenticate, authorizeManagerOrAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const existing = await SettingsService.getStorageFolder(req.params.id);
      if (!existing || !authz.canManageStorageFolder(req.user, existing)) {
        return res.status(403).json({ message: 'Bạn không có quyền xóa thư mục lưu trữ này' });
      }
      await SettingsService.deleteStorageFolder(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Department Routes — admin-only: departments are the organizational units
  // the rest of the permission model (users, doc types, storage, documents) hangs off.
  app.get('/api/settings/departments', authenticate, async (req, res) => {
    try {
      const departments = await DepartmentService.listAll();
      res.json(departments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/settings/departments', authenticate, authorizeAdmin, async (req, res) => {
    try {
      const id = await DepartmentService.addDepartment(req.body.name);
      res.json({ id });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch('/api/settings/departments/:id', authenticate, authorizeAdmin, async (req, res) => {
    try {
      await DepartmentService.renameDepartment(req.params.id, req.body.name);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete('/api/settings/departments/:id', authenticate, authorizeAdmin, async (req, res) => {
    try {
      await DepartmentService.deleteDepartment(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Edit-Request Routes — a Nhân viên's way back into a shared/company
  // document once their free-edit window has closed or a scan locked it.
  app.post('/api/edit-requests', authenticate, async (req: AuthenticatedRequest, res) => {
    try {
      const id = await EditRequestService.create(req.body.documentId, req.body.reason, req.user);
      res.json({ id });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/edit-requests', authenticate, async (req: AuthenticatedRequest, res) => {
    try {
      const all = (await EditRequestService.listAll()) as any[];
      // Admin sees every pending/resolved request; everyone else sees only
      // the ones they themselves filed, to check on their own status.
      const visible = authz.isAdmin(req.user) ? all : all.filter(r => r.requestedBy === req.user.id);
      res.json(visible);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch('/api/edit-requests/:id', authenticate, authorizeAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      await EditRequestService.resolve(Number(req.params.id), !!req.body.approve, req.user);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Server-side folder browser, used to let Settings fields (storage root, scan
  // folder, per-type storage path) be picked from a real directory tree instead
  // of typed by hand.
  app.get('/api/system/browse-folders', authenticate, authorizeAdmin, (req, res) => {
    try {
      const requestedPath = req.query.path as string | undefined;
      if (!requestedPath) {
        return res.json({ currentPath: null, parentPath: null, folders: listDriveRoots() });
      }

      const resolved = path.resolve(requestedPath);
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return res.status(400).json({ message: 'Đường dẫn không phải là thư mục' });
      }

      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const folders = entries
        .filter(e => e.isDirectory())
        .map(e => ({ name: e.name, path: path.join(resolved, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const parsedParent = path.dirname(resolved);
      const parentPath = parsedParent !== resolved ? parsedParent : null;

      res.json({ currentPath: resolved, parentPath, folders });
    } catch (err: any) {
      res.status(400).json({ message: 'Không thể đọc thư mục: ' + err.message });
    }
  });

  app.post('/api/system/create-folder', authenticate, authorizeAdmin, (req, res) => {
    try {
      const { parentPath, name } = req.body;
      if (!parentPath || !name || !String(name).trim()) {
        return res.status(400).json({ message: 'Thiếu tên thư mục' });
      }
      const safeName = String(name).trim().replace(/[\\/:*?"<>|]/g, '_');
      const newPath = path.join(parentPath, safeName);
      fs.mkdirSync(newPath, { recursive: true });
      res.json({ name: safeName, path: newPath });
    } catch (err: any) {
      res.status(400).json({ message: 'Không thể tạo thư mục: ' + err.message });
    }
  });

  app.get('/api/settings/document-types/:id/next-number', authenticate, async (req: AuthenticatedRequest, res) => {
    try {
      const types = (await DocumentTypeService.listTypes()) as any[];
      const type = types.find(t => t.id === req.params.id);
      if (!type || !authz.canViewDocType(req.user, type)) throw new Error('Document type not found');

      const settings = await SettingsService.getSettings();
      const syntax = type.idSyntax || settings.idSyntax || '{TYPE}/{SEQ}/{YYYY}';
      const seq = (type.lastSequence || 0) + 1;
      const now = new Date();

      let nextNumber = syntax
        .replace(/{TYPE}/g, type.prefix || type.id)
        .replace(/{SEQ}/g, seq.toString().padStart(3, '0'))
        .replace(/{YYYY}/g, now.getFullYear().toString())
        .replace(/{YY}/g, now.getFullYear().toString().slice(-2))
        .replace(/{MM}/g, (now.getMonth() + 1).toString().padStart(2, '0'));

      res.json({ nextNumber });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Settings Routes
  app.get('/api/settings', authenticate, async (req: AuthenticatedRequest, res) => {
    try {
      const settings: any = await SettingsService.getSettings();
      res.json({
        ...settings,
        storageFolders: (settings.storageFolders || []).filter((f: any) => authz.canViewStorageFolder(req.user, f))
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/settings', authenticate, authorizeAdmin, async (req, res) => {
    try {
      await SettingsService.updateSettings(req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/settings/logo', authenticate, authorizeAdmin, upload.single('logo'), async (req, res) => {
    try {
      if (!req.file) throw new Error('No file uploaded');
      const logoUrl = await SettingsService.uploadLogo(req.file);
      res.json({ logoUrl });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/scan/trigger', authenticate, async (req, res) => {
    try {
      const result = await DocumentService.triggerPhysicalScan();
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Files currently sitting in the scan folder that auto-scan hasn't been
  // able to match to a document yet (matched files get moved out on the
  // spot, so whatever remains here is exactly the unmatched set).
  app.get('/api/scan/pending', authenticate, authorizeAdmin, async (req, res) => {
    try {
      const files = await listPendingScanFiles();
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/dashboard/stats', authenticate, async (req: AuthenticatedRequest, res) => {
    try {
       const stats = await DashboardService.getStats(req.user);
       res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3002;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  startAutoScanLoop();
}

startServer();
