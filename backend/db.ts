import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDir = process.env.DB_PATH 
  ? path.dirname(process.env.DB_PATH) 
  : path.resolve(__dirname, '../database');

const dbPath = process.env.DB_PATH || path.join(baseDir, 'app_json_db.json');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Storage folders setup
const storagePath = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
if (!fs.existsSync(storagePath)) {
  fs.mkdirSync(storagePath, { recursive: true });
}

interface DBData {
  users: any[];
  documents: any[];
  workflow: any[];
  settings: any[];
  document_types: any[];
  storage_locations: any[];
  departments: any[];
  edit_requests: any[];
}

const DEFAULT_DATA: DBData = {
  users: [],
  documents: [],
  workflow: [],
  settings: [],
  document_types: [],
  storage_locations: [],
  departments: [],
  edit_requests: []
};

// Seed admin user
const adminHash = bcrypt.hashSync('admin123', 10);
const initialAdmin = {
  id: 1,
  username: 'admin',
  password: adminHash,
  role: 'Admin',
  full_name: 'Hệ thống Admin',
  created_at: new Date().toISOString()
};
DEFAULT_DATA.users.push(initialAdmin);

// Seed default document types
const defaultDocTypes = [
  {
    id: 'CONG_VAN_DEN',
    label: 'Công văn đến',
    prefix: 'CVD',
    default_folder: 'cong_van_den',
    storage_path: 'incoming',
    id_syntax: 'CVD/{SEQ}/{YYYY}',
    last_sequence: 0
  },
  {
    id: 'CONG_VAN_DI',
    label: 'Công văn đi',
    prefix: 'CVDI',
    default_folder: 'cong_van_di',
    storage_path: 'outgoing',
    id_syntax: 'CVDI/{SEQ}/{YYYY}',
    last_sequence: 0
  },
  {
    id: 'QUYET_DINH',
    label: 'Quyết định',
    prefix: 'QD',
    default_folder: 'quyet_dinh',
    storage_path: 'decisions',
    id_syntax: 'QD/{SEQ}/{YYYY}',
    last_sequence: 0
  },
  {
    id: 'THONG_BAO',
    label: 'Thông báo',
    prefix: 'TB',
    default_folder: 'thong_bao',
    storage_path: 'announcements',
    id_syntax: 'TB/{SEQ}/{YYYY}',
    last_sequence: 0
  },
  {
    id: 'VAN_BAN_DEN',
    label: 'Văn bản đến bên ngoài',
    prefix: 'VBD',
    default_folder: 'van_ban_den',
    storage_path: 'external',
    id_syntax: 'VBD/{SEQ}/{YYYY}',
    last_sequence: 0
  }
];
DEFAULT_DATA.document_types = defaultDocTypes;

class JSONDatabase {
  private data: DBData;

  constructor() {
    this.data = { ...DEFAULT_DATA };
    this.load();
  }

  private load() {
    if (fs.existsSync(dbPath)) {
      try {
        const raw = fs.readFileSync(dbPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          users: parsed.users || [],
          documents: parsed.documents || [],
          workflow: parsed.workflow || [],
          settings: parsed.settings || [],
          document_types: parsed.document_types || [],
          storage_locations: parsed.storage_locations || [],
          departments: parsed.departments || [],
          edit_requests: parsed.edit_requests || []
        };
        // Ensure initial admin and types exist if they were empty
        if (this.data.users.length === 0) {
          this.data.users.push(initialAdmin);
        }
        if (this.data.document_types.length === 0) {
          this.data.document_types = defaultDocTypes;
        }
      } catch (err) {
        console.error('Error parsing JSON database, recreating', err);
        this.save();
      }
    } else {
      this.save();
    }
  }

