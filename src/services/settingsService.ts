import { SystemSettings, StorageFolder } from '../types';
import { apiService } from './apiService';

const getHeaders = (isJson = true) => {
  const token = localStorage.getItem('token');
  const headers: any = {
    'Authorization': `Bearer ${token}`
  };
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
};

export const subscribeToSettings = (callback: (settings: SystemSettings) => void) => {
  const fetchSettings = async () => {
    try {
      const response = await fetch(`${apiService.API_URL}/settings`, { 
        headers: getHeaders() 
      });
      if (response.ok) {
        const data = await response.json();
        callback(data);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  fetchSettings();
  const interval = setInterval(fetchSettings, 30000);
  return () => clearInterval(interval);
};

export const updateSettings = async (settings: Partial<SystemSettings>) => {
  const response = await fetch(`${apiService.API_URL}/settings`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(settings)
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Lỗi khi cập nhật cấu hình');
  }
};

export const addStorageFolder = async (folder: StorageFolder) => {
  const response = await fetch(`${apiService.API_URL}/settings/storage-folders`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(folder)
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Không thể thêm thư mục lưu trữ');
  return await response.json();
};

export const updateStorageFolder = async (id: string, data: Partial<StorageFolder>) => {
  const response = await fetch(`${apiService.API_URL}/settings/storage-folders/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Không thể cập nhật thư mục lưu trữ');
  return await response.json();
};

export const deleteStorageFolder = async (id: string) => {
  const response = await fetch(`${apiService.API_URL}/settings/storage-folders/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Không thể xóa thư mục lưu trữ');
};

export const uploadLogoToServer = async (file: File) => {
  const formData = new FormData();
  formData.append('logo', file);

  const response = await fetch(`${apiService.API_URL}/settings/logo`, {
    method: 'POST',
    headers: getHeaders(false),
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Lỗi khi tải logo lên');
  }

  const { logoUrl } = await response.json();
  return logoUrl;
};
