import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import { utils, writeFile } from 'xlsx';
import { subscribeToDocuments, deleteDocument, subscribeToDocumentTypes } from '../services/documentService';
import { subscribeToSettings } from '../services/settingsService';
import { subscribeToDepartments } from '../services/departmentService';
import { Document, DocumentTypeConfig, SystemSettings, Department } from '../types';
import { formatDate, cn } from '../lib/utils';
import {
  Trash2,
  Edit,
  ExternalLink,
  FileText,
  Clock,
  MapPin,
  HardDrive,
  Filter,
  MoreVertical,
  ChevronDown,
  Download,
  Eye,
  History,
  Folder,
  QrCode,
  Upload,
  CheckCircle2,
  RotateCcw,
  Archive
} from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import QRCodeModal from './QRCodeModal';
import ImportModal from './ImportModal';
import { getRetentionStatus, formatRetentionDays } from '../lib/retention';

interface Props {
  searchQuery: string;
  onEdit: (doc: Document) => void;
  typeFilter?: string;
}

export default function DocumentList({ searchQuery, onEdit, typeFilter = 'ALL' }: Props) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docTypes, setDocTypes] = useState<DocumentTypeConfig[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [internalFilter, setInternalFilter] = useState<string>(typeFilter);
  const [qrDoc, setQrDoc] = useState<Document | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [togglingStatusId, setTogglingStatusId] = useState<string | number | null>(null);
  const [destroyingId, setDestroyingId] = useState<string | number | null>(null);
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    setInternalFilter(typeFilter);
  }, [typeFilter]);

  useEffect(() => {
    const unsubDocs = subscribeToDocuments(setDocuments);
    const unsubTypes = subscribeToDocumentTypes(setDocTypes);
    const unsubSettings = subscribeToSettings(setSettings);
    const unsubDepartments = subscribeToDepartments(setDepartments);
    return () => {
      unsubDocs();
      unsubTypes();
      unsubSettings();
      unsubDepartments();
    };
  }, []);

  const getFolderName = (folderId: string) => {
    const folder = settings?.storageFolders?.find(f => f.id === folderId || f.name === folderId);
    return folder ? folder.name : folderId;
  };

  const getDepartmentBadge = (doc: Document) => {
    if (!doc.departmentId) return 'Chung công ty';
    return departments.find(d => d.id === doc.departmentId)?.name || doc.departmentId;
  };

  const getTypeLabel = (typeId: string) => {
    const type = docTypes.find(t => t.id === typeId);
    return type ? type.label : typeId.replace(/_/g, ' ');
  };

  const handleToggleStatus = async (doc: Document) => {
    const nextStatus = doc.status === 'đã xử lý' ? 'chưa xử lý' : 'đã xử lý';
    setTogglingStatusId(doc.id!);
    try {
      await apiService.updateStatus(doc.id, nextStatus, '');
    } catch (err) {
      alert('Lỗi khi cập nhật trạng thái văn bản.');
    } finally {
      setTogglingStatusId(null);
    }
  };

  const canMarkDestroyed = (doc: Document) => {
    if (doc.physicalDestroyed) return false;
    if (getRetentionStatus(doc) !== 'expired') return false;
    if (currentUser.role === 'Admin') return true;
    if (doc.departmentId) return currentUser.departmentId === doc.departmentId;
    return false;
  };

  const handleMarkDestroyed = async (doc: Document) => {
    if (!window.confirm(`Xác nhận đã hủy tài liệu bản cứng "${doc.number}"? Hành động này không thể hoàn tác.`)) return;
    setDestroyingId(doc.id!);
    try {
      await apiService.markDocumentDestroyed(doc.id);
    } catch (err: any) {
      alert(err?.message || 'Lỗi khi đánh dấu hủy bản cứng.');
    } finally {
      setDestroyingId(null);
    }
  };

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         doc.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         doc.partnerAbbreviation?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         doc.ocrText?.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesType = true;
    if (internalFilter === 'ALL') {
      matchesType = true;
    } else if (internalFilter === 'OUTGOING') {
      matchesType = doc.type !== 'VAN_BAN_DEN';
    } else {
      matchesType = doc.type === internalFilter;
    }
    
    return matchesSearch && matchesType;
  });

  const getExpiryStatus = (date?: string) => {
    if (!date) return null;
    try {
      const days = differenceInDays(parseISO(date), new Date());
      if (days < 0) return { label: 'Hết hạn', color: 'bg-red-50 text-red-600 border-red-100' };
      if (days < 30) return { label: `Còn ${days} ngày`, color: 'bg-orange-50 text-orange-600 border-orange-100' };
      return { label: `Còn ${days} ngày`, color: 'bg-green-50 text-green-600 border-green-100' };
    } catch (e) {
      return null;
    }
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'CONG_VAN': return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'HOP_DONG': return 'bg-purple-50 text-purple-600 border-purple-100';
      case 'QUYET_DINH': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'VAN_BAN_DEN': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const exportToExcel = () => {
    const data = filteredDocs.map(doc => ({
      'Phân loại': doc.type === 'VAN_BAN_DEN' ? 'Văn bản đến' : 'Văn bản đi',
      'Loại văn bản': getTypeLabel(doc.type),
      'Mã số': doc.number,
      'Tiêu đề': doc.title,
      'Ngày ban hành': formatDate(doc.dateIssued),
      'Ngày nhận': doc.receivedDate ? formatDate(doc.receivedDate) : '',
      'Nơi gửi': doc.sender || '',
      'Vị trí lưu trữ vật lý': doc.physicalLocation || '',
      'Vị trí lưu trữ số': doc.digitalLocation || '',
      'Link file scan': doc.fileUrl ? apiService.getFileUrl(doc.fileUrl) : '',
      'Độ mật': doc.confidentiality || 'Thường',
      'Thời hạn bảo quản': doc.retentionPeriod || 'Vĩnh viễn',
      'Phiên bản': doc.version || '1.0',
      'Trạng thái ISO': doc.isoStatus || 'Đang hiệu lực',
      'Đã hủy bản cứng': doc.physicalDestroyed ? `Có (${doc.physicalDestroyedAt ? formatDate(doc.physicalDestroyedAt) : ''})` : 'Không'
    }));

    const worksheet = utils.json_to_sheet(data);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Danh sách văn bản');
    
    // Set column widths
    const widths = [15, 20, 15, 40, 15, 15, 20, 20, 30, 40];
    worksheet['!cols'] = widths.map(w => ({ wch: w }));

    writeFile(workbook, `danh_sach_van_ban_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Danh sách văn bản</h2>
            <p className="text-xs text-slate-400 font-medium tracking-wide">Tổng cộng {filteredDocs.length} tài liệu</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-green-50 text-green-600 rounded-2xl text-xs font-bold uppercase hover:bg-green-100 transition-all border border-green-100/50"
          >
            <Upload className="w-4 h-4" />
            Nhập Excel
          </button>
          <button 
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
          >
            <Download className="w-4 h-4" />
            Xuất Excel
          </button>

          <div className="relative">
            <select 
              className="appearance-none bg-slate-50 border-none py-2.5 pl-4 pr-10 rounded-xl text-xs font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/10 outline-none cursor-pointer transition-all"
              value={internalFilter}
              onChange={(e) => setInternalFilter(e.target.value)}
            >
              <option value="ALL">Tất cả loại</option>
              <option value="OUTGOING">Văn bản đi</option>
              <option value="VAN_BAN_DEN">Văn bản đến</option>
              {docTypes.map(type => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="p-6 text-[11px] uppercase font-bold text-slate-400 tracking-wider">Thông tin văn bản</th>
              <th className="p-6 text-[11px] uppercase font-bold text-slate-400 tracking-wider">Ngày ban hành</th>
              <th className="p-6 text-[11px] uppercase font-bold text-slate-400 tracking-wider">Lưu trữ</th>
              <th className="p-6 text-[11px] uppercase font-bold text-slate-400 tracking-wider">Trạng thái</th>
              <th className="p-6 text-[11px] uppercase font-bold text-slate-400 tracking-wider text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            <AnimatePresence>
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-sm text-slate-400 italic">
                    Không tìm thấy văn bản nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc, index) => {
                  const expiry = getExpiryStatus(doc.expiryDate);
                  return (
                    <motion.tr 
                      key={doc.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="hover:bg-slate-50/50 transition-colors group"
                    >
                      <td className="p-6">
                        <div className="flex items-center gap-4">
                          <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center shrink-0", getBadgeColor(doc.type))}>
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold text-slate-900 truncate max-w-[240px]">{doc.title}</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{doc.number}</span>
                              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase", getBadgeColor(doc.type))}>
                                {getTypeLabel(doc.type)}
                              </span>
                              <span className={cn(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase",
                                doc.departmentId ? "text-emerald-700 bg-emerald-50" : "text-slate-500 bg-slate-100"
                              )}>
                                {getDepartmentBadge(doc)}
                              </span>
                              {doc.sender && (
                                <span className="text-[10px] text-slate-400 font-medium italic">Từ: {doc.sender}</span>
                              )}
                            </div>

                            {/* ISO Compliance tags */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50/50 border border-emerald-100 px-1.5 py-0.5 rounded uppercase" title="Phiên bản">
                                v{doc.version || '1.0'}
                              </span>
                              <span className={cn(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border",
                                doc.confidentiality === 'Tối mật' 
                                  ? "bg-red-50 text-red-600 border-red-100" 
                                  : doc.confidentiality === 'Mật' 
                                    ? "bg-amber-50 text-amber-600 border-amber-100" 
                                    : "bg-slate-50 text-slate-500 border-slate-100"
                              )} title="Độ bảo mật">
                                {doc.confidentiality || 'Thường'}
                              </span>
                              <span className="text-[9px] font-bold text-blue-700 bg-blue-50/50 border border-blue-100/50 px-1.5 py-0.5 rounded uppercase" title="Thời hạn lưu trữ">
                                ISO: {doc.retentionPeriod || 'Vĩnh viễn'}
                              </span>
                              <span className={cn(
                                "text-[9px] font-black px-1.5 py-0.5 rounded uppercase",
                                doc.isoStatus === 'Hết hiệu lực'
                                  ? "bg-red-100 text-red-800"
                                  : doc.isoStatus === 'Đang soạn thảo'
                                    ? "bg-yellow-100 text-yellow-800"
                                    : doc.isoStatus === 'Đã phê duyệt'
                                      ? "bg-blue-100 text-blue-800"
                                      : "bg-emerald-100 text-emerald-800"
                              )} title="Trạng thái hiệu lực">
                                {doc.isoStatus || 'Đang hiệu lực'}
                              </span>
                              {(() => {
                                const rStatus = getRetentionStatus(doc);
                                if (rStatus === 'ok' || rStatus === 'permanent') return null;
                                const label = rStatus === 'destroyed'
                                  ? 'Đã hủy bản cứng'
                                  : rStatus === 'expired'
                                    ? `Hết hạn lưu trữ · ${formatRetentionDays(doc)}`
                                    : `Sắp hết hạn lưu trữ · ${formatRetentionDays(doc)}`;
                                const color = rStatus === 'destroyed'
                                  ? 'bg-slate-800 text-white'
                                  : rStatus === 'expired'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700';
                                return (
                                  <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase", color)} title="Cảnh báo hết hạn lưu trữ (ISO 15489)">
                                    {label}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-600">
                            {doc.type === 'VAN_BAN_DEN' && doc.receivedDate 
                              ? formatDate(doc.receivedDate) 
                              : formatDate(doc.dateIssued)}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-1">
                            {doc.type === 'VAN_BAN_DEN' ? 'Ngày nhận' : 'Ban hành'}
                          </span>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex flex-col gap-1.5">
                          {doc.physicalLocation && (
                            <span className="text-[11px] flex items-center gap-2 text-slate-500">
                              <Folder className="w-3.5 h-3.5 text-slate-300" />
                              {doc.physicalLocation}
                            </span>
                          )}
                          {doc.digitalLocation && (
                            <span className="text-[11px] flex items-center gap-2 text-slate-500">
                              <HardDrive className="w-3.5 h-3.5 text-slate-300" />
                              {doc.digitalLocation.startsWith('http') ? (
                                <a href={doc.digitalLocation} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                                  Mở link tài liệu số
                                </a>
                              ) : (
                                getFolderName(doc.digitalLocation)
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex flex-col gap-1.5 items-start">
                          <button
                            onClick={() => handleToggleStatus(doc)}
                            disabled={togglingStatusId === doc.id}
                            title={doc.status === 'đã xử lý' ? 'Bấm để đánh dấu chưa xử lý' : 'Bấm để đánh dấu đã xử lý'}
                            className={cn(
                              "text-[10px] font-bold px-2 py-1 rounded-full border flex items-center gap-1.5 w-fit transition-all disabled:opacity-50",
                              doc.status === 'đã xử lý'
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100"
                                : "bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-100"
                            )}
                          >
                            {doc.status === 'đã xử lý' ? <RotateCcw className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                            {doc.status === 'đã xử lý' ? 'Đã xử lý' : 'Chưa xử lý'}
                          </button>
                          {doc.type === 'HOP_DONG' && expiry && (
                            <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full border flex items-center gap-1.5 w-fit", expiry.color)}>
                              <Clock className="w-3 h-3" />
                              {expiry.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex items-center justify-end gap-2">
                          {doc.fileUrl && (
                            <a 
                              href={apiService.getFileUrl(doc.fileUrl)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm shadow-blue-100"
                              title="Xem file"
                            >
                              <Eye className="w-4 h-4" />
                            </a>
                          )}
                          <button 
                            onClick={() => setQrDoc(doc)}
                            className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all"
                            title="Mã QR"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => onEdit(doc)}
                            className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-900 hover:text-white transition-all"
                            title="Sửa"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {canMarkDestroyed(doc) && (
                            <button
                              onClick={() => handleMarkDestroyed(doc)}
                              disabled={destroyingId === doc.id}
                              className="w-9 h-9 rounded-xl bg-slate-800 text-white flex items-center justify-center hover:bg-black transition-all disabled:opacity-50"
                              title="Đánh dấu đã hủy tài liệu bản cứng"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (!window.confirm('Bạn có chắc chắn muốn xóa văn bản này?')) return;
                              try {
                                await deleteDocument(doc.id!);
                              } catch (err: any) {
                                alert(err?.message || 'Lỗi khi xóa văn bản.');
                              }
                            }}
                            className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-sm shadow-red-100"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      <QRCodeModal document={qrDoc} onClose={() => setQrDoc(null)} />
      <ImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} onSuccess={() => {}} />
    </div>
  );
}
