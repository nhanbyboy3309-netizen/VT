import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createDocument, getPreviewId, updateDocument, subscribeToDocumentTypes } from '../services/documentService';
import { subscribeToSettings } from '../services/settingsService';
import { subscribeToStorageLocations } from '../services/storageLocationService';
import { createEditRequest } from '../services/editRequestService';
import { apiService } from '../services/apiService';
import { 
  Save, 
  X, 
  FilePlus, 
  Calendar as CalendarIcon, 
  MapPin, 
  HardDrive,
  Upload,
  Loader2,
  Camera,
  FileText,
  CheckCircle2,
  AlertCircle,
  FileUp,
  Image as ImageIcon,
  ChevronDown,
  History,
  RotateCcw,
  Lock,
  Send
} from 'lucide-react';
import { DocumentTypeConfig, SystemSettings, FileVersion, HistoryEntry, StorageLocationNode } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

// Flattens a Kho > Tủ > Ngăn/Hộc subtree into an ordered, depth-tagged list so
// it can be rendered as indented <option>s inside a single <optgroup> (HTML
// doesn't allow nesting optgroups).
function flattenLocationTree(node: StorageLocationNode, allNodes: StorageLocationNode[], depth = 0): { node: StorageLocationNode; depth: number }[] {
  const children = allNodes.filter(n => n.parentId === node.id);
  return [{ node, depth }, ...children.flatMap(child => flattenLocationTree(child, allNodes, depth + 1))];
}

