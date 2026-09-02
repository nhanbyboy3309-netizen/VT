import React, { useEffect, useState } from 'react';
import { apiService } from '../services/apiService';
import {
  Folder,
  FileText,
  MapPin,
  X,
  Loader2,
  AlertCircle,
  ArrowRight,
  ChevronRight,
  Archive,
  LogIn,
  Search,
  ExternalLink
} from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  qrType: 'location' | 'folder' | 'storage_location';
  qrId: string;
  onClose: () => void;
  onNavigateToDocument?: (docId: number) => void;
}

export default function ScannedQRView({ qrType, qrId, onClose, onNavigateToDocument }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // For storage_location scans, lets the user drill into a child Tủ/Ngăn/Hộc
  // without closing this view, by re-fetching for the child's id.
  const [currentId, setCurrentId] = useState(qrId);

  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem('token'));
  }, []);

  useEffect(() => {
    setCurrentId(qrId);
  }, [qrId]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const details = await apiService.getQRScanDetails(qrType, currentId);
        setData(details);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Có lỗi xảy ra khi tải thông tin quét mã QR');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [qrType, currentId]);

  const filteredDocs = data?.documents?.filter((doc: any) => 
    doc.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.title?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
              <MapPin className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-blue-600 block">Thông tin quét vật lý</span>
              <h2 className="text-base font-extrabold text-slate-800">
                {qrType === 'location' ? 'Tra cứu Kệ / Kho' : qrType === 'storage_location' ? 'Tra cứu vị trí lưu trữ' : 'Tra cứu Thư mục hồ sơ'}
              </h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200/60 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar">
          {loading && (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-sm text-slate-500 font-medium">Đang đồng bộ và truy xuất hồ sơ thực tế...</p>
            </div>
          )}

          {error && (
            <div className="py-12 px-6 bg-red-50 rounded-2xl border border-red-100 flex flex-col items-center text-center gap-3">
              <AlertCircle className="w-12 h-12 text-red-500" />
              <h3 className="font-bold text-red-800">Truy xuất thất bại</h3>
              <p className="text-xs text-red-600 max-w-md">{error}</p>
              <button 
                onClick={onClose}
                className="mt-2 px-6 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Đóng cửa sổ
              </button>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Profile Card */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 bg-blue-500 rounded-md">
                      {qrType === 'location'
                        ? 'Khu vực lưu trữ'
                        : qrType === 'storage_location'
                          ? (['Kho', 'Tủ', 'Ngăn/Hộc'][data.breadcrumb?.length || 0] || 'Vị trí')
                          : 'Thư mục vật lý'}
                    </span>
                    {qrType === 'folder' && (
                      <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 bg-slate-700 text-slate-300 rounded-md">
                        {data.physicalLocation}
                      </span>
                    )}
                    {qrType === 'storage_location' && data.breadcrumb?.map((crumb: any) => (
                      <span key={crumb.id} className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 bg-slate-700 text-slate-300 rounded-md">
                        {crumb.name}
                      </span>
                    ))}
                  </div>
                  <h1 className="text-2xl font-extrabold tracking-tight">{data.name}</h1>
                  <p className="text-slate-400 text-xs mt-1.5 font-medium">
                    {qrType === 'location'
                      ? 'Quét từ tem mã vạch dán trên kệ, khay hoặc khu vực kho vật lý.'
                      : qrType === 'storage_location'
                        ? 'Quét từ tem mã vạch dán trên vị trí lưu trữ vật lý.'
                        : `Thư mục lưu trữ tài liệu thực tế thuộc vị trí: ${data.physicalLocation}.`}
                  </p>
                </div>

                <div className="flex gap-4 border-t border-slate-700/50 pt-4 md:pt-0 md:border-none">
                  <div className="bg-white/10 px-4 py-2.5 rounded-xl text-center min-w-[80px]">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Văn bản</span>
                    <span className="text-xl font-extrabold">{data.documents?.length || 0}</span>
                  </div>
                  {qrType === 'location' && (
                    <div className="bg-white/10 px-4 py-2.5 rounded-xl text-center min-w-[80px]">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Thư mục</span>
                      <span className="text-xl font-extrabold">{data.folders?.length || 0}</span>
                    </div>
                  )}
                  {qrType === 'storage_location' && (
                    <div className="bg-white/10 px-4 py-2.5 rounded-xl text-center min-w-[80px]">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Vị trí con</span>
                      <span className="text-xl font-extrabold">{data.children?.length || 0}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Child locations (Tủ/Ngăn/Hộc) for storage_location scans — drill in without rescanning */}
              {qrType === 'storage_location' && data.children && data.children.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Các vị trí con (Tủ / Ngăn / Hộc)</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.children.map((child: any) => (
                      <button
                        key={child.id}
                        onClick={() => setCurrentId(child.id)}
                        className="p-4 bg-slate-50 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-100 rounded-2xl transition-all flex items-center justify-between text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                            <Archive className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-800">{child.name}</h4>
                            <p className="text-[9px] text-slate-400 font-medium">{child.documentCount || 0} văn bản</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-blue-500" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* public read-only notification */}
              {!isLoggedIn && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700">
                      <LogIn className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-blue-900">Chế độ tra cứu nhanh vật lý (Read-only)</h4>
                      <p className="text-[10px] text-blue-600 font-medium">Bạn đang tra cứu nhanh danh mục. Đăng nhập hệ thống để xem hoặc sửa tài liệu gốc.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      onClose();
                      window.location.hash = '#login'; // Trigger login view if needed
                    }}
                    className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-200 transition-all flex items-center gap-1.5"
                  >
                    Đăng nhập hệ thống <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Folders in Location section (Location and storage_location scans) */}
              {(qrType === 'location' || qrType === 'storage_location') && data.folders && data.folders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Các thư mục thuộc vị trí này</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.folders.map((folder: any) => (
                      <div 
                        key={folder.id} 
                        className="p-4 bg-slate-50 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-100 rounded-2xl transition-all flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                            <Folder className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-800">{folder.name}</h4>
                            <p className="text-[9px] text-slate-400 font-medium">Mã số số: <span className="font-mono font-bold text-slate-500">{folder.id}</span></p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1 bg-white border border-blue-100 px-2.5 py-1 rounded-lg">
                          Chứa văn bản
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents List section */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {qrType === 'location' || qrType === 'storage_location' ? 'Tất cả văn bản tại vị trí này' : 'Các văn bản nằm trong thư mục'}
                    </h3>
                  </div>

                  {/* Quick Search */}
                  <div className="relative max-w-xs w-full">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Tìm số hiệu, tiêu đề..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200/80 rounded-xl py-2 pl-10 pr-4 text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {filteredDocs.length > 0 ? (
                  <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                          <th className="py-3 px-4">Số hiệu</th>
                          <th className="py-3 px-4">Tiêu đề trích yếu</th>
                          <th className="py-3 px-4 hidden sm:table-cell">Ngày ban hành</th>
                          <th className="py-3 px-4 hidden sm:table-cell text-center">Trạng thái</th>
                          {isLoggedIn && onNavigateToDocument && <th className="py-3 px-4 text-right">Chi tiết</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDocs.map((doc: any, idx: number) => (
                          <tr 
                            key={doc.id} 
                            className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/70 transition-colors text-xs"
                          >
                            <td className="py-4 px-4 font-mono font-bold text-slate-800">{doc.number}</td>
                            <td className="py-4 px-4 font-semibold text-slate-700">
                              <p className="line-clamp-2">{doc.title}</p>
                            </td>
                            <td className="py-4 px-4 text-slate-500 hidden sm:table-cell">
                              {doc.dateIssued ? new Date(doc.dateIssued).toLocaleDateString('vi-VN') : '---'}
                            </td>
                            <td className="py-4 px-4 hidden sm:table-cell text-center">
                              <span className={`inline-block px-2 py-0.5 text-[9px] font-bold rounded-full border ${
                                doc.status === 'Đang hiệu lực' || doc.status === 'đã hoàn thành'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                  : doc.status === 'chưa xử lý'
                                  ? 'bg-orange-50 text-orange-700 border-orange-100'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                                {doc.status || 'Chưa xử lý'}
                              </span>
                            </td>
                            {isLoggedIn && onNavigateToDocument && (
                              <td className="py-4 px-4 text-right">
                                <button 
                                  onClick={() => onNavigateToDocument(doc.id)}
                                  className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 rounded-lg transition-colors inline-flex items-center gap-1 text-[10px] font-bold"
                                >
                                  Mở xem <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center space-y-2">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs font-bold text-slate-400">Không tìm thấy tài liệu phù hợp</p>
                    <p className="text-[10px] text-slate-400">Khu vực lưu trữ này hiện chưa được xếp hồ sơ hoặc không có tài liệu khớp từ khóa.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
          <span>Hệ thống ISO 15489 - Văn Thư Pro</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </motion.div>
    </div>
  );
}
