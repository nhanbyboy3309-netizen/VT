import React, { useState } from 'react';
import { apiService } from '../services/apiService';
import { 
  FileSpreadsheet, 
  Upload, 
  X, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Download,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { utils, writeFile } from 'xlsx';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportModal({ isOpen, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setError('');
      setResults(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiService.importDocuments(file);
      setResults(res);
      if (res.success > 0) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi nhập dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        'Số hiệu': 'CV/001/2026',
        'Tiêu đề': 'Công văn về việc triển khai hệ thống',
        'Loại': 'CONG_VAN',
        'Nơi ban hành': 'Phòng CNTT',
        'Nơi nhận': 'Ban Giám đốc',
        'Ngày ban hành': '2026-05-01',
        'Ngày nhận': '2026-05-02',
        'Vị trí vật lý': 'Kệ 01A',
        'Trạng thái': 'đã xử lý',
        'File': 'storage/2026/05/cong_van/CV.001.2026.pdf',
        'Độ mật': 'Thường',
        'Thời hạn bảo quản': 'Vĩnh viễn',
        'Phiên bản': '1.0',
        'Trạng thái ISO': 'Đang hiệu lực'
      }
    ];

    const ws = utils.json_to_sheet(templateData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Template');
    writeFile(wb, 'mau_nhap_lieu_van_thu.xlsx');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white rounded-[32px] w-full max-w-xl overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Nhập dữ liệu từ Excel</h3>
              <p className="text-xs text-slate-400 font-medium">Đồng bộ danh sách văn bản đã có sẵn</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {!results ? (
            <>
              <div className="bg-blue-50/50 rounded-3xl p-6 border border-blue-100/50 space-y-3">
                <div className="flex items-center gap-2 text-blue-700">
                  <Info className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Hướng dẫn</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  1. Tải file mẫu bên cạnh để đảm bảo đúng định dạng.<br/>
                  2. Cột <code className="bg-white px-1 py-0.5 rounded border border-blue-100 font-mono text-blue-600">File</code> nên chứa đường dẫn tương đối từ thư mục gốc của hệ thống (ví dụ: <code className="text-blue-500">storage/2026/05/CV.pdf</code>).<br/>
                  3. Hệ thống sẽ bỏ qua các dòng thiếu Mã số, Tiêu đề hoặc Loại văn bản.
                </p>
                <button 
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 text-blue-600 text-[10px] font-bold uppercase hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải file mẫu (.xlsx)
                </button>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <div className={cn(
                    "relative border-2 border-dashed rounded-[32px] p-12 flex flex-col items-center gap-4 transition-all cursor-pointer",
                    file ? "border-green-200 bg-green-50/30" : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/30"
                  )}>
                    <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileChange} />
                    <div className={cn(
                      "w-16 h-16 rounded-3xl flex items-center justify-center transition-colors",
                      file ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600"
                    )}>
                      <Upload className="w-8 h-8" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-900">
                        {file ? file.name : 'Chọn file Excel để tải lên'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Hỗ trợ .xlsx, .xls (Tối đa 10MB)</p>
                    </div>
                  </div>
                </label>
              </div>

              {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Thành công</p>
                  <p className="text-3xl font-black text-green-600">{results.success}</p>
                </div>
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Thất bại</p>
                  <p className="text-3xl font-black text-red-600">{results.failed}</p>
                </div>
              </div>

              {results.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto custom-scrollbar p-4 bg-red-50 rounded-2xl border border-red-100 space-y-2">
                  <p className="text-[10px] text-red-600 font-bold uppercase">Chi tiết lỗi:</p>
                  {results.errors.map((err: string, i: number) => (
                    <p key={i} className="text-[10px] text-red-500 font-medium leading-relaxed flex gap-2">
                      <span className="opacity-50">•</span> {err}
                    </p>
                  ))}
                </div>
              )}

              <button 
                onClick={onClose}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl text-sm font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                Hoàn tất
              </button>
            </div>
          )}
        </div>

        {!results && (
          <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
            <button 
              onClick={onClose}
              className="flex-1 px-6 py-4 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-all"
            >
              Hủy bỏ
            </button>
            <button 
              onClick={handleUpload}
              disabled={!file || loading}
              className="flex-[2] bg-blue-600 text-white px-6 py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Bắt đầu nhập dữ liệu
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

import { cn } from '../lib/utils';
