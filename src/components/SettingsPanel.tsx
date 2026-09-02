import React, { useState, useEffect } from 'react';
import { subscribeToSettings, updateSettings, uploadLogoToServer, addStorageFolder, updateStorageFolder, deleteStorageFolder } from '../services/settingsService';
import { subscribeToDocumentTypes, addDocumentType, updateDocumentType, deleteDocumentType } from '../services/documentService';
import { subscribeToStorageLocations, addStorageLocation, updateStorageLocation, deleteStorageLocation } from '../services/storageLocationService';
import { subscribeToDepartments, addDepartment, renameDepartment, deleteDepartment } from '../services/departmentService';
import { subscribeToEditRequests, resolveEditRequest } from '../services/editRequestService';
import { SystemSettings, DocumentTypeConfig, StorageLocationNode, Department, EditRequest } from '../types';
import {
  Settings as SettingsIcon,
  Save,
  Info,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Hash,
  Type,
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Folder,
  FolderSearch,
  Tag,
  Image as ImageIcon,
  HardDrive,
  Archive,
  Warehouse,
  Pencil,
  X,
  Users,
  Building2,
  ClipboardCheck,
  Clock,
  Check
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

import UserManagement from './UserManagement';
import FolderPickerModal from './FolderPickerModal';

const CURRENT_USER = JSON.parse(localStorage.getItem('user') || '{}');

export default function SettingsPanel() {
  const isAdmin = CURRENT_USER.role === 'Admin';
  // Every non-Admin role now gets full rights over their own department —
  // this is a department-membership check, not a separate privilege tier.
  const isManager = !isAdmin && !!CURRENT_USER.departmentId;

  const [activeTab, setActiveTab] = useState<'system' | 'doctypes' | 'departments' | 'users' | 'approvals'>('system');
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [docTypes, setDocTypes] = useState<DocumentTypeConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderLoc, setNewFolderLoc] = useState('');
  const [newFolderDept, setNewFolderDept] = useState<string>('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [editingFolderLoc, setEditingFolderLoc] = useState('');

  // Which text field a folder-browser popup is currently picking a value for
  const [folderPickerTarget, setFolderPickerTarget] = useState<'storageRoot' | 'scanFolder' | 'storagePath' | null>(null);

  // Hierarchical storage locations: Kho (cấp 1) > Tủ (cấp 2) > Ngăn/Hộc (cấp 3)
  const [storageLocations, setStorageLocations] = useState<StorageLocationNode[]>([]);
  const [newTopLocationName, setNewTopLocationName] = useState('');
  // Admin picks which department a new Kho belongs to (or leaves it as the
  // shared/company-wide tree); a manager can only ever create within their own.
  const [newTopLocationDept, setNewTopLocationDept] = useState<string>('');

  // New Type Form State
  const [isAddingType, setIsAddingType] = useState(false);
  const [editingType, setEditingType] = useState<DocumentTypeConfig | null>(null);
  const [newType, setNewType] = useState<DocumentTypeConfig>({
    id: '',
    label: '',
    prefix: '',
    defaultFolder: '',
    storagePath: '',
    idSyntax: '',
    lastSequence: 0,
    departmentId: isManager ? CURRENT_USER.departmentId : ''
  });

  // Departments (Admin only)
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editingDeptName, setEditingDeptName] = useState('');

  // Edit-request approval queue (Admin only)
  const [editRequests, setEditRequests] = useState<EditRequest[]>([]);

  const handleAddFolder = async () => {
    if (!newFolderName.trim() || !newFolderLoc.trim() || !settings) return;
    const folders = settings.storageFolders || [];
    const folderId = newFolderName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^a-z0-9]+/g, '_');
    
    if (folders.some(f => f.id === folderId)) {
      alert('Thư mục này đã tồn tại!');
      return;
    }
    
    const departmentId = isManager ? CURRENT_USER.departmentId : (newFolderDept || null);
    try {
      const saved = await addStorageFolder({ id: folderId, name: newFolderName.trim(), physicalLocation: newFolderLoc.trim(), departmentId });
      setSettings({ ...settings, storageFolders: [...folders, saved] });
      setNewFolderName('');
      setNewFolderLoc('');
    } catch (error: any) {
      alert(error?.message || 'Lỗi khi thêm thư mục lưu trữ.');
    }
  };

  const handleRemoveFolder = async (id: string) => {
    if (!settings) return;
    if (!confirm('Xóa thư mục lưu trữ này?')) return;
    try {
      await deleteStorageFolder(id);
      setSettings({ ...settings, storageFolders: (settings.storageFolders || []).filter(f => f.id !== id) });
    } catch (error: any) {
      alert(error?.message || 'Lỗi khi xóa thư mục lưu trữ.');
    }
  };

  const handleSaveFolderEdit = async (id: string) => {
    if (!settings) return;
    if (!editingFolderName.trim() || !editingFolderLoc.trim()) { setEditingFolderId(null); return; }
    try {
      const updated = await updateStorageFolder(id, { name: editingFolderName.trim(), physicalLocation: editingFolderLoc.trim() });
      setSettings({
        ...settings,
        storageFolders: (settings.storageFolders || []).map(f => f.id === id ? updated : f)
      });
    } catch (error: any) {
      alert(error?.message || 'Lỗi khi cập nhật thư mục lưu trữ.');
    } finally {
      setEditingFolderId(null);
    }
  };

  useEffect(() => {
    const unsubSettings = subscribeToSettings(setSettings);
    const unsubTypes = subscribeToDocumentTypes(setDocTypes);
    const unsubLocations = subscribeToStorageLocations(setStorageLocations);
    const unsubDepartments = subscribeToDepartments(setDepartments);
    const unsubEditRequests = isAdmin ? subscribeToEditRequests(setEditRequests) : undefined;
    return () => {
      unsubSettings();
      unsubTypes();
      unsubLocations();
      unsubDepartments();
      unsubEditRequests?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddTopLocation = async () => {
    // Creating a Kho (root) is Admin-only — a department only adds Tủ/Ngăn
    // inside a Kho Admin has already assigned to them.
    if (!isAdmin || !newTopLocationName.trim()) return;
    try {
      const deptId = newTopLocationDept || null;
      await addStorageLocation(newTopLocationName.trim(), null, deptId);
      setNewTopLocationName('');
    } catch (error: any) {
      alert(error?.message || 'Lỗi khi thêm Kho.');
    }
  };

  const handleAddDepartment = async () => {
    if (!newDepartmentName.trim()) return;
    try {
      await addDepartment(newDepartmentName.trim());
      setNewDepartmentName('');
    } catch (error: any) {
      alert(error?.message || 'Lỗi khi thêm phòng ban.');
    }
  };

  const handleRenameDepartment = async (id: string) => {
    if (!editingDeptName.trim()) { setEditingDeptId(null); return; }
    try {
      await renameDepartment(id, editingDeptName.trim());
    } catch (error: any) {
      alert(error?.message || 'Lỗi khi đổi tên phòng ban.');
    } finally {
      setEditingDeptId(null);
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    if (!confirm('Xóa phòng ban này? Tài khoản, loại văn bản và vị trí lưu trữ đang gán cho phòng ban này sẽ chuyển về trạng thái chưa gán.')) return;
    try {
      await deleteDepartment(id);
    } catch (error: any) {
      alert(error?.message || 'Lỗi khi xóa phòng ban.');
    }
  };

  const handleResolveEditRequest = async (id: number, approve: boolean) => {
    try {
      await resolveEditRequest(id, approve);
    } catch (error: any) {
      alert(error?.message || 'Lỗi khi xử lý yêu cầu.');
    }
  };

  const handleAddLocationNode = async (parentId: string, name: string) => {
    if (!name.trim()) return;
    try {
      await addStorageLocation(name.trim(), parentId);
    } catch (error) {
      alert('Lỗi khi thêm vị trí con.');
    }
  };

  const handleRenameLocationNode = async (id: string, name: string) => {
    if (!name.trim()) return;
    try {
      await updateStorageLocation(id, { name: name.trim() });
    } catch (error) {
      alert('Lỗi khi đổi tên vị trí.');
    }
  };

  const handleDeleteLocationNode = async (id: string, hasChildren: boolean) => {
    const msg = hasChildren
      ? 'Vị trí này có chứa các vị trí con bên trong. Xóa sẽ xóa luôn toàn bộ vị trí con. Tiếp tục?'
      : 'Bạn có chắc chắn muốn xóa vị trí này?';
    if (!confirm(msg)) return;
    try {
      await deleteStorageLocation(id);
    } catch (error) {
      alert('Lỗi khi xóa vị trí lưu trữ.');
    }
  };

  // Admin-only: assign (or reassign) which department a Kho belongs to,
  // independent of when it was created.
  const handleReassignLocationDepartment = async (id: string, departmentId: string) => {
    try {
      await updateStorageLocation(id, { departmentId: departmentId || null });
    } catch (error: any) {
      alert(error?.message || 'Lỗi khi gán phòng ban cho Kho.');
    }
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!settings) return;
    setLoading(true);
    try {
      await updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error updating settings:', error);
      alert('Lỗi khi lưu cấu hình.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings) return;

    setLoading(true);
    try {
      console.log('Starting logo upload...', file.name);
      const url = await uploadLogoToServer(file);
      console.log('Logo uploaded successfully, URL:', url);
      
      const updatedSettings = { ...settings, logoUrl: url };
      setSettings(updatedSettings);
      
      // Persist immediately to Firestore
      await updateSettings(updatedSettings);
      console.log('Settings updated in Firestore with new logo URL');
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      alert(`Lỗi khi tải logo lên: ${error.message || 'Lỗi không xác định'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddType = async () => {
    if (!newType.id || !newType.label || !newType.prefix) {
      alert('Vui lòng điền đầy đủ thông tin loại văn bản.');
      return;
    }
    if (isManager && !newType.departmentId) {
      alert('Có lỗi xác định phòng ban của bạn. Vui lòng đăng nhập lại.');
      return;
    }
    setLoading(true);
    try {
      await addDocumentType({ ...newType, departmentId: newType.departmentId || null });
      setNewType({ id: '', label: '', prefix: '', defaultFolder: '', storagePath: '', idSyntax: '', lastSequence: 0, departmentId: isManager ? CURRENT_USER.departmentId : '' });
      setIsAddingType(false);
    } catch (error: any) {
      console.error('Error adding type:', error);
      alert(error?.message || 'Lỗi khi thêm loại văn bản.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateType = async () => {
    if (!editingType) return;
    if (!editingType.label || !editingType.prefix) {
      alert('Vui lòng điền đầy đủ thông tin.');
      return;
    }
    setLoading(true);
    try {
      await updateDocumentType(editingType.id, editingType);
      setEditingType(null);
    } catch (error: any) {
      console.error('Error updating type:', error);
      alert(error?.message || 'Lỗi khi cập nhật loại văn bản.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteType = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa loại văn bản này?')) return;
    try {
      await deleteDocumentType(id);
      if (editingType?.id === id) setEditingType(null);
    } catch (error: any) {
      console.error('Error deleting type:', error);
      alert(error?.message || 'Lỗi khi xóa loại văn bản.');
    }
  };


  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
            <SettingsIcon className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Cấu hình hệ thống</h2>
            <p className="text-xs text-slate-400 font-medium tracking-wide">Tùy chỉnh quy tắc và danh mục văn bản</p>
          </div>
        </div>
        {activeTab === 'system' && isAdmin && (
          <button
            onClick={handleSaveSettings}
            disabled={loading}
            className="px-6 py-2.5 rounded-2xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-100 animate-fade-in"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Lưu tất cả cấu hình
          </button>
        )}
      </div>

      {/* Tabs navigation */}
      <div className="px-6 border-b border-slate-100 bg-slate-50/50 flex gap-2 overflow-x-auto select-none">
        {[
          { id: 'system', label: 'Cài đặt hệ thống', icon: SettingsIcon, desc: isAdmin ? 'Thương hiệu & Lưu trữ' : 'Vị trí lưu trữ phòng ban' },
          { id: 'doctypes', label: 'Quản lý loại văn bản', icon: Tag, desc: 'Loại văn bản & Vị trí' },
          ...(isAdmin ? [{ id: 'departments', label: 'Phòng ban', icon: Building2, desc: 'Đơn vị tổ chức' }] : []),
          ...(isAdmin ? [{ id: 'users', label: 'Quản lý tài khoản', icon: Users, desc: 'Phân quyền & Vai trò' }] : []),
          ...(isAdmin ? [{ id: 'approvals', label: 'Yêu cầu phê duyệt', icon: ClipboardCheck, desc: 'Chỉnh sửa quá hạn' }] : [])
        ].map((tab) => {
          const IconComponent = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2.5 py-4 px-4 border-b-2 font-bold text-xs transition-all relative whitespace-nowrap outline-none",
                isActive 
                  ? "border-blue-600 text-blue-600 bg-white shadow-sm shadow-blue-50/50" 
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
              )}
            >
              <IconComponent className={cn("w-4 h-4", isActive ? "text-blue-600" : "text-slate-400")} />
              <div className="text-left">
                <span className="block">{tab.label}</span>
                <span className={cn("block text-[9px] font-medium leading-none mt-0.5", isActive ? "text-blue-500" : "text-slate-400")}>{tab.desc}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-8 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl">
          {activeTab === 'system' && (
            <div className="space-y-12">
              {/* Branding — global, so only Admin manages it */}
              {isAdmin && (
          <section className="space-y-6">
            <div className="flex items-center gap-2 text-blue-600">
              <ImageIcon className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Nhận diện thương hiệu</h3>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Tên ứng dụng</label>
                  <input 
                    type="text"
                    value={settings.appName || ''}
                    onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                    className="w-full bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                    placeholder="Ví dụ: Văn Thư Pro"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Tên cơ quan / tổ chức</label>
                  <input 
                    type="text"
                    value={settings.orgName || ''}
                    onChange={(e) => setSettings({ ...settings, orgName: e.target.value })}
                    className="w-full bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                    placeholder="Ví dụ: Công ty IIG Việt Nam"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Logo ứng dụng</label>
                  <div className="flex items-center gap-6">
                    <div className="w-24 h-24 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group">
                      {settings.logoUrl ? (
                        <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-slate-300" />
                      )}
                      <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <span className="text-[10px] text-white font-bold uppercase">Thay đổi</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                      </label>
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] text-slate-500 leading-relaxed mb-2">Tải lên logo của doanh nghiệp để hiển thị trên toàn bộ hệ thống. Định dạng hỗ trợ: PNG, JPG, SVG.</p>
                      <input 
                        type="text"
                        value={settings.logoUrl || ''}
                        onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                        placeholder="Hoặc nhập URL logo..."
                        className="w-full bg-slate-50 border-none py-2 px-3 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
              )}

          <section className="space-y-6">
            <div className="flex items-center gap-2 text-blue-600">
              <HardDrive className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Cấu hình lưu trữ & Vị trí</h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Root path / folder structure / scan folder are org-wide — Admin only */}
              {isAdmin && (
              <div className="space-y-6">
                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Đường dẫn gốc (Root Path)</label>
                  <div className="flex gap-2 mb-2">
                    {['documents/2026', 'scans/general', 'archive'].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setSettings({ ...settings, storageRoot: preset })}
                        className="px-3 py-1 bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded-lg text-[10px] font-bold transition-all"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      list="storage-roots"
                      value={settings.storageRoot || ''}
                      onChange={(e) => setSettings({ ...settings, storageRoot: e.target.value })}
                      className="flex-1 min-w-0 bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                      placeholder="Ví dụ: documents/scans/2026"
                    />
                    <button
                      type="button"
                      onClick={() => setFolderPickerTarget('storageRoot')}
                      title="Duyệt thư mục"
                      className="shrink-0 px-4 bg-slate-900 text-white rounded-2xl text-xs font-bold uppercase flex items-center gap-1.5 hover:bg-slate-800 transition-all"
                    >
                      <FolderSearch className="w-4 h-4" /> Duyệt
                    </button>
                  </div>
                  <datalist id="storage-roots">
                    {['documents/2026', 'scans/general', 'archive', 'documents/archive', 'storage/root', 'documents/scans/2026'].map(preset => (
                      <option key={preset} value={preset} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Cấu trúc thư mục số</label>
                  <select 
                    value={settings.storageStructure || 'by_type'}
                    onChange={(e) => setSettings({ ...settings, storageStructure: e.target.value as any })}
                    className="w-full bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500/10 outline-none transition-all appearance-none"
                  >
                    <option value="flat">Tất cả trong thư mục gốc (Flat)</option>
                    <option value="by_type">Phân loại theo loại văn bản (Root/Type/File)</option>
                    <option value="by_year">Phân loại theo năm (Root/Year/File)</option>
                    <option value="by_year_type">Phân loại theo năm & loại (Root/Year/Type/File)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Thư mục quét (Scan Folder)</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1 min-w-0">
                      <Folder className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        list="scan-folders"
                        value={settings.scanFolder || ''}
                        onChange={(e) => setSettings({ ...settings, scanFolder: e.target.value })}
                        className="w-full bg-slate-50 border-none py-3 pl-12 pr-4 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                        placeholder="C:/Scans/Documents"
                      />
                      <datalist id="scan-folders">
                        {['C:/Scans/Documents', 'D:/Scans', 'documents/scans', '/var/scans', 'C:/Users/Scan/Documents'].map(preset => (
                          <option key={preset} value={preset} />
                        ))}
                      </datalist>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFolderPickerTarget('scanFolder')}
                      title="Duyệt thư mục"
                      className="shrink-0 px-4 bg-slate-900 text-white rounded-2xl text-xs font-bold uppercase flex items-center gap-1.5 hover:bg-slate-800 transition-all"
                    >
                      <FolderSearch className="w-4 h-4" /> Duyệt
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1.5 ml-1 italic">
                    * Đường dẫn thư mục nơi máy quét vật lý lưu file. Hệ thống sẽ hỗ trợ theo dõi thư mục này.
                  </p>
                </div>
              </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">
                    Vị trí lưu trữ (Kho &gt; Tủ &gt; Ngăn/Hộc)
                  </label>
                  <p className="text-[10px] text-slate-400 mb-3 font-medium leading-relaxed">
                    {isAdmin
                      ? <>Xây dựng cây vị trí giống phần mềm quản lý tài sản: Kho chứa các Tủ, mỗi Tủ chứa các Ngăn/Hộc. Chỉ Admin được tạo Kho mới và gán cho phòng ban; các cấp bên trong (Tủ, Ngăn/Hộc) đều có thể thêm, xóa, đổi tên và in mã QR riêng ở mục <b>Quản lý Mã QR</b>.</>
                      : <>Quản lý Tủ/Ngăn/Hộc bên trong Kho mà Admin đã gán cho phòng ban bạn. Việc tạo Kho mới do Admin thực hiện. In mã QR riêng cho từng vị trí ở mục <b>Quản lý Mã QR</b>.</>}
                  </p>
                  {isAdmin && (
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={newTopLocationName}
                      onChange={(e) => setNewTopLocationName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddTopLocation(); }}
                      placeholder="Thêm Kho mới (ví dụ: Kho A)..."
                      className="flex-1 bg-slate-50 border-none py-2 px-4 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/10"
                    />
                    <select
                      value={newTopLocationDept}
                      onChange={(e) => setNewTopLocationDept(e.target.value)}
                      title="Phòng ban sở hữu"
                      className="bg-slate-50 border-none rounded-xl text-[11px] font-bold px-2 outline-none focus:ring-2 focus:ring-blue-500/10 appearance-none max-w-[9rem]"
                    >
                      <option value="">Chung công ty</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddTopLocation}
                      className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  )}

                  <div className="space-y-2.5 max-h-[32rem] overflow-y-auto custom-scrollbar pr-1">
                    {storageLocations.filter(n => !n.parentId).map(top => (
                      <div key={top.id}>
                        <LocationTreeNode
                          node={top}
                          allNodes={storageLocations}
                          depth={0}
                          onAddChild={handleAddLocationNode}
                          onRename={handleRenameLocationNode}
                          onDelete={handleDeleteLocationNode}
                          departments={departments}
                          onReassignDepartment={handleReassignLocationDepartment}
                        />
                      </div>
                    ))}
                    {storageLocations.filter(n => !n.parentId).length === 0 && (
                      <p className="text-[10px] text-slate-400 italic">Chưa có Kho nào được định nghĩa.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Storage folder mapping — each entry optionally scoped to a department */}
            {(isAdmin || isManager) && (
            <div className="border-t border-slate-100 pt-6 space-y-4">
              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-500 mb-1.5 ml-1">Danh sách thư mục lưu trữ & vị trí vật lý tương ứng</label>
                <p className="text-[10px] text-slate-400 mb-4 font-medium leading-relaxed">
                  Thiết lập các thư mục lưu trữ và liên kết mỗi thư mục với một vị trí vật lý cụ thể (Ví dụ: Thư mục "Hợp đồng" nằm ở "Kho A / Tủ 1"). Khi một loại văn bản chọn thư mục lưu trữ này, vị trí vật lý sẽ tự động được áp dụng.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">Tên thư mục</label>
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Ví dụ: Công văn đi..."
                      className="w-full bg-white border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/10"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">Vị trí vật lý tương ứng</label>
                    <div className="relative">
                      <input
                        type="text"
                        list="physical-locs"
                        value={newFolderLoc}
                        onChange={(e) => setNewFolderLoc(e.target.value)}
                        placeholder="Chọn hoặc tự nhập vị trí..."
                        className="w-full bg-white border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/10"
                      />
                      <datalist id="physical-locs">
                        {storageLocations.map(loc => (
                          <option key={loc.id} value={loc.name} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    {isAdmin && (
                      <select
                        value={newFolderDept}
                        onChange={(e) => setNewFolderDept(e.target.value)}
                        title="Phòng ban sở hữu"
                        className="bg-white border border-slate-200 rounded-xl text-[11px] font-bold px-2 outline-none focus:ring-2 focus:ring-blue-500/10 appearance-none max-w-[8rem]"
                      >
                        <option value="">Chung công ty</option>
                        {departments.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={handleAddFolder}
                      className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-1 shadow-md shadow-blue-100"
                    >
                      <Plus className="w-4 h-4" />
                      Thêm thư mục
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(settings.storageFolders || []).map(folder => {
                    const canManageThisFolder = isAdmin || (isManager && folder.departmentId === CURRENT_USER.departmentId);
                    const isEditingThis = editingFolderId === folder.id;
                    return (
                    <div key={folder.id} className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between group hover:shadow-md hover:shadow-slate-50 transition-all gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                          <Folder className="w-4 h-4" />
                        </div>
                        {isEditingThis ? (
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <input
                              autoFocus
                              value={editingFolderName}
                              onChange={(e) => setEditingFolderName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveFolderEdit(folder.id); if (e.key === 'Escape') setEditingFolderId(null); }}
                              className="w-full bg-slate-50 border border-blue-200 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                            <input
                              value={editingFolderLoc}
                              onChange={(e) => setEditingFolderLoc(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveFolderEdit(folder.id); if (e.key === 'Escape') setEditingFolderId(null); }}
                              className="w-full bg-slate-50 border border-blue-200 rounded-lg px-2 py-1 text-[10px] font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </div>
                        ) : (
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-bold text-slate-800 truncate">{folder.name}</p>
                              <span className={cn(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0",
                                folder.departmentId ? "text-emerald-700 bg-emerald-50" : "text-slate-500 bg-slate-100"
                              )}>
                                {folder.departmentId ? (departments.find(d => d.id === folder.departmentId)?.name || folder.departmentId) : 'Chung công ty'}
                              </span>
                            </div>
                            <p className="text-[10px] font-medium text-slate-500">Vị trí vật lý: <span className="text-blue-600 font-bold">{folder.physicalLocation}</span></p>
                          </div>
                        )}
                      </div>
                      {canManageThisFolder && (
                        isEditingThis ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSaveFolderEdit(folder.id)}
                              className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Lưu"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingFolderId(null)}
                              className="p-1.5 text-slate-300 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Hủy"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => { setEditingFolderId(folder.id); setEditingFolderName(folder.name); setEditingFolderLoc(folder.physicalLocation); }}
                              className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Sửa"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFolder(folder.id)}
                              className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Xóa thư mục"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      )}
                    </div>
                    );
                  })}
                  {(settings.storageFolders || []).length === 0 && (
                    <p className="text-[10px] text-slate-400 italic col-span-2">Chưa cấu hình thư mục lưu trữ nào.</p>
                  )}
                </div>
              </div>
            </div>
            )}
          </section>

          {/* ID Syntax Section — global numbering default & edit-window policy: Admin only */}
          {isAdmin && (
          <section className="space-y-6">
            <div className="flex items-center gap-2 text-blue-600">
              <Hash className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Cấu trúc mã số hệ thống</h3>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Cú pháp tạo mã (Syntax)</label>
                    <input 
                      type="text"
                      value={settings.idSyntax}
                      onChange={(e) => setSettings({ ...settings, idSyntax: e.target.value })}
                      className="w-full bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                      placeholder="{TYPE}/{SEQ}/{YYYY}"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Số thứ tự hiện tại (Sequence)</label>
                    <div className="flex items-center gap-4">
                      <input 
                        type="number"
                        value={settings.lastSequence}
                        onChange={(e) => setSettings({ ...settings, lastSequence: parseInt(e.target.value) || 0 })}
                        className="w-32 bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                      />
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic">Số này sẽ tự động tăng khi có văn bản mới.</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Giờ được phép chỉnh sửa (văn bản chung công ty)</label>
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="number"
                          min={1}
                          value={settings.editWindowHours ?? 4}
                          onChange={(e) => setSettings({ ...settings, editWindowHours: parseInt(e.target.value) || 1 })}
                          className="w-32 bg-slate-50 border-none py-3 pl-11 pr-4 rounded-2xl text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic">Nhân viên lấy số từ kho văn bản chung công ty được sửa nội dung/tên trong khoảng thời gian này (hoặc tới khi có bản scan). Sau đó cần gửi yêu cầu chỉnh sửa.</p>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center gap-4">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-8 py-3 rounded-2xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-100"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Lưu cấu hình mã số
                    </button>
                    {saved && (
                      <motion.span 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-[10px] text-green-600 font-bold flex items-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Đã cập nhật
                      </motion.span>
                    )}
                  </div>
                </form>
              </div>

              <div className="bg-blue-50/50 rounded-3xl p-6 border border-blue-100/50">
                <div className="flex items-center gap-2 text-blue-800 mb-4">
                  <Info className="w-4 h-4" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Hướng dẫn cú pháp</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { tag: '{TYPE}', desc: 'Tiền tố loại văn bản (ví dụ: CV, HD)' },
                    { tag: '{YYYY}', desc: 'Năm hiện tại 4 số (2026)' },
                    { tag: '{YY}', desc: 'Năm hiện tại 2 số (26)' },
                    { tag: '{SEQ}', desc: 'Số thứ tự (tự động thêm số 0 phía trước)' },
                    { tag: '{PARTNER}', desc: 'Viết tắt tên đối tác (ví dụ: NSG)' },
                  ].map((item) => (
                    <div key={item.tag} className="flex items-center gap-3">
                      <code className="bg-white px-2 py-1 rounded-lg text-[10px] font-bold text-blue-600 border border-blue-100 shadow-sm min-w-[70px] text-center">{item.tag}</code>
                      <span className="text-[11px] text-blue-700/70 font-medium">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
          )}
          </div>
          )}

          {activeTab === 'doctypes' && (
            <div className="space-y-12">
              {/* Document Types Section */}
              <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-600">
                <Tag className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Danh mục loại văn bản</h3>
              </div>
              {(isAdmin || isManager) && (
                <button
                  onClick={() => setIsAddingType(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-bold uppercase hover:bg-blue-100 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm loại mới
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence>
                {(isAddingType || editingType) && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-6 bg-slate-50 rounded-3xl border-2 border-dashed border-blue-200 space-y-4 col-span-full"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold text-blue-600 uppercase tracking-wider">
                        {isAddingType ? 'Thêm loại văn bản mới' : `Chỉnh sửa: ${editingType?.label}`}
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">Mã ID (Duy nhất)</label>
                        <input 
                          type="text"
                          disabled={!!editingType}
                          value={isAddingType ? newType.id : editingType?.id}
                          onChange={(e) => isAddingType ? setNewType({ ...newType, id: e.target.value.toUpperCase().replace(/\s+/g, '_') }) : null}
                          placeholder="CONG_VAN"
                          className="w-full bg-white border-none py-2 px-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10 disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">Tiền tố (Prefix)</label>
                        <input 
                          type="text"
                          value={isAddingType ? newType.prefix : editingType?.prefix}
                          onChange={(e) => isAddingType ? setNewType({ ...newType, prefix: e.target.value.toUpperCase() }) : setEditingType({ ...editingType!, prefix: e.target.value.toUpperCase() })}
                          placeholder="CV"
                          className="w-full bg-white border-none py-2 px-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">Tên hiển thị</label>
                        <input
                          type="text"
                          value={isAddingType ? newType.label : editingType?.label}
                          onChange={(e) => isAddingType ? setNewType({ ...newType, label: e.target.value }) : setEditingType({ ...editingType!, label: e.target.value })}
                          placeholder="Công văn"
                          className="w-full bg-white border-none py-2 px-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">Phòng ban</label>
                        {isAdmin ? (
                          <select
                            value={(isAddingType ? newType.departmentId : editingType?.departmentId) || ''}
                            disabled={!isAddingType}
                            onChange={(e) => isAddingType && setNewType({ ...newType, departmentId: e.target.value || null })}
                            className="w-full bg-white border-none py-2 px-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10 appearance-none disabled:opacity-50"
                          >
                            <option value="">Chung công ty</option>
                            {departments.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="w-full bg-white py-2 px-3 rounded-xl text-xs font-bold text-slate-500">
                            {departments.find(d => d.id === CURRENT_USER.departmentId)?.name || 'Phòng ban của bạn'}
                          </div>
                        )}
                      </div>
                      <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50/30 p-4 rounded-2xl border border-blue-100/50">
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-blue-700 mb-1.5 ml-1">Thư mục lưu trữ</label>
                          <div className="relative">
                            <select 
                              value={isAddingType ? newType.defaultFolder || '' : editingType?.defaultFolder || ''}
                              onChange={(e) => {
                                const folderId = e.target.value;
                                const folder = settings?.storageFolders?.find(f => f.id === folderId);
                                const folderName = folder ? folder.name : '';
                                const autoPath = folderName ? `documents/${folderName}` : '';
                                if (isAddingType) {
                                  setNewType({ 
                                    ...newType, 
                                    defaultFolder: folderId,
                                    storagePath: autoPath
                                  });
                                } else {
                                  setEditingType({ 
                                    ...editingType!, 
                                    defaultFolder: folderId,
                                    storagePath: autoPath
                                  });
                                }
                              }}
                              className="w-full bg-white border border-slate-200 py-2.5 pl-3 pr-8 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10 appearance-none shadow-sm"
                            >
                              <option value="">-- Chọn thư mục lưu trữ --</option>
                              {(settings?.storageFolders || []).map(folder => (
                                <option key={folder.id} value={folder.id}>{folder.name}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5 ml-1">Nơi lưu trữ vật lý</label>
                          {(() => {
                            const selectedFolderId = isAddingType ? newType.defaultFolder : editingType?.defaultFolder;
                            const folder = settings?.storageFolders?.find(f => f.id === selectedFolderId);
                            if (folder) {
                              return (
                                <div className="bg-white border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-bold text-blue-600 flex items-center gap-2 shadow-sm min-h-[38px]">
                                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                  {folder.physicalLocation}
                                </div>
                              );
                            }
                            return (
                              <div className="bg-slate-100/50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold text-slate-400 italic flex items-center gap-2 min-h-[38px]">
                                <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                                Hãy chọn thư mục lưu trữ để lấy vị trí vật lý...
                              </div>
                            );
                          })()}
                        </div>

                        <div className="col-span-full border-t border-blue-100/50 pt-3 mt-1">
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5 ml-1">Đường dẫn thư mục lưu trữ số (Có thể chọn hoặc tự điền)</label>
                          <div className="flex gap-2">
                          <div className="relative flex-1 min-w-0">
                            <input
                              type="text"
                              list="doctype-storage-paths"
                              value={isAddingType ? newType.storagePath || '' : editingType?.storagePath || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (isAddingType) {
                                  setNewType({ ...newType, storagePath: val });
                                } else {
                                  setEditingType({ ...editingType!, storagePath: val });
                                }
                              }}
                              placeholder="Chọn từ gợi ý bên dưới hoặc tự điền..."
                              className="w-full bg-white border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10 shadow-sm"
                            />
                            <datalist id="doctype-storage-paths">
                              {(() => {
                                const selectedFolderId = isAddingType ? newType.defaultFolder : editingType?.defaultFolder;
                                const folder = settings?.storageFolders?.find(f => f.id === selectedFolderId);
                                const folderName = folder ? folder.name : '';
                                if (folderName) {
                                  return [
                                    `documents/${folderName}`,
                                    `scans/${folderName}`,
                                    `archive/${folderName}`,
                                    folderName,
                                    `documents/scans`,
                                    `documents/archive`
                                  ].map(p => <option key={p} value={p} />);
                                }
                                return [
                                  'documents/general',
                                  'documents/scans',
                                  'documents/archive',
                                  'scans/general',
                                  'archive/all'
                                ].map(p => <option key={p} value={p} />);
                              })()}
                            </datalist>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFolderPickerTarget('storagePath')}
                            title="Duyệt thư mục"
                            className="shrink-0 px-3 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase flex items-center gap-1.5 hover:bg-slate-800 transition-all"
                          >
                            <FolderSearch className="w-3.5 h-3.5" /> Duyệt
                          </button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">Cấu trúc mã số (Tùy chọn)</label>
                        <input 
                          type="text"
                          value={isAddingType ? newType.idSyntax : editingType?.idSyntax}
                          onChange={(e) => isAddingType ? setNewType({ ...newType, idSyntax: e.target.value }) : setEditingType({ ...editingType!, idSyntax: e.target.value })}
                          placeholder="{SEQ}/{YYYY}/{TYPE}-IIGHCM"
                          className="w-full bg-white border-none py-2 px-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">Số thứ tự hiện tại</label>
                        <input 
                          type="number"
                          value={isAddingType ? newType.lastSequence : editingType?.lastSequence}
                          onChange={(e) => isAddingType ? setNewType({ ...newType, lastSequence: parseInt(e.target.value) || 0 }) : setEditingType({ ...editingType!, lastSequence: parseInt(e.target.value) || 0 })}
                          className="w-full bg-white border-none py-2 px-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button 
                        onClick={isAddingType ? handleAddType : handleUpdateType}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-[10px] font-bold uppercase hover:bg-blue-700 transition-all"
                      >
                        {isAddingType ? 'Xác nhận thêm' : 'Lưu thay đổi'}
                      </button>
                      <button 
                        onClick={() => { setIsAddingType(false); setEditingType(null); }}
                        className="px-4 bg-slate-200 text-slate-600 py-2 rounded-xl text-[10px] font-bold uppercase hover:bg-slate-300 transition-all"
                      >
                        Hủy
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {docTypes.map((type) => {
                const canManageThisType = isAdmin || (isManager && type.departmentId === CURRENT_USER.departmentId);
                return (
                <div key={type.id} className="p-5 bg-white rounded-3xl border border-slate-100 flex items-center justify-between group hover:shadow-xl hover:shadow-slate-100 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      <Type className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{type.label}</h4>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-md",
                          type.departmentId ? "text-emerald-700 bg-emerald-50" : "text-slate-500 bg-slate-100"
                        )}>
                          {type.departmentId ? (departments.find(d => d.id === type.departmentId)?.name || type.departmentId) : 'Chung công ty'}
                        </span>
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">Prefix: {type.prefix}</span>
                        <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-md">Seq: {type.lastSequence}</span>
                        {type.idSyntax && (
                          <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">Syntax: {type.idSyntax}</span>
                        )}
                        {type.storagePath && (
                          <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">Storage: {type.storagePath}</span>
                        )}
                        {type.defaultFolder && (() => {
                          const folder = settings?.storageFolders?.find(f => f.id === type.defaultFolder);
                          return (
                            <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1.5">
                              <Folder className="w-3.5 h-3.5 text-blue-500" />
                              Thư mục: <span className="font-bold text-slate-700">{folder ? folder.name : type.defaultFolder}</span>
                              {folder && (
                                <span className="text-slate-400">
                                  (Vị trí: <span className="font-bold text-blue-600">{folder.physicalLocation}</span>)
                                </span>
                              )}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  {canManageThisType && (
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => { setEditingType(type); setIsAddingType(false); }}
                        className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <SettingsIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteType(type.id)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </section>

          {/* Preview Section */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 text-blue-600">
              <RefreshCw className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Xem trước mã số thực tế</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {docTypes.map((type) => (
                <div key={type.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{type.label}</span>
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                  </div>
                  <span className="text-sm font-mono font-bold text-blue-600">
                    {(type.idSyntax || settings.idSyntax || '{TYPE}/{SEQ}/{YYYY}')
                      .replace(/{TYPE}/g, type.prefix || type.id || '')
                      .replace(/{YYYY}/g, new Date().getFullYear().toString())
                      .replace(/{YY}/g, new Date().getFullYear().toString().slice(-2))
                      .replace(/{SEQ}/g, ((type.lastSequence || 0) + 1).toString().padStart(3, '0'))
                      .replace(/{PARTNER}/g, 'NSG')}
                  </span>
                </div>
              ))}
              {docTypes.length === 0 && (
                <p className="text-xs text-slate-400 italic col-span-full">Chưa có loại văn bản nào được định nghĩa.</p>
              )}
            </div>
          </section>
          </div>
          )}

          {activeTab === 'departments' && isAdmin && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-blue-600">
                <Building2 className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Phòng ban</h3>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed max-w-2xl">
                Mỗi phòng ban có tài liệu, loại văn bản (cấu trúc mã số) và vị trí lưu trữ vật lý riêng, do các nhân viên thuộc phòng ban đó tự quản lý. Gán tài khoản vào phòng ban ở tab <b>Quản lý tài khoản</b>.
              </p>

              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  value={newDepartmentName}
                  onChange={(e) => setNewDepartmentName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddDepartment(); }}
                  placeholder="Thêm phòng ban mới (ví dụ: Phòng Kế toán)..."
                  className="flex-1 bg-slate-50 border-none py-2.5 px-4 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/10"
                />
                <button
                  onClick={handleAddDepartment}
                  className="px-4 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Thêm
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {departments.map(d => (
                  <div key={d.id} className="p-5 bg-white rounded-3xl border border-slate-100 flex items-center justify-between group hover:shadow-xl hover:shadow-slate-100 transition-all">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-500 shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      {editingDeptId === d.id ? (
                        <input
                          autoFocus
                          value={editingDeptName}
                          onChange={(e) => setEditingDeptName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRenameDepartment(d.id); if (e.key === 'Escape') setEditingDeptId(null); }}
                          onBlur={() => handleRenameDepartment(d.id)}
                          className="flex-1 min-w-0 bg-slate-50 border border-blue-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      ) : (
                        <h4 className="text-sm font-bold text-slate-900 truncate">{d.name}</h4>
                      )}
                    </div>
                    {editingDeptId !== d.id && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                        <button
                          onClick={() => { setEditingDeptId(d.id); setEditingDeptName(d.name); }}
                          className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                          title="Đổi tên"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteDepartment(d.id)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {departments.length === 0 && (
                  <p className="text-xs text-slate-400 italic col-span-full">Chưa có phòng ban nào được định nghĩa.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'approvals' && isAdmin && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-blue-600">
                <ClipboardCheck className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Yêu cầu phê duyệt chỉnh sửa</h3>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed max-w-2xl">
                Khi văn bản lấy số từ kho chung công ty hết giờ chỉnh sửa (hoặc đã có bản scan), nhân viên có thể gửi yêu cầu tại đây để được mở lại quyền sửa trong một khoảng thời gian nữa.
              </p>

              <div className="space-y-3">
                {editRequests.map(r => (
                  <div key={r.id} className="p-5 bg-white rounded-3xl border border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">{r.docNumber}</span>
                        <span className="text-xs text-slate-500 truncate">{r.docTitle}</span>
                        <span className={cn(
                          "text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md",
                          r.status === 'pending' ? "bg-orange-100 text-orange-700" :
                          r.status === 'approved' ? "bg-emerald-100 text-emerald-700" :
                          "bg-red-100 text-red-700"
                        )}>
                          {r.status === 'pending' ? 'Chờ duyệt' : r.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        <span className="font-bold text-slate-700">{r.requestedByName}</span> yêu cầu: {r.reason}
                      </p>
                      <p className="text-[9px] text-slate-400 flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" /> {new Date(r.createdAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                    {r.status === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleResolveEditRequest(r.id, true)}
                          className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-bold uppercase hover:bg-emerald-100 transition-all flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" /> Duyệt
                        </button>
                        <button
                          onClick={() => handleResolveEditRequest(r.id, false)}
                          className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold uppercase hover:bg-red-100 transition-all flex items-center gap-1.5"
                        >
                          <X className="w-3.5 h-3.5" /> Từ chối
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {editRequests.length === 0 && (
                  <p className="text-xs text-slate-400 italic">Chưa có yêu cầu chỉnh sửa nào.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'users' && isAdmin && (
            <div className="space-y-6">
              <UserManagement />
            </div>
          )}
        </div>
      </div>

      {folderPickerTarget && (
        <FolderPickerModal
          title={
            folderPickerTarget === 'storageRoot' ? 'Chọn đường dẫn gốc lưu trữ' :
            folderPickerTarget === 'scanFolder' ? 'Chọn thư mục quét' :
            'Chọn thư mục lưu trữ số'
          }
          initialPath={
            folderPickerTarget === 'storageRoot' ? settings.storageRoot :
            folderPickerTarget === 'scanFolder' ? settings.scanFolder :
            (isAddingType ? newType.storagePath : editingType?.storagePath)
          }
          onClose={() => setFolderPickerTarget(null)}
          onSelect={(picked) => {
            if (folderPickerTarget === 'storageRoot') {
              setSettings({ ...settings, storageRoot: picked });
            } else if (folderPickerTarget === 'scanFolder') {
              setSettings({ ...settings, scanFolder: picked });
            } else if (folderPickerTarget === 'storagePath') {
              if (isAddingType) {
                setNewType({ ...newType, storagePath: picked });
              } else if (editingType) {
                setEditingType({ ...editingType, storagePath: picked });
              }
            }
            setFolderPickerTarget(null);
          }}
        />
      )}
    </div>
  );
}

/* Recursive node for the 3-tier physical storage tree: Kho (depth 0) > Tủ
   (depth 1) > Ngăn/Hộc (depth 2, leaf — no further children allowed). */
const LOCATION_LEVEL_LABELS = ['Kho', 'Tủ', 'Ngăn/Hộc'];

// Mirrors backend/authz.ts's getNodeDepartmentId/canManageLocationNode — no
// shared module between front/back, so kept in lockstep by hand. Adding a
// child, renaming and deleting all require "managing" the node itself, so
// one check gates all three actions.
function getNodeDepartmentIdClient(node: StorageLocationNode, allNodes: StorageLocationNode[]): string | null {
  let cursor: any = node;
  const seen = new Set<string>();
  while (cursor?.parentId) {
    if (seen.has(cursor.id)) break;
    seen.add(cursor.id);
    const parent = allNodes.find(n => n.id === cursor.parentId);
    if (!parent) break;
    cursor = parent;
  }
  return cursor?.departmentId || null;
}

function canManageLocationNodeClient(node: StorageLocationNode, allNodes: StorageLocationNode[]): boolean {
  if (CURRENT_USER.role === 'Admin') return true;
  const deptId = getNodeDepartmentIdClient(node, allNodes);
  if (!deptId) return false; // shared/company-wide locations are admin-only
  return CURRENT_USER.departmentId === deptId;
}

interface LocationTreeNodeProps {
  node: StorageLocationNode;
  allNodes: StorageLocationNode[];
  depth: number;
  onAddChild: (parentId: string, name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string, hasChildren: boolean) => void;
  departments: Department[];
  onReassignDepartment: (id: string, departmentId: string) => void;
}

function LocationTreeNode({ node, allNodes, depth, onAddChild, onRename, onDelete, departments, onReassignDepartment }: LocationTreeNodeProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);

  const children = allNodes.filter(n => n.parentId === node.id);
  const canHaveChildren = depth < LOCATION_LEVEL_LABELS.length - 1;
  const canManage = canManageLocationNodeClient(node, allNodes);
  const Icon = depth === 0 ? Warehouse : Archive;

  const submitAdd = () => {
    if (!newChildName.trim()) return;
    onAddChild(node.id, newChildName.trim());
    setNewChildName('');
    setIsAdding(false);
  };

  const submitRename = () => {
    if (!editName.trim()) { setEditName(node.name); setIsEditing(false); return; }
    if (editName.trim() !== node.name) onRename(node.id, editName.trim());
    setIsEditing(false);
  };

  return (
    <div className={depth > 0 ? 'mt-2.5 pl-4 border-l-2 border-slate-100' : ''}>
      <div className={cn(
        "rounded-2xl p-3.5",
        depth === 0 ? "bg-slate-50 border border-slate-100" : "bg-white border border-slate-100"
      )}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              depth === 0 ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
            )}>
              <Icon className="w-4 h-4" />
            </div>
            {isEditing ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename();
                  if (e.key === 'Escape') { setEditName(node.name); setIsEditing(false); }
                }}
                onBlur={submitRename}
                className="flex-1 min-w-0 bg-white border border-blue-200 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            ) : (
              <>
                <span className="text-xs font-bold text-slate-800 truncate">{node.name}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider shrink-0">{LOCATION_LEVEL_LABELS[depth] || ''}</span>
                {children.length > 0 && (
                  <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md shrink-0">{children.length}</span>
                )}
                {depth === 0 && (
                  CURRENT_USER.role === 'Admin' ? (
                    <select
                      value={node.departmentId || ''}
                      onChange={(e) => onReassignDepartment(node.id, e.target.value)}
                      title="Gán Kho cho phòng ban"
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0 bg-emerald-50 text-emerald-700 border-none outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none"
                    >
                      <option value="">Chung công ty</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0",
                      node.departmentId ? "text-emerald-700 bg-emerald-50" : "text-slate-500 bg-slate-100"
                    )}>
                      {node.departmentId ? (departments.find(d => d.id === node.departmentId)?.name || node.departmentId) : 'Chung công ty'}
                    </span>
                  )
                )}
              </>
            )}
          </div>
          {!isEditing && canManage && (
            <div className="flex items-center gap-1 shrink-0">
              {canHaveChildren && (
                <button
                  onClick={() => { setIsAdding(v => !v); setNewChildName(''); }}
                  className="p-1.5 text-blue-500 hover:bg-blue-100 rounded-lg transition-colors"
                  title={`Thêm ${LOCATION_LEVEL_LABELS[depth + 1]}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
                title="Đổi tên"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(node.id, children.length > 0)}
                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Xóa"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {isAdding && (
          <div className="flex gap-2 mt-3">
            <input
              autoFocus
              value={newChildName}
              onChange={(e) => setNewChildName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
              placeholder={`Tên ${LOCATION_LEVEL_LABELS[depth + 1]} mới...`}
              className="flex-1 bg-slate-50 border border-slate-200 py-1.5 px-3 rounded-lg text-[11px] font-medium outline-none focus:ring-2 focus:ring-blue-500/10"
            />
            <button
              onClick={submitAdd}
              className="px-3 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 transition-all"
            >
              Thêm
            </button>
          </div>
        )}
      </div>

      {children.length > 0 && (
        <div className="space-y-2.5 mt-2.5">
          {children.map(child => (
            <div key={child.id}>
              <LocationTreeNode
                node={child}
                allNodes={allNodes}
                depth={depth + 1}
                onAddChild={onAddChild}
                onRename={onRename}
                onDelete={onDelete}
                departments={departments}
                onReassignDepartment={onReassignDepartment}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
