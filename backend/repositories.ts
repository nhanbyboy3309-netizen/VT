import db from './db.js';

export class DocumentRepository {
  static async getAll(filters: any = {}) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM documents WHERE 1=1';
      const params: any[] = [];

      if (filters.type) {
        query += ' AND type = ?';
        params.push(filters.type);
      }
      if (filters.status) {
        query += ' AND status = ?';
        params.push(filters.status);
      }
      if (filters.keyword) {
        query += ' AND (title LIKE ? OR number LIKE ? OR ocr_text LIKE ?)';
        const k = `%${filters.keyword}%`;
        params.push(k, k, k);
      }

      query += ' ORDER BY created_at DESC';

      db.all(query, params, (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows.map(mapDocumentRow));
      });
    });
  }

  static async getById(id: number) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM documents WHERE id = ?', [id], (err, row: any) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else resolve(mapDocumentRow(row));
      });
    });
  }

  static async create(doc: any) {
    return new Promise((resolve, reject) => {
      const payload = {
        number: doc.number,
        title: doc.title,
        type: doc.type,
        sender: doc.sender,
        receiver: doc.receiver,
        date_issued: doc.dateIssued,
        received_date: doc.receivedDate,
        expiry_date: doc.expiryDate,
        physical_location: doc.physicalLocation,
        digital_location: doc.digitalLocation,
        status: doc.status,
        file_path: doc.file_path,
        ocr_text: doc.ocr_text,
        confidentiality: doc.confidentiality || 'Thường',
        retention_period: doc.retentionPeriod || 'Vĩnh viễn',
        version: doc.version || '1.0',
        iso_status: doc.isoStatus || 'Đang hiệu lực',
        department_id: doc.departmentId || null,
        created_by: doc.createdBy || null,
        editable_until: doc.editableUntil || null,
        unlocked_until: doc.unlockedUntil || null,
        partner_abbreviation: doc.partnerAbbreviation,
        physical_destroyed: false,
        physical_destroyed_at: null,
        physical_destroyed_by: null
      };

      db.run('INSERT INTO documents', [payload], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  static async update(id: number, doc: any) {
    return new Promise((resolve, reject) => {
      // Map frontend camelCase to backend snake_case if necessary
      const mappedDoc: any = {};
      const keyMap: any = {
        dateIssued: 'date_issued',
        receivedDate: 'received_date',
        expiryDate: 'expiry_date',
        physicalLocation: 'physical_location',
        digitalLocation: 'digital_location',
        retentionPeriod: 'retention_period',
        isoStatus: 'iso_status',
        fileUrl: 'file_path',
        ocrText: 'ocr_text',
        departmentId: 'department_id',
        createdBy: 'created_by',
        editableUntil: 'editable_until',
        unlockedUntil: 'unlocked_until',
        partnerAbbreviation: 'partner_abbreviation',
        physicalDestroyed: 'physical_destroyed',
        physicalDestroyedAt: 'physical_destroyed_at',
        physicalDestroyedBy: 'physical_destroyed_by'
      };

      for (const [key, value] of Object.entries(doc)) {
        const dbKey = keyMap[key] || key;
        mappedDoc[dbKey] = value;
      }

      const fields = Object.keys(mappedDoc).map(key => `${key} = ?`).join(', ');
      const params = [...Object.values(mappedDoc), id];
      const query = `UPDATE documents SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

      db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  static async delete(id: number) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM documents WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
}

function mapDocumentRow(row: any) {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    type: row.type,
    sender: row.sender,
    receiver: row.receiver,
    dateIssued: row.date_issued,
    receivedDate: row.received_date,
    expiryDate: row.expiry_date,
    physicalLocation: row.physical_location,
    digitalLocation: row.digital_location,
    status: row.status,
    fileUrl: row.file_path,
    ocrText: row.ocr_text,
    versions: row.versions || [],
    confidentiality: row.confidentiality || 'Thường',
    retentionPeriod: row.retention_period || 'Vĩnh viễn',
    version: row.version || '1.0',
    isoStatus: row.iso_status || 'Đang hiệu lực',
    departmentId: row.department_id || null,
    createdBy: row.created_by || null,
    editableUntil: row.editable_until || null,
    unlockedUntil: row.unlocked_until || null,
    partnerAbbreviation: row.partner_abbreviation,
    physicalDestroyed: !!row.physical_destroyed,
    physicalDestroyedAt: row.physical_destroyed_at || null,
    physicalDestroyedBy: row.physical_destroyed_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class UserRepository {
  static async getByUsername(username: string) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ?', [username], (err, row: any) => {
        if (err) reject(err);
        else resolve(row ? { ...row, departmentId: row.department_id || null } : row);
      });
    });
  }

  static async create(user: any) {
    return new Promise((resolve, reject) => {
      const payload = {
        username: user.username,
        password: user.password,
        role: user.role,
        full_name: user.full_name,
        department_id: user.departmentId || null
      };
      db.run('INSERT INTO users', [payload], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  static async getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT id, username, role, full_name, created_at FROM users', [], (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows.map(r => ({ ...r, departmentId: r.department_id || null })));
      });
    });
  }

  static async delete(id: any) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
}

export class WorkflowRepository {
  static async getByDocumentId(documentId: number) {
    return new Promise((resolve, reject) => {
      db.all('SELECT w.*, u.full_name as user_name FROM workflow w LEFT JOIN users u ON w.assigned_to = u.id WHERE document_id = ? ORDER BY timestamp ASC', [documentId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async create(entry: any) {
    return new Promise((resolve, reject) => {
      const { document_id, assigned_to, action, status, comment } = entry;
      db.run('INSERT INTO workflow (document_id, assigned_to, action, status, comment) VALUES (?, ?, ?, ?, ?)', [Number(document_id), assigned_to, action, status, comment], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  static async getRecent(limit = 8) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT w.*, u.full_name as user_name, d.title as doc_title, d.number as doc_number FROM workflow w LEFT JOIN users u ON w.assigned_to = u.id LEFT JOIN documents d ON w.document_id = d.id ORDER BY timestamp DESC',
        [],
        (err, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows.slice(0, limit));
        }
      );
    });
  }
}

export class SettingsRepository {
  static async getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM settings', [], (err, rows: any[]) => {
        if (err) reject(err);
        else {
          const settings: any = {};
          rows.forEach(row => {
            try {
              settings[row.key] = JSON.parse(row.value);
            } catch {
              settings[row.key] = row.value;
            }
          });
          resolve(settings);
        }
      });
    });
  }

  static async update(key: string, value: any) {
    return new Promise((resolve, reject) => {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, stringValue], function(err) {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  static async updateBatch(settings: any) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(settings)) {
          const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
          stmt.run([key, stringValue]);
        }
        stmt.finalize();
        db.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });
    });
  }
}

export class DocumentTypeRepository {
  static async getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM document_types', [], (err, rows: any[]) => {
        if (err) reject(err);
        else {
          const mapped = rows.map(row => ({
            id: row.id,
            label: row.label,
            prefix: row.prefix,
            defaultFolder: row.default_folder,
            storagePath: row.storage_path,
            idSyntax: row.id_syntax,
            lastSequence: row.last_sequence,
            departmentId: row.department_id || null
          }));
          resolve(mapped);
        }
      });
    });
  }

  static async create(type: any) {
    return new Promise((resolve, reject) => {
      const payload = {
        id: type.id,
        label: type.label,
        prefix: type.prefix,
        default_folder: type.defaultFolder,
        storage_path: type.storagePath,
        id_syntax: type.idSyntax,
        last_sequence: type.lastSequence || 0,
        department_id: type.departmentId || null
      };
      db.run('INSERT INTO document_types', [payload], function(err) {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  static async update(id: string, type: any) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const params = [];
      const mapping: any = {
        label: 'label',
        prefix: 'prefix',
        defaultFolder: 'default_folder',
        storagePath: 'storage_path',
        idSyntax: 'id_syntax',
        lastSequence: 'last_sequence',
        departmentId: 'department_id'
      };

      for (const [key, dbKey] of Object.entries(mapping)) {
        if (type[key] !== undefined) {
          fields.push(`${dbKey} = ?`);
          params.push(type[key]);
        }
      }

      if (fields.length === 0) return resolve(true);

      params.push(id);
      db.run(`UPDATE document_types SET ${fields.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  static async delete(id: string) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM document_types WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }
}

export class StorageLocationRepository {
  static async getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM storage_locations', [], (err, rows: any[]) => {
        if (err) reject(err);
        else {
          const mapped = rows.map(row => ({
            id: row.id,
            name: row.name,
            parentId: row.parent_id || null,
            departmentId: row.department_id || null
          }));
          resolve(mapped);
        }
      });
    });
  }

  static async create(node: any) {
    return new Promise((resolve, reject) => {
      const { id, name, parentId, departmentId } = node;
      db.run('INSERT INTO storage_locations (id, name, parent_id, department_id) VALUES (?, ?, ?, ?)',
        [id, name, parentId || null, departmentId || null],
        function(err) {
          if (err) reject(err);
          else resolve(true);
        }
      );
    });
  }

  static async update(id: string, node: any) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const params = [];
      if (node.name !== undefined) { fields.push('name = ?'); params.push(node.name); }
      if (node.parentId !== undefined) { fields.push('parent_id = ?'); params.push(node.parentId); }
      if (node.departmentId !== undefined) { fields.push('department_id = ?'); params.push(node.departmentId); }

      if (fields.length === 0) return resolve(true);

      params.push(id);
      db.run(`UPDATE storage_locations SET ${fields.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  static async delete(id: string) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM storage_locations WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }
}

export class DepartmentRepository {
  static async getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM departments', [], (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows.map(r => ({ id: r.id, name: r.name })));
      });
    });
  }

  static async create(dept: any) {
    return new Promise((resolve, reject) => {
      db.run('INSERT INTO departments', [{ id: dept.id, name: dept.name }], function(err) {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  static async update(id: string, dept: any) {
    return new Promise((resolve, reject) => {
      if (dept.name === undefined) return resolve(true);
      db.run('UPDATE departments SET name = ? WHERE id = ?', [dept.name, id], function(err) {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  static async delete(id: string) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM departments WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }
}

export class EditRequestRepository {
  static async getAll() {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT r.*, u.full_name as requested_by_name, d.title as doc_title, d.number as doc_number FROM edit_requests r LEFT JOIN users u ON r.requested_by = u.id LEFT JOIN documents d ON r.document_id = d.id',
        [],
        (err, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows.map(mapEditRequestRow));
        }
      );
    });
  }

  static async getById(id: number) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM edit_requests WHERE id = ?', [id], (err, row: any) => {
        if (err) reject(err);
        else resolve(row ? mapEditRequestRow(row) : null);
      });
    });
  }

  static async create(req: any) {
    return new Promise((resolve, reject) => {
      db.run('INSERT INTO edit_requests', [{
        document_id: req.documentId,
        requested_by: req.requestedBy,
        reason: req.reason
      }], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  static async resolve(id: number, status: 'approved' | 'rejected', resolvedBy: number) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE edit_requests SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?',
        [status, new Date().toISOString(), resolvedBy, id],
        function(err) {
          if (err) reject(err);
          else resolve(true);
        }
      );
    });
  }
}

function mapEditRequestRow(row: any) {
  return {
    id: row.id,
    documentId: row.document_id,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    docTitle: row.doc_title,
    docNumber: row.doc_number,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by
  };
}