  private save() {
    try {
      fs.writeFileSync(dbPath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving JSON database', err);
    }
  }

  serialize(callback: () => void) {
    callback();
  }

  run(query: string, params?: any[] | ((err: any) => void), callback?: (err: any) => void) {
    let actualParams: any[] = [];
    let actualCallback = callback;

    if (typeof params === 'function') {
      actualCallback = params as any;
      actualParams = [];
    } else if (Array.isArray(params)) {
      actualParams = params;
    }

    const normalizedQuery = query.trim().replace(/\s+/g, ' ');
    const lowerQuery = normalizedQuery.toLowerCase();

    let lastID = undefined as number | undefined;
    let changes = 0;
    let err = null;

    try {
      if (lowerQuery.startsWith('create table') || lowerQuery.startsWith('alter table')) {
        changes = 0;
      } else if (lowerQuery.startsWith('begin transaction') || lowerQuery.startsWith('commit')) {
        changes = 0;
      } else if (lowerQuery.startsWith('insert into users')) {
        const id = Math.max(0, ...this.data.users.map(u => u.id)) + 1;
        // A single object param (rather than a fixed positional list) so new
        // fields (e.g. department_id) never get silently dropped when added.
        const payload = actualParams[0] || {};
        this.data.users.push({
          id,
          username: payload.username,
          password: payload.password,
          role: payload.role,
          full_name: payload.full_name,
          department_id: payload.department_id || null,
          created_at: new Date().toISOString()
        });
        lastID = id;
        changes = 1;
        this.save();
      } else if (lowerQuery.startsWith('insert into documents')) {
        const id = Math.max(0, ...this.data.documents.map(d => d.id)) + 1;
        const payload = actualParams[0] || {};

        this.data.documents.push({
          id,
          number: payload.number,
          title: payload.title,
          type: payload.type,
          sender: payload.sender,
          receiver: payload.receiver,
          date_issued: payload.date_issued,
          received_date: payload.received_date,
          expiry_date: payload.expiry_date,
          physical_location: payload.physical_location,
          digital_location: payload.digital_location,
          status: payload.status || 'chưa xử lý',
          file_path: payload.file_path,
          ocr_text: payload.ocr_text,
          confidentiality: payload.confidentiality || 'Thường',
          retention_period: payload.retention_period || 'Vĩnh viễn',
          version: payload.version || '1.0',
          iso_status: payload.iso_status || 'Đang hiệu lực',
          department_id: payload.department_id || null,
          created_by: payload.created_by || null,
          editable_until: payload.editable_until || null,
          unlocked_until: payload.unlocked_until || null,
          partner_abbreviation: payload.partner_abbreviation,
          physical_destroyed: false,
          physical_destroyed_at: null,
          physical_destroyed_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        lastID = id;
        changes = 1;
        this.save();
      } else if (lowerQuery.startsWith('insert into departments')) {
        const payload = actualParams[0] || {};
        this.data.departments.push({ id: payload.id, name: payload.name });
        changes = 1;
        this.save();
      } else if (lowerQuery.startsWith('insert into edit_requests')) {
        const id = Math.max(0, ...this.data.edit_requests.map(r => r.id)) + 1;
        const payload = actualParams[0] || {};
        this.data.edit_requests.push({
          id,
          document_id: payload.document_id,
          requested_by: payload.requested_by,
          reason: payload.reason,
          status: 'pending',
          created_at: new Date().toISOString(),
          resolved_at: null,
          resolved_by: null
        });
        lastID = id;
        changes = 1;
        this.save();
      } else if (lowerQuery.startsWith('insert into workflow')) {
        const id = Math.max(0, ...this.data.workflow.map(w => w.id)) + 1;
        const [document_id, assigned_to, action, status, comment] = actualParams;
        this.data.workflow.push({
          id,
          document_id,
          assigned_to,
          action,
          status,
          comment,
          timestamp: new Date().toISOString()
        });
        lastID = id;
        changes = 1;
        this.save();
      } else if (lowerQuery.startsWith('insert or replace into settings') || lowerQuery.startsWith('insert into settings')) {
        const [key, value] = actualParams;
        const existingIdx = this.data.settings.findIndex(s => s.key === key);
        if (existingIdx !== -1) {
          this.data.settings[existingIdx].value = value;
        } else {
          this.data.settings.push({ key, value });
        }
        changes = 1;
        this.save();
      } else if (lowerQuery.startsWith('insert into document_types')) {
        const payload = actualParams[0] || {};
        const row = {
          id: payload.id,
          label: payload.label,
          prefix: payload.prefix,
          default_folder: payload.default_folder,
          storage_path: payload.storage_path,
          id_syntax: payload.id_syntax,
          last_sequence: payload.last_sequence || 0,
          department_id: payload.department_id || null
        };
        const existingIdx = this.data.document_types.findIndex(d => d.id === row.id);
        if (existingIdx !== -1) {
          this.data.document_types[existingIdx] = row;
        } else {
          this.data.document_types.push(row);
        }
        changes = 1;
        this.save();
      } else if (lowerQuery.startsWith('update departments')) {
        const id = actualParams[actualParams.length - 1];
        const idx = this.data.departments.findIndex(d => d.id === id);
        if (idx !== -1) {
          const dept = this.data.departments[idx];
          const setPart = normalizedQuery.substring(
            lowerQuery.indexOf('set') + 4,
            lowerQuery.indexOf('where')
          ).trim();
          const assignments = setPart.split(',').map(s => s.trim());
          let paramIdx = 0;
          assignments.forEach((assign) => {
            const parts = assign.split('=');
            if (parts.length === 2 && parts[1].trim() === '?') {
              dept[parts[0].trim()] = actualParams[paramIdx++];
            }
          });
          changes = 1;
          this.save();
        } else {
          changes = 0;
        }
      } else if (lowerQuery.startsWith('delete from departments')) {
        const id = actualParams[0];
        const initialLen = this.data.departments.length;
        this.data.departments = this.data.departments.filter(d => d.id !== id);
        // Unassign any users/documents/types/locations pointed at the removed department
        // rather than leaving them referencing a department that no longer exists.
        this.data.users.forEach(u => { if (u.department_id === id) u.department_id = null; });
        this.data.document_types.forEach(t => { if (t.department_id === id) t.department_id = null; });
        this.data.storage_locations.forEach(l => { if (l.department_id === id) l.department_id = null; });
        changes = initialLen - this.data.departments.length;
        this.save();
      } else if (lowerQuery.startsWith('update edit_requests')) {
        const id = Number(actualParams[actualParams.length - 1]);
        const idx = this.data.edit_requests.findIndex(r => r.id === id);
        if (idx !== -1) {
          const reqRow = this.data.edit_requests[idx];
          const setPart = normalizedQuery.substring(
            lowerQuery.indexOf('set') + 4,
            lowerQuery.indexOf('where')
          ).trim();
          const assignments = setPart.split(',').map(s => s.trim());
          let paramIdx = 0;
          assignments.forEach((assign) => {
            const parts = assign.split('=');
            if (parts.length === 2 && parts[1].trim() === '?') {
              reqRow[parts[0].trim()] = actualParams[paramIdx++];
            }
          });
          changes = 1;
          this.save();
        } else {
          changes = 0;
        }
      } else if (lowerQuery.startsWith('update documents')) {
        const id = actualParams[actualParams.length - 1];
        const docIdx = this.data.documents.findIndex(d => d.id === Number(id));
        if (docIdx !== -1) {
          const doc = this.data.documents[docIdx];
          const setPart = normalizedQuery.substring(
            lowerQuery.indexOf('set') + 4,
            lowerQuery.indexOf('where')
          ).trim();
          
          const assignments = setPart.split(',').map(s => s.trim());
          let paramIdx = 0;
          assignments.forEach((assign) => {
            const parts = assign.split('=');
            if (parts.length === 2) {
              const field = parts[0].trim();
              const valueExpr = parts[1].trim();
              if (valueExpr === '?') {
                doc[field] = actualParams[paramIdx++];
              }
            }
          });
          doc.updated_at = new Date().toISOString();
          changes = 1;
          this.save();
        } else {
          changes = 0;
        }
      } else if (lowerQuery.startsWith('update document_types')) {
        const id = actualParams[actualParams.length - 1];
        const typeIdx = this.data.document_types.findIndex(d => d.id === id);
        if (typeIdx !== -1) {
          const typeObj = this.data.document_types[typeIdx];
          const setPart = normalizedQuery.substring(
            lowerQuery.indexOf('set') + 4,
            lowerQuery.indexOf('where')
          ).trim();
          const assignments = setPart.split(',').map(s => s.trim());
          let paramIdx = 0;
          assignments.forEach((assign) => {
            const parts = assign.split('=');
            if (parts.length === 2) {
              const field = parts[0].trim();
              const valueExpr = parts[1].trim();
              if (valueExpr === '?') {
                typeObj[field] = actualParams[paramIdx++];
              }
            }
          });
          changes = 1;
          this.save();
        } else {
          changes = 0;
        }
      } else if (lowerQuery.startsWith('delete from documents')) {
        const id = Number(actualParams[0]);
        const initialLen = this.data.documents.length;
        this.data.documents = this.data.documents.filter(d => d.id !== id);
        this.data.workflow = this.data.workflow.filter(w => w.document_id !== id);
        changes = initialLen - this.data.documents.length;
        this.save();
      } else if (lowerQuery.startsWith('delete from users')) {
        const id = Number(actualParams[0]);
        const initialLen = this.data.users.length;
        this.data.users = this.data.users.filter(u => u.id !== id);
        changes = initialLen - this.data.users.length;
        this.save();
      } else if (lowerQuery.startsWith('delete from document_types')) {
        const id = actualParams[0];
        const initialLen = this.data.document_types.length;
        this.data.document_types = this.data.document_types.filter(d => d.id !== id);
        changes = initialLen - this.data.document_types.length;
        this.save();
      } else if (lowerQuery.startsWith('insert into storage_locations')) {
        const [id, name, parent_id, department_id] = actualParams;
        this.data.storage_locations.push({ id, name, parent_id: parent_id || null, department_id: department_id || null });
        changes = 1;
        this.save();
      } else if (lowerQuery.startsWith('update storage_locations')) {
        const id = actualParams[actualParams.length - 1];
        const nodeIdx = this.data.storage_locations.findIndex(n => n.id === id);
        if (nodeIdx !== -1) {
          const node = this.data.storage_locations[nodeIdx];
          const setPart = normalizedQuery.substring(
            lowerQuery.indexOf('set') + 4,
            lowerQuery.indexOf('where')
          ).trim();
          const assignments = setPart.split(',').map(s => s.trim());
          let paramIdx = 0;
          assignments.forEach((assign) => {
            const parts = assign.split('=');
            if (parts.length === 2) {
              const field = parts[0].trim();
              const valueExpr = parts[1].trim();
              if (valueExpr === '?') {
                node[field] = actualParams[paramIdx++];
              }
            }
          });
          changes = 1;
          this.save();
        } else {
          changes = 0;
        }
      } else if (lowerQuery.startsWith('delete from storage_locations')) {
        // Cascade delete: remove the node and all of its descendants (any depth).
        const rootId = actualParams[0];
        const idsToRemove = new Set([rootId]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const node of this.data.storage_locations) {
            if (node.parent_id && idsToRemove.has(node.parent_id) && !idsToRemove.has(node.id)) {
              idsToRemove.add(node.id);
              grew = true;
            }
          }
        }
        const initialLen = this.data.storage_locations.length;
        this.data.storage_locations = this.data.storage_locations.filter(n => !idsToRemove.has(n.id));
        changes = initialLen - this.data.storage_locations.length;
        this.save();
      } else {
        console.warn('Unhandled RUN query:', query);
      }
    } catch (e: any) {
      console.error('Error executing query:', query, e);
      err = e;
    }

    if (actualCallback) {
      const context = { lastID, changes };
      setTimeout(() => actualCallback!.call(context, err), 0);
    }
  }

  get(query: string, params?: any[] | ((err: any, row: any) => void), callback?: (err: any, row: any) => void) {
    let actualParams: any[] = [];
    let actualCallback = callback;

    if (typeof params === 'function') {
      actualCallback = params as any;
      actualParams = [];
    } else if (Array.isArray(params)) {
      actualParams = params;
    }

    const lowerQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');

    let row = null;
    let err = null;

    try {
      if (lowerQuery.startsWith('select * from users where username =')) {
        const username = actualParams[0];
        row = this.data.users.find(u => u.username === username) || null;
      } else if (lowerQuery.startsWith('select * from documents where id =')) {
        const id = Number(actualParams[0]);
        row = this.data.documents.find(d => d.id === id) || null;
      } else if (lowerQuery.startsWith('select * from edit_requests where id =')) {
        const id = Number(actualParams[0]);
        row = this.data.edit_requests.find(r => r.id === id) || null;
      } else {
        console.warn('Unhandled GET query:', query);
      }
    } catch (e: any) {
      err = e;
    }

    if (actualCallback) {
      setTimeout(() => actualCallback!(err, row), 0);
    }
  }

  all(query: string, params?: any[] | ((err: any, rows: any[]) => void), callback?: (err: any, rows: any[]) => void) {
    let actualParams: any[] = [];
    let actualCallback = callback;

    if (typeof params === 'function') {
      actualCallback = params as any;
      actualParams = [];
    } else if (Array.isArray(params)) {
      actualParams = params;
    }

    const lowerQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');

    let rows: any[] = [];
    let err = null;

    try {
      if (lowerQuery.startsWith('select * from settings')) {
        rows = this.data.settings;
      } else if (lowerQuery.startsWith('select * from document_types')) {
        rows = this.data.document_types;
      } else if (lowerQuery.startsWith('select * from storage_locations')) {
        rows = this.data.storage_locations;
      } else if (lowerQuery.startsWith('select id, username, role, full_name, created_at from users')) {
        rows = this.data.users.map(u => ({
          id: u.id,
          username: u.username,
          role: u.role,
          full_name: u.full_name,
          department_id: u.department_id || null,
          created_at: u.created_at
        }));
      } else if (lowerQuery.startsWith('select * from departments')) {
        rows = this.data.departments;
      } else if (lowerQuery.startsWith('select r.*, u.full_name as requested_by_name, d.title as doc_title, d.number as doc_number from edit_requests')) {
        rows = [...this.data.edit_requests]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .map(r => {
            const user = this.data.users.find(u => u.id === r.requested_by);
            const doc = this.data.documents.find(d => d.id === r.document_id);
            return {
              ...r,
              requested_by_name: user ? user.full_name : 'Không rõ',
              doc_title: doc ? doc.title : null,
              doc_number: doc ? doc.number : null
            };
          });
      } else if (lowerQuery.startsWith('select w.*, u.full_name as user_name from workflow')) {
        const docId = Number(actualParams[0]);
        const entries = this.data.workflow.filter(w => w.document_id === docId);
        rows = entries.map(w => {
          const user = this.data.users.find(u => u.id === w.assigned_to);
          return {
            ...w,
            user_name: user ? user.full_name : 'Hệ thống'
          };
        }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      } else if (lowerQuery.startsWith('select w.*, u.full_name as user_name, d.title as doc_title, d.number as doc_number from workflow')) {
        rows = [...this.data.workflow]
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .map(w => {
            const user = this.data.users.find(u => u.id === w.assigned_to);
            const doc = this.data.documents.find(d => d.id === w.document_id);
            return {
              ...w,
              user_name: user ? user.full_name : 'Hệ thống',
              doc_title: doc ? doc.title : null,
              doc_number: doc ? doc.number : null
            };
          });
      } else if (lowerQuery.startsWith('select * from documents where 1=1')) {
        let filtered = [...this.data.documents];
        let paramIdx = 0;

        if (query.includes('AND type = ?')) {
          const typeVal = actualParams[paramIdx++];
          filtered = filtered.filter(d => d.type === typeVal);
        }
        if (query.includes('AND status = ?')) {
          const statusVal = actualParams[paramIdx++];
          filtered = filtered.filter(d => d.status === statusVal);
        }
        if (query.includes('AND (title LIKE ? OR number LIKE ? OR ocr_text LIKE ?)')) {
          const kwPattern = actualParams[paramIdx++];
          paramIdx++;
          paramIdx++;
          const kw = kwPattern.replace(/%/g, '').toLowerCase();
          filtered = filtered.filter(d => 
            (d.title && d.title.toLowerCase().includes(kw)) ||
            (d.number && d.number.toLowerCase().includes(kw)) ||
            (d.ocr_text && d.ocr_text.toLowerCase().includes(kw))
          );
        }

        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        rows = filtered;
      } else {
        console.warn('Unhandled ALL query:', query);
      }
    } catch (e: any) {
      err = e;
    }

    if (actualCallback) {
      setTimeout(() => actualCallback!(err, rows), 0);
    }
  }

  prepare(query: string) {
    const self = this;
    return {
      run(params: any[], callback?: (err: any) => void) {
        self.run(query, params, callback);
      },
      finalize(callback?: (err: any) => void) {
        if (callback) {
          setTimeout(() => callback(null), 0);
        }
      }
    };
  }
}

const dbInstance = new JSONDatabase();

export default dbInstance;
