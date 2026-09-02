import { StorageLocationNode } from '../types';
import { apiService } from './apiService';

export const subscribeToStorageLocations = (callback: (nodes: StorageLocationNode[]) => void) => {
  const fetchNodes = async () => {
    try {
      const response = await fetch(`${apiService.API_URL}/settings/storage-locations`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const nodes = await response.json();
        callback(nodes);
      }
    } catch (err) {
      console.error('Error fetching storage locations:', err);
    }
  };
  fetchNodes();
  const interval = setInterval(fetchNodes, 10000);
  return () => clearInterval(interval);
};

export const addStorageLocation = async (name: string, parentId?: string | null, departmentId?: string | null) => {
  const response = await fetch(`${apiService.API_URL}/settings/storage-locations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({ name, parentId: parentId || null, departmentId: departmentId || null })
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Không thể thêm vị trí lưu trữ');
  return await response.json();
};

export const updateStorageLocation = async (id: string, data: Partial<StorageLocationNode>) => {
  const response = await fetch(`${apiService.API_URL}/settings/storage-locations/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Không thể cập nhật vị trí lưu trữ');
};

export const deleteStorageLocation = async (id: string) => {
  const response = await fetch(`${apiService.API_URL}/settings/storage-locations/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Không thể xóa vị trí lưu trữ (có thể còn vị trí con)');
};