const schema = z.object({
  type: z.string().min(1, 'Vui lòng chọn loại văn bản'),
  title: z.string().min(1, 'Vui lòng nhập tiêu đề'),
  number: z.string().min(1, 'Vui lòng nhập mã số văn bản'),
  dateIssued: z.string().min(1, 'Vui lòng chọn ngày ban hành'),
  expiryDate: z.string().optional(),
  physicalLocation: z.string().optional(),
  digitalLocation: z.string().optional(),
  fileUrl: z.string().optional(),
  partnerAbbreviation: z.string().optional(),
  sender: z.string().optional(),
  receivedDate: z.string().optional(),
  editReason: z.string().optional(),
  confidentiality: z.string().optional(),
  retentionPeriod: z.string().optional(),
  version: z.string().optional(),
  isoStatus: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  onSuccess: () => void;
  initialData?: any;
  defaultType?: string;
}

export default function DocumentForm({ onSuccess, initialData, defaultType }: Props) {
  const [loading, setLoading] = useState(false);
  const [generatingId, setGeneratingId] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isOCRing, setIsOCRing] = useState(false);
  const [ocrText, setOcrText] = useState<string>(initialData?.ocrText || '');
  const [fileAction, setFileAction] = useState<'upload' | 'scan' | 'revert' | undefined>();
  const [showScanner, setShowScanner] = useState(false);
  const [docTypes, setDocTypes] = useState<DocumentTypeConfig[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [storageLocations, setStorageLocations] = useState<StorageLocationNode[]>([]);
  const [scanStream, setScanStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  // Mirrors backend authz.isEditWindowOpen: only a shared/company document
  // (no departmentId) that this user themselves registered can ever be
  // time-locked — a department document is governed by role, not a clock.
  const isCompanyWideDoc = !!initialData?.id && !initialData?.departmentId;
  const isOwnCompanyDoc = isCompanyWideDoc && initialData?.createdBy === currentUser.id;
  const editWindowOpen = (() => {
    if (!isCompanyWideDoc) return true;
    const now = Date.now();
    if (initialData?.unlockedUntil && new Date(initialData.unlockedUntil).getTime() > now) return true;
    if (initialData?.fileUrl) return false;
    if (!initialData?.editableUntil) return true;
    return new Date(initialData.editableUntil).getTime() > now;
  })();
  const isLocked = currentUser.role !== 'Admin' && isOwnCompanyDoc && !editWindowOpen;

  const [requestingEdit, setRequestingEdit] = useState(false);
  const [editRequestReason, setEditRequestReason] = useState('');
  const [editRequestSent, setEditRequestSent] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);

  const handleSendEditRequest = async () => {
    if (!editRequestReason.trim() || !initialData?.id) return;
    setSendingRequest(true);
    try {
      await createEditRequest(initialData.id, editRequestReason.trim());
      setEditRequestSent(true);
      setRequestingEdit(false);
    } catch (error: any) {
      alert(error?.message || 'Lỗi khi gửi yêu cầu chỉnh sửa.');
    } finally {
      setSendingRequest(false);
    }
  };

  const { register, handleSubmit, setValue, watch, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData ? {
      ...initialData,
      dateIssued: initialData.dateIssued?.split('T')[0],
      expiryDate: initialData.expiryDate?.split('T')[0],
      receivedDate: initialData.receivedDate?.split('T')[0],
      confidentiality: initialData.confidentiality || 'Thường',
      retentionPeriod: initialData.retentionPeriod || 'Vĩnh viễn',
      version: initialData.version || '1.0',
      isoStatus: initialData.isoStatus || 'Đang hiệu lực'
    } : {
      type: defaultType || '',
      number: '',
      dateIssued: new Date().toISOString().split('T')[0],
      receivedDate: new Date().toISOString().split('T')[0],
      confidentiality: 'Thường',
      retentionPeriod: 'Vĩnh viễn',
      version: '1.0',
      isoStatus: 'Đang hiệu lực'
    }
  });

  useEffect(() => {
    const unsubTypes = subscribeToDocumentTypes(setDocTypes);
    const unsubSettings = subscribeToSettings(setSettings);
    const unsubLocations = subscribeToStorageLocations(setStorageLocations);
    return () => {
      unsubTypes();
      unsubSettings();
      unsubLocations();
    };
  }, []);

  useEffect(() => {
    if (initialData) {
      reset({
        ...initialData,
        dateIssued: initialData.dateIssued?.split('T')[0],
        expiryDate: initialData.expiryDate?.split('T')[0],
        receivedDate: initialData.receivedDate?.split('T')[0],
        confidentiality: initialData.confidentiality || 'Thường',
        retentionPeriod: initialData.retentionPeriod || 'Vĩnh viễn',
        version: initialData.version || '1.0',
        isoStatus: initialData.isoStatus || 'Đang hiệu lực'
      });
    }
  }, [initialData, reset]);

  const selectedType = watch('type');
  const partnerAbbreviation = watch('partnerAbbreviation');
  const fileUrl = watch('fileUrl');
  const physicalLocation = watch('physicalLocation');

  // Set default physical location and digital folder when type changes (only for new docs)
  useEffect(() => {
    if (!initialData && selectedType && settings) {
      const typeConfig = docTypes.find(t => t.id === selectedType);
      if (typeConfig?.defaultFolder) {
        const folder = settings.storageFolders?.find(f => f.id === typeConfig.defaultFolder || f.name === typeConfig.defaultFolder);
        if (folder) {
          setValue('digitalLocation', folder.id);
          setValue('physicalLocation', folder.physicalLocation);
        } else {
          setValue('digitalLocation', typeConfig.defaultFolder);
          setValue('physicalLocation', typeConfig.defaultFolder);
        }
      }
    }
  }, [selectedType, docTypes, initialData, setValue, settings]);

  useEffect(() => {
    if (selectedType !== 'HOP_DONG' && selectedType !== 'CONG_VAN_DEN') {
      // Keep logic for specific types if needed, but now it's more dynamic
    }
    // For now, let's keep it simple and allow fields based on the type ID
    if (selectedType !== 'VAN_BAN_DEN') {
      setValue('sender', '');
      setValue('receivedDate', '');
    }
  }, [selectedType, setValue]);

  // Sync physical and digital locations (only if no structured storage folders configured)
  useEffect(() => {
    if (physicalLocation && !fileUrl && (!settings?.storageFolders || settings.storageFolders.length === 0)) {
      setValue('digitalLocation', physicalLocation);
    }
  }, [physicalLocation, fileUrl, setValue, settings]);

  // Update digital location when file is uploaded
  useEffect(() => {
    if (fileUrl) {
      setValue('digitalLocation', fileUrl);
    }
  }, [fileUrl, setValue]);

  useEffect(() => {
    const updateId = async () => {
      if (initialData) return; // Don't regenerate ID if editing
      if (!selectedType) {
        setValue('number', '');
        return;
      }

      // If it's an incoming document, only auto-generate if the field is empty
      // This allows users to enter their own number or use the auto-generated one
      const currentNumber = watch('number');
      if (selectedType === 'VAN_BAN_DEN' && currentNumber) {
        return;
      }

      setGeneratingId(true);
      try {
        console.log('Generating preview ID for type:', selectedType, 'partner:', partnerAbbreviation);
        const nextId = await getPreviewId(selectedType, partnerAbbreviation);
        console.log('Generated ID:', nextId);
        setValue('number', nextId);
      } catch (error) {
        console.error('Error generating preview ID:', error);
      } finally {
        setGeneratingId(false);
      }
    };
    updateId();
  }, [selectedType, partnerAbbreviation, setValue]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setValue('fileUrl', URL.createObjectURL(file)); // For preview
    setFileAction('upload');
  };

  const handlePhysicalScan = async () => {
    try {
      setUploading(true);
      const result = await apiService.triggerScan();
      if (result.success && result.filePath) {
        setValue('fileUrl', apiService.getFileUrl(result.filePath));
        setFileAction('scan');
        alert(result.message || 'Quét tài liệu thành công!');
      }
    } catch (error: any) {
      console.error('Physical scan error:', error);
      alert(error.message || 'Lỗi khi kết nối máy quét.');
    } finally {
      setUploading(false);
    }
  };

  const startScanner = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setScanStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setShowScanner(true);
    } catch (error) {
      console.error('Camera error:', error);
      alert('Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập.');
    }
  };

  const stopScanner = () => {
    if (scanStream) {
      scanStream.getTracks().forEach(track => track.stop());
      setScanStream(null);
    }
    setShowScanner(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setSelectedFile(file);
      setValue('fileUrl', URL.createObjectURL(file));
      setFileAction('scan');
      stopScanner();
    }, 'image/jpeg', 0.8);
  };

  const handleRevert = (url: string) => {
    setValue('fileUrl', url);
    setFileAction('revert');
    setSelectedFile(null); // a revert points back at an existing stored file, not a new upload
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    try {
      const docDataWithOcr = {
        ...data,
        ocrText,
        fileAction
      };
      if (initialData?.id) {
        // Update existing document
        const { editReason, ...docData } = docDataWithOcr;
        await updateDocument(
          initialData.id,
          docData,
          storedUser.id,
          storedUser.full_name || storedUser.username,
          editReason,
          selectedFile || undefined
        );
      } else {
        // Create new document
        const { editReason, ...docData } = docDataWithOcr;
        await createDocument(
          {
            ...docData,
            createdBy: storedUser.id
          },
          storedUser.full_name || storedUser.username,
          selectedFile || undefined
        );
      }
      onSuccess();
    } catch (error: any) {
      console.error('Error saving document:', error.message || error);
      alert('Lỗi khi lưu văn bản. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <FilePlus className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {initialData ? 'Chỉnh sửa văn bản' : (defaultType === 'VAN_BAN_DEN' ? 'Thêm văn bản đến' : 'Thêm văn bản đi')}
            </h2>
            <p className="text-xs text-slate-400 font-medium tracking-wide">
              {initialData ? 'Cập nhật thông tin văn bản' : 'Điền thông tin chi tiết bên dưới'}
            </p>
          </div>
        </div>
        <button
          onClick={onSuccess}
          className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {isLocked && (
        <div className="mx-8 mt-6 p-4 bg-orange-50 border border-orange-100 rounded-2xl flex items-start gap-3">
          <Lock className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-bold text-orange-800">
              {initialData?.fileUrl ? 'Văn bản đã có bản scan nên không thể chỉnh sửa thêm.' : 'Đã hết thời gian được phép chỉnh sửa văn bản này.'}
            </p>
            <p className="text-[11px] text-orange-600 mt-0.5">Gửi yêu cầu để quản trị viên phê duyệt mở lại quyền chỉnh sửa.</p>

            {editRequestSent ? (
              <p className="text-[11px] font-bold text-emerald-600 mt-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Đã gửi yêu cầu, vui lòng chờ quản trị viên phê duyệt.
              </p>
            ) : requestingEdit ? (
              <div className="flex gap-2 mt-3">
                <input
                  autoFocus
                  value={editRequestReason}
                  onChange={(e) => setEditRequestReason(e.target.value)}
                  placeholder="Lý do cần chỉnh sửa thêm..."
                  className="flex-1 bg-white border border-orange-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-orange-500/20"
                />
                <button
                  type="button"
                  onClick={handleSendEditRequest}
                  disabled={sendingRequest || !editRequestReason.trim()}
                  className="px-4 bg-orange-600 text-white rounded-xl text-[10px] font-bold uppercase hover:bg-orange-700 transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {sendingRequest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Gửi
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRequestingEdit(true)}
                className="mt-3 px-4 py-2 bg-orange-600 text-white rounded-xl text-[10px] font-bold uppercase hover:bg-orange-700 transition-all flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Yêu cầu chỉnh sửa
              </button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit, (errs) => console.log('Form validation errors:', Object.keys(errs)))} className="p-8 space-y-8 overflow-y-auto">
        <fieldset disabled={isLocked} className={cn(isLocked && 'opacity-60')}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left Column: Basic Info */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <FileText className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Thông tin cơ bản</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Loại văn bản</label>
                <div className="grid grid-cols-2 gap-2">
                  {docTypes.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setValue('type', type.id)}
                      className={cn(
                        "py-2.5 px-3 rounded-xl text-[10px] font-bold uppercase border transition-all flex flex-col items-center gap-0.5",
                        selectedType === type.id
                          ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100"
                          : "bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100"
                      )}
                    >
                      <span>{type.label}</span>
                      <span className={cn(
                        "text-[8px] font-medium normal-case tracking-normal",
                        selectedType === type.id ? "text-blue-100" : "text-slate-400"
                      )}>
                        {type.departmentId ? 'Phòng ban' : 'Chung công ty'}
                      </span>
                    </button>
                  ))}
                  {docTypes.length === 0 && (
                    <div className="col-span-2 py-3 px-4 bg-slate-50 rounded-2xl text-[10px] text-slate-400 italic text-center border border-dashed border-slate-200">
                      Chưa có loại văn bản nào. Vui lòng cấu hình trong Cấu hình hệ thống.
                    </div>
                  )}
                </div>
                {errors.type && <p className="text-[10px] text-red-500 mt-1.5 flex items-center gap-1 font-medium"><AlertCircle className="w-3 h-3" /> {errors.type.message}</p>}
              </div>

              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Viết tắt tên đối tác</label>
                <input 
                  {...register('partnerAbbreviation')}
                  className="w-full bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                  placeholder="Ví dụ: NSG, ABC..."
                />
                {errors.partnerAbbreviation && <p className="text-[10px] text-red-500 mt-1.5 flex items-center gap-1 font-medium"><AlertCircle className="w-3 h-3" /> {errors.partnerAbbreviation.message}</p>}
              </div>

              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Mã số hệ thống</label>
                <div className="relative">
                  <input 
                    {...register('number')}
                    readOnly={selectedType !== 'VAN_BAN_DEN'}
                    className={cn(
                      "w-full border-none py-3 px-4 rounded-2xl text-sm font-mono font-bold transition-all",
                      selectedType === 'VAN_BAN_DEN' 
                        ? "bg-white ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500/20 text-slate-900" 
                        : "bg-slate-50 text-slate-600"
                    )}
                    placeholder={selectedType === 'VAN_BAN_DEN' ? "Nhập mã số văn bản đến..." : ""}
                  />
                  {generatingId && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-600" />}
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Tiêu đề / Trích yếu</label>
                <textarea 
                  {...register('title')}
                  rows={4}
                  className="w-full bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none resize-none transition-all"
                  placeholder="Nhập tiêu đề hoặc nội dung tóm tắt của văn bản..."
                />
                {errors.title && <p className="text-[10px] text-red-500 mt-1.5 flex items-center gap-1 font-medium"><AlertCircle className="w-3 h-3" /> {errors.title.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">
                    {selectedType === 'VAN_BAN_DEN' ? 'Ngày trên văn bản' : 'Ngày ban hành'}
                  </label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="date"
                      {...register('dateIssued')}
                      className="w-full bg-slate-50 border-none py-3 pl-12 pr-4 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                    />
                  </div>
                </div>
                {selectedType === 'HOP_DONG' && (
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Ngày hết hạn</label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="date"
                        {...register('expiryDate')}
                        className="w-full bg-slate-50 border-none py-3 pl-12 pr-4 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                      />
                    </div>
                  </div>
                )}
                {selectedType === 'VAN_BAN_DEN' && (
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Ngày nhận</label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="date"
                        {...register('receivedDate')}
                        className="w-full bg-slate-50 border-none py-3 pl-12 pr-4 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              {selectedType === 'VAN_BAN_DEN' && (
                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Nơi gửi / Cơ quan ban hành</label>
                  <input 
                    {...register('sender')}
                    className="w-full bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                    placeholder="Nhập tên cơ quan hoặc cá nhân gửi..."
                  />
                </div>
              )}

              {initialData && (
                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Lý do thay đổi</label>
                  <input 
                    {...register('editReason')}
                    className="w-full bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                    placeholder="Nhập lý do chỉnh sửa văn bản..."
                  />
                </div>
              )}

              {/* ISO Standard Section */}
              <div className="pt-6 border-t border-slate-100 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full font-bold uppercase tracking-wider border border-emerald-100">Chuẩn ISO 15489 & 9001</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Độ mật (Bảo mật)</label>
                    <div className="relative">
                      <select
                        {...register('confidentiality')}
                        className="w-full bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all appearance-none"
                      >
                        <option value="Thường">Thường (Public)</option>
                        <option value="Mật">Mật (Confidential)</option>
                        <option value="Tối mật">Tối mật (Secret)</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Thời hạn bảo quản</label>
                    <div className="relative">
                      <select
                        {...register('retentionPeriod')}
                        className="w-full bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all appearance-none"
                      >
                        <option value="5 năm">5 năm (ISO short)</option>
                        <option value="10 năm">10 năm (ISO medium)</option>
                        <option value="20 năm">20 năm (ISO long)</option>
                        <option value="Vĩnh viễn">Vĩnh viễn (Permanent)</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Phiên bản tài liệu</label>
                    <input 
                      {...register('version')}
                      className="w-full bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all"
                      placeholder="Ví dụ: 1.0, 1.1..."
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Trạng thái hiệu lực ISO</label>
                    <div className="relative">
                      <select
                        {...register('isoStatus')}
                        className="w-full bg-slate-50 border-none py-3 px-4 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all appearance-none"
                      >
                        <option value="Đang soạn thảo">Đang soạn thảo (Draft)</option>
                        <option value="Đã phê duyệt">Đã phê duyệt (Approved)</option>
                        <option value="Đang hiệu lực">Đang hiệu lực (Active)</option>
                        <option value="Hết hiệu lực">Hết hiệu lực (Obsolete)</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Storage & File */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <MapPin className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Lưu trữ & Đính kèm</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Vị trí lưu trữ vật lý (Kho &gt; Tủ &gt; Ngăn/Hộc)</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  {storageLocations.length > 0 ? (
                    <select
                      {...register('physicalLocation')}
                      className="w-full bg-slate-50 border-none py-3 pl-12 pr-4 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none transition-all appearance-none"
                    >
                      <option value="">-- Chọn vị trí --</option>
                      {storageLocations.filter(n => !n.parentId).map(top => (
                        <optgroup key={top.id} label={top.name}>
                          {flattenLocationTree(top, storageLocations).map(({ node, depth }) => (
                            <option key={node.id} value={node.id}>
                              {depth > 0 ? '—'.repeat(depth) + ' ' : ''}
                              {node.name}
                              {depth === 0 ? ' (toàn bộ Kho)' : ''}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  ) : (
                    <input
                      {...register('physicalLocation')}
                      className="w-full bg-slate-50 border-none py-3 pl-12 pr-4 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                      placeholder="Kệ A, Tủ 01, Ngăn 02..."
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Thư mục lưu trữ số</label>
                <div className="relative">
                  <HardDrive className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <div className="relative w-full">
                    <select 
                      value={watch('digitalLocation') || ''}
                      onChange={(e) => {
                        const selectedFolderId = e.target.value;
                        setValue('digitalLocation', selectedFolderId);
                        // Auto update physical location to the one configured for this folder
                        const folder = (settings?.storageFolders || []).find(f => f.id === selectedFolderId || f.name === selectedFolderId);
                        if (folder) {
                          setValue('physicalLocation', folder.physicalLocation);
                        }
                      }}
                      className="w-full bg-slate-50 border-none py-3 pl-12 pr-8 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/10 outline-none transition-all appearance-none font-semibold text-slate-800"
                    >
                      <option value="">-- Chọn thư mục lưu trữ số --</option>
                      {(settings?.storageFolders || [
                        { id: 'cong_van_den', name: 'Công văn đến', physicalLocation: 'Kho A / Tủ 1' },
                        { id: 'cong_van_di', name: 'Công văn đi', physicalLocation: 'Kho A / Tủ 2' },
                        { id: 'quyet_dinh', name: 'Quyết định', physicalLocation: 'Kho B / Tủ 1' },
                        { id: 'thong_bao', name: 'Thông báo', physicalLocation: 'Kho B / Tủ 2' },
                        { id: 'van_ban_den', name: 'Văn bản đến bên ngoài', physicalLocation: 'Kho A / Tủ 3' }
                      ]).map(folder => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                {watch('digitalLocation') && (() => {
                  const folder = (settings?.storageFolders || []).find(f => f.id === watch('digitalLocation'));
                  if (folder) {
                    return (
                      <p className="text-[10px] text-blue-600 font-bold mt-1.5 ml-1 flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                        Vị trí vật lý tương ứng: {folder.physicalLocation}
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>

              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Đính kèm file scan</label>
                <div className="space-y-3">
                  {fileUrl ? (
                    <div className="p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center text-white">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-green-900">Đã đính kèm file</p>
                          <a href={apiService.getFileUrl(fileUrl)} target="_blank" rel="noopener noreferrer" className="text-[10px] text-green-600 hover:underline">Xem tài liệu</a>
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setValue('fileUrl', '')}
                        className="p-2 text-green-600 hover:bg-green-100 rounded-xl transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <label className={cn(
                          "flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-2xl transition-all group",
                          selectedType 
                            ? "bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-blue-400 cursor-pointer" 
                            : "bg-slate-100 border-slate-100 cursor-not-allowed"
                        )}>
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-transform",
                            selectedType ? "bg-white group-hover:scale-110" : "bg-slate-200"
                          )}>
                            <FileUp className={cn("w-5 h-5", selectedType ? "text-blue-600" : "text-slate-400")} />
                          </div>
                          <span className={cn("text-[10px] font-bold uppercase", selectedType ? "text-slate-500" : "text-slate-400")}>Tải PDF/Ảnh</span>
                          <input type="file" accept="application/pdf,image/*" className="hidden" onChange={handleFileUpload} disabled={!selectedType} />
                        </label>
                        
                        <button 
                          type="button"
                          onClick={startScanner}
                          disabled={!selectedType}
                          className={cn(
                            "flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-2xl transition-all group",
                            selectedType 
                              ? "bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-blue-400" 
                              : "bg-slate-100 border-slate-100 cursor-not-allowed"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-transform",
                            selectedType ? "bg-white group-hover:scale-110" : "bg-slate-200"
                          )}>
                            <Camera className={cn("w-5 h-5", selectedType ? "text-blue-600" : "text-slate-400")} />
                          </div>
                          <span className={cn("text-[10px] font-bold uppercase", selectedType ? "text-slate-500" : "text-slate-400")}>Quét Camera</span>
                        </button>
                      </div>

                        <button 
                          type="button"
                          onClick={handlePhysicalScan}
                          disabled={!selectedType}
                          className={cn(
                            "w-full flex items-center justify-center gap-3 p-4 border-2 border-dashed rounded-2xl transition-all group mt-3",
                            selectedType 
                              ? "bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-400" 
                              : "bg-slate-100 border-slate-100 cursor-not-allowed"
                          )}
                        >
                          <HardDrive className={cn("w-5 h-5", selectedType ? "text-blue-600" : "text-slate-400")} />
                          <span className={cn("text-xs font-bold uppercase", selectedType ? "text-blue-700" : "text-slate-400")}>Lấy file mới nhất từ máy quét (Thư mục Scan)</span>
                        </button>
                    </>
                  )}
                  {uploading && (
                    <div className="flex items-center gap-2 text-[10px] text-blue-600 font-bold animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Đang tải file lên...
                    </div>
                  )}
                  {isOCRing && (
                    <div className="flex items-center gap-2 text-[10px] text-purple-600 font-bold animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Đang trích xuất văn bản (OCR)...
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1.5 ml-1">Nội dung trích xuất (OCR)</label>
                <div className="relative">
                  <FileText className="absolute left-4 top-4 w-4 h-4 text-slate-400" />
                  <textarea 
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    className="w-full bg-slate-50 border-none py-3 pl-12 pr-4 rounded-2xl text-xs focus:ring-2 focus:ring-blue-500/10 outline-none transition-all min-h-[120px] custom-scrollbar"
                    placeholder="Nội dung văn bản sẽ tự động được trích xuất sau khi tải file..."
                  />
                </div>
                <p className="text-[9px] text-slate-400 mt-1.5 ml-1 italic">
                  * Nội dung này giúp bạn tìm kiếm văn bản nhanh hơn bằng từ khóa.
                </p>
              </div>

              {initialData?.versions && initialData.versions.length > 0 && (
                <div className="pt-4">
                  <div className="flex items-center justify-between mb-3 ml-1">
                    <label className="block text-[11px] uppercase font-bold text-slate-400">Phiên bản tài liệu</label>
                    <History className="w-3 h-3 text-slate-400" />
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {[...initialData.versions].reverse().map((version: FileVersion, index: number) => {
                      // Older entries can share a url with the newest one (a
                      // revert just points back at an earlier file), so only
                      // the most recent entry — index 0 after reversing — is
                      // ever "current", not every row that happens to match.
                      const isCurrent = index === 0 && fileUrl === version.url;
                      return (
                      <div
                        key={index}
                        className={cn(
                          "p-3 rounded-xl border transition-all flex items-center justify-between group",
                          isCurrent
                            ? "bg-blue-50 border-blue-100"
                            : "bg-slate-50 border-slate-100 hover:border-slate-200"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-slate-700 truncate">{version.userName}</span>
                            <span className="text-[9px] text-slate-400">
                              {new Date(version.timestamp).toLocaleString('vi-VN', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase",
                              version.action === 'upload' ? "bg-blue-100 text-blue-600" :
                              version.action === 'scan' ? "bg-purple-100 text-purple-600" :
                              "bg-orange-100 text-orange-600"
                            )}>
                              {version.action === 'upload' ? 'Tải lên' : version.action === 'scan' ? 'Quét' : 'Khôi phục'}
                            </span>
                            <a 
                              href={apiService.getFileUrl(version.url)} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-[9px] text-blue-600 hover:underline truncate"
                            >
                              Xem file
                            </a>
                          </div>
                        </div>
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleRevert(version.url)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            title="Khôi phục phiên bản này"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isCurrent && (
                          <div className="px-2 py-1 bg-blue-600 text-white text-[8px] font-bold rounded-md uppercase">
                            Hiện tại
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {initialData?.history && initialData.history.length > 0 && (
                <div className="pt-4">
                  <div className="flex items-center justify-between mb-3 ml-1">
                    <label className="block text-[11px] uppercase font-bold text-slate-400">Lịch sử chỉnh sửa</label>
                    <History className="w-3 h-3 text-slate-400" />
                  </div>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {[...initialData.history].reverse().map((entry: HistoryEntry, index: number) => (
                      <div key={index} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px] hover:border-slate-200 transition-all">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-slate-700">{entry.userName}</span>
                          <span className="text-slate-400">
                            {new Date(entry.timestamp).toLocaleString('vi-VN', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="text-slate-600 font-medium mb-1">{entry.action}</p>
                        {entry.reason && (
                          <p className="text-blue-600 italic font-medium">Lý do: {entry.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        </fieldset>

        <div className="pt-8 border-t border-slate-100 flex justify-end gap-4">
          <button
            type="button"
            onClick={onSuccess}
            className="px-8 py-3.5 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-all"
          >
            Hủy bỏ
          </button>
          {!isLocked && (
            <button
              type="submit"
              disabled={loading || uploading}
              className="px-12 py-3.5 rounded-2xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-100"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Lưu văn bản
            </button>
          )}
        </div>
      </form>

      {/* Scanner Modal */}
      <AnimatePresence>
        {showScanner && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-3xl overflow-hidden max-w-2xl w-full shadow-2xl">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold">Quét tài liệu</h3>
                <button onClick={stopScanner} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-6 h-6" /></button>
              </div>
              <div className="relative aspect-video bg-black">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute inset-0 border-2 border-dashed border-white/30 m-8 rounded-lg pointer-events-none" />
              </div>
              <div className="p-8 flex justify-center gap-4">
                <button 
                  onClick={capturePhoto}
                  className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-blue-200"
                >
                  <Camera className="w-8 h-8" />
                </button>
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
