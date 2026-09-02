import { EditRequest } from '../types';
import { apiService } from './apiService';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('token')}`
});

export const subscribeToEditRequests = (callback: (requests: EditRequest[]) => void) => {
  const fetchRequests = async () => {
    try {
      const response = await fetch(`${apiService.API_URL}/edit-requests`, { headers: getHeaders() });
      if (response.ok) {
        callback(await response.json());
      }
    } catch (err) {
      console.error('Error fetching edit requests:', err);
    }
  };
  fetchRequests();
  const interval = setInterval(fetchRequests, 10000);
  return () => clearInterval(interval);
};

export const createEditRequest = async (documentId: number | string, reason: string) => {
  const response = await fetch(`${apiService.API_URL}/edit-requests`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ documentId, reason })
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Không thể gửi yêu cầu chỉnh sửa');
  return await response.json();
};

export const resolveEditRequest = async (id: number, approve: boolean) => {
  const response = await fetch(`${apiService.API_URL}/edit-requests/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ approve })
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Không thể xử lý yêu cầu');
};
