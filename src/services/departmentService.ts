import { Department } from '../types';
import { apiService } from './apiService';

export const subscribeToDepartments = (callback: (departments: Department[]) => void) => {
  const fetchDepartments = async () => {
    try {
      const response = await fetch(`${apiService.API_URL}/settings/departments`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        callback(await response.json());
      }
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  };
  fetchDepartments();
  const interval = setInterval(fetchDepartments, 15000);
  return () => clearInterval(interval);
};

export const addDepartment = async (name: string) => {
  const response = await fetch(`${apiService.API_URL}/settings/departments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({ name })
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Không thể thêm phòng ban');
  return await response.json();
};

export const renameDepartment = async (id: string, name: string) => {
  const response = await fetch(`${apiService.API_URL}/settings/departments/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({ name })
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Không thể đổi tên phòng ban');
};

export const deleteDepartment = async (id: string) => {
  const response = await fetch(`${apiService.API_URL}/settings/departments/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Không thể xóa phòng ban');
};
