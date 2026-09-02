const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:';
const API_URL = isElectron ? 'http://localhost:3002/api' : '/api';
const STORAGE_URL = isElectron ? 'http://localhost:3002' : '';

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export const apiService = {
  async login(username, password) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) throw new Error('Login failed');
    const data = await res.json();
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  },

  async logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  async getDocuments(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    const res = await fetch(`${API_URL}/documents?${query}`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch documents');
    return await res.json();
  },

  async getDocument(id) {
    const res = await fetch(`${API_URL}/documents/${id}`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch document');
    return await res.json();
  },

  async createDocument(docData, file) {
    const formData = new FormData();
    formData.append('data', JSON.stringify(docData));
    if (file) {
      formData.append('file', file);
    }

    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/documents`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: formData
    });
    if (!res.ok) throw new Error('Failed to create document');
    return await res.json();
  },
  async importDocuments(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/documents/import`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: formData
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Failed to import documents');
    }
    return await res.json();
  },

  async updateStatus(id, status, comment) {
    const res = await fetch(`${API_URL}/documents/${id}/status`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ status, comment })
    });
    if (!res.ok) throw new Error('Failed to update status');
    return await res.json();
  },

  async updateDocument(id, data, reason, file?: File) {
    const formData = new FormData();
    formData.append('data', JSON.stringify(data));
    formData.append('reason', reason || '');
    if (file) {
      formData.append('file', file);
    }

    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/documents/${id}`, {
      method: 'PATCH',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: formData
    });
    if (!res.ok) throw new Error('Failed to update document');
    return await res.json();
  },

  async getStats() {
    const res = await fetch(`${API_URL}/dashboard/stats`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch stats');
    return await res.json();
  },

  async triggerScan() {
    const res = await fetch(`${API_URL}/scan/trigger`, {
      method: 'POST',
      headers: getHeaders()
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Failed to trigger scan');
    }
    return await res.json();
  },

  async getUsers() {
    const res = await fetch(`${API_URL}/users`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch users');
    return await res.json();
  },

  async registerUser(userData) {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(userData)
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Failed to register user');
    }
    return await res.json();
  },

  async deleteDocument(id) {
    const res = await fetch(`${API_URL}/documents/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error((await res.json()).message || 'Failed to delete document');
    return await res.json();
  },

  async markDocumentDestroyed(id) {
    const res = await fetch(`${API_URL}/documents/${id}/destroy`, {
      method: 'PATCH',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error((await res.json()).message || 'Failed to mark document destroyed');
    return await res.json();
  },

  async deleteUser(id) {
    const res = await fetch(`${API_URL}/users/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete user');
    return await res.json();
  },
  async getQRScanDetails(qrType: string, qrId: string) {
    // Sent even though this endpoint doesn't require login: it's how the server
    // knows to include Mật/Tối mật documents for staff who are actually signed in,
    // while anonymous scans (e.g. a warehouse label) only ever see public ones.
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/public/qr-scan?qrType=${encodeURIComponent(qrType)}&qrId=${encodeURIComponent(qrId)}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error('Không thể tải thông tin từ mã QR');
    return await res.json();
  },
  getFileUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${STORAGE_URL}${cleanPath}`;
  },
  async browseFolders(dirPath?: string) {
    const query = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
    const res = await fetch(`${API_URL}/system/browse-folders${query}`, { headers: getHeaders() });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Không thể tải danh sách thư mục');
    }
    return await res.json();
  },
  async createFolder(parentPath: string, name: string) {
    const res = await fetch(`${API_URL}/system/create-folder`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ parentPath, name })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Không thể tạo thư mục');
    }
    return await res.json();
  },
  API_URL
};
