import { Document, DocumentTypeConfig } from '../types';
import { apiService } from './apiService';

// Since it's local, we can just fetch once or use a simple interval
export const subscribeToDocumentTypes = (callback: (types: DocumentTypeConfig[]) => void) => {
  const fetchTypes = async () => {
    try {
      const response = await fetch(`${apiService.API_URL}/settings/document-types`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const types = await response.json();
        callback(types);
      }
    } catch (err) {
      console.error('Error fetching document types:', err);
    }
  };
  fetchTypes();
  const interval = setInterval(fetchTypes, 10000);
  return () => clearInterval(interval);
};

export const addDocumentType = async (type: DocumentTypeConfig) => {
  const response = await fetch(`${apiService.API_URL}/settings/document-types`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify(type)
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Failed to add document type');
};

export const updateDocumentType = async (id: string, type: Partial<DocumentTypeConfig>) => {
  const response = await fetch(`${apiService.API_URL}/settings/document-types/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify(type)
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Failed to update document type');
};

export const deleteDocumentType = async (id: string) => {
  const response = await fetch(`${apiService.API_URL}/settings/document-types/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Failed to delete document type');
};

export const subscribeToDocuments = (callback: (docs: Document[]) => void) => {
  const fetchDocs = async () => {
    try {
      const docs = await apiService.getDocuments();
      callback(docs);
    } catch (err) {
      console.error(err);
    }
  };
  fetchDocs();
  const interval = setInterval(fetchDocs, 5000);
  return () => clearInterval(interval);
};

export const getPreviewId = async (typeId: string, partnerAbbreviation?: string): Promise<string> => {
  try {
    const response = await fetch(`${apiService.API_URL}/settings/document-types/${typeId}/next-number`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      let nextId = data.nextNumber;
      if (partnerAbbreviation) {
        nextId = `${nextId}-${partnerAbbreviation}`;
      }
      return nextId;
    }
    throw new Error('Failed to fetch next number');
  } catch (err) {
    console.error('Error generating preview ID:', err);
    // Fallback logic
    const now = new Date();
    return `${typeId}/${Date.now().toString().slice(-4)}/${now.getFullYear()}`;
  }
};

export const createDocument = async (docData: any, userName: string, file?: File) => {
  return await apiService.createDocument(docData, file);
};

export const updateDocument = async (id: string, docData: any, userId: string, userName: string, reason?: string, file?: File) => {
  return await apiService.updateDocument(id, docData, reason, file);
};

export const deleteDocument = async (id: string | number) => {
  return await apiService.deleteDocument(id);
};
