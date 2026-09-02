import React, { useEffect, useState, useRef } from 'react';
import { subscribeToSettings } from '../services/settingsService';
import { subscribeToDocuments } from '../services/documentService';
import { subscribeToStorageLocations } from '../services/storageLocationService';
import { SystemSettings, Document, StorageFolder, StorageLocationNode } from '../types';
import {
  QrCode,
  MapPin,
  Folder,
  Printer,
  Download,
  Search,
  CheckCircle2,
  ArrowLeft,
  ChevronRight,
  X,
  FileText,
  Warehouse,
  Archive,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QRCodeStyling from 'qr-code-styling';

export default function QRManager() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [storageLocations, setStorageLocations] = useState<StorageLocationNode[]>([]);
  const [activeTab, setActiveTab] = useState<'location' | 'folder'>('location');
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<{
    type: 'storage_location' | 'folder';
    id: string;
    name: string;
    payload: string;
    subText?: string;
  } | null>(null);

  useEffect(() => {
    const unsubSettings = subscribeToSettings(setSettings);
    const unsubDocs = subscribeToDocuments(setDocuments);
    const unsubLocations = subscribeToStorageLocations(setStorageLocations);
    return () => {
      unsubSettings();
      unsubDocs();
      unsubLocations();
    };
  }, []);

  const folders = settings?.storageFolders || [];

  // Current drill-down level: top-level (Kho/Kệ) when currentParentId is null,
  // otherwise the children (Tủ/Ngăn/Hộc) of the selected node.
  const currentParent = currentParentId ? storageLocations.find(n => n.id === currentParentId) || null : null;
  const nodesAtCurrentLevel = storageLocations.filter(n => (n.parentId || null) === currentParentId);
  const filteredLocationNodes = nodesAtCurrentLevel.filter(n =>
    n.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFolders = folders.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.physicalLocation.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Breadcrumb path from root to the current parent
  const breadcrumb: StorageLocationNode[] = [];
  {
    let cursor = currentParent;
    while (cursor) {
      breadcrumb.unshift(cursor);
      cursor = cursor.parentId ? storageLocations.find(n => n.id === cursor!.parentId) || null : null;
    }
  }

  const getChildCount = (nodeId: string) => storageLocations.filter(n => n.parentId === nodeId).length;

  // Every node in `filteredLocationNodes` is a sibling at the same tree depth,
  // which breadcrumb.length already tells us (0 = Kho, 1 = Tủ, 2 = Ngăn/Hộc).
  const currentDepth = breadcrumb.length;
  const LOCATION_LEVEL_LABELS = ['Kho', 'Tủ', 'Ngăn/Hộc'];
  const currentLevelLabel = LOCATION_LEVEL_LABELS[currentDepth] || 'Vị trí';

  const getDocsInLocationNode = (node: StorageLocationNode) => {
    return documents.filter(d => d.physicalLocation === node.id || d.physicalLocation === node.name);
  };

  const getDocsInFolder = (folder: StorageFolder) => {
    return documents.filter(d => d.digitalLocation === folder.id || d.physicalLocation === folder.physicalLocation);
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <QrCode className="w-6 h-6 text-blue-600" />
            Quản lý và In Mã QR Vật Lý
          </h1>
          <p className="text-xs text-slate-500 font-semibold tracking-wide mt-1">
            Tạo nhãn dán định danh QR Code cho kệ kho vật lý và thư mục hồ sơ theo chuẩn ISO 15489.
          </p>
        </div>

        {/* Search & Navigation Bar */}
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Tìm kiếm danh mục..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 pl-10 pr-4 text-xs focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-100/80 rounded-2xl w-fit">
        <button
          onClick={() => { setActiveTab('location'); setSearchQuery(''); setCurrentParentId(null); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase transition-all ${
            activeTab === 'location'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          Vị trí vật lý (Kho &gt; Tủ &gt; Ngăn/Hộc)
        </button>
        <button
          onClick={() => { setActiveTab('folder'); setSearchQuery(''); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase transition-all ${
            activeTab === 'folder' 
              ? 'bg-white text-blue-600 shadow-sm' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Folder className="w-4 h-4" />
          Thư mục vật lý (Folder hồ sơ)
        </button>
      </div>

      {/* Instructions Note */}
      <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 flex gap-3 text-xs text-blue-800">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">Hướng dẫn quy trình dán nhãn vật lý:</p>
          <p className="mt-0.5 text-[11px] text-blue-700 font-medium">
            1. Tìm vị trí hoặc thư mục cần dán nhãn bên dưới. <br />
            2. Nhấn <b>"In nhãn"</b> để mở hộp thoại in nhãn tiêu chuẩn (khuyên dùng in trên giấy decal cuộn/máy in nhãn). <br />
            3. Dán QR dán trực tiếp lên bìa còng/kệ kho. Cán bộ kho chỉ cần dùng điện thoại quét QR để cập nhật hoặc kiểm tra nhanh văn bản lưu trữ.
          </p>
        </div>
      </div>

      {/* Breadcrumb for drilling into Tủ/Ngăn/Hộc */}
      {activeTab === 'location' && breadcrumb.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
          <button onClick={() => setCurrentParentId(null)} className="hover:text-blue-600 transition-colors">
            Tất cả Kho
          </button>
          {breadcrumb.map((node) => (
            <React.Fragment key={node.id}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <button
                onClick={() => setCurrentParentId(node.id)}
                className={node.id === currentParentId ? 'text-blue-600' : 'hover:text-blue-600 transition-colors'}
              >
                {node.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Lists */}
      {activeTab === 'location' ? (
          <motion.div
            key="location"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filteredLocationNodes.map((node) => {
              const childCount = getChildCount(node.id);
              const dInNode = getDocsInLocationNode(node);
              const qrPayload = `${window.location.origin}/?qrType=storage_location&qrId=${encodeURIComponent(node.id)}`;
              const isTopLevel = currentDepth === 0;

              return (
                <div
                  key={node.id}
                  className="bg-white rounded-3xl border border-slate-100 p-5 hover:border-blue-200/80 hover:shadow-md hover:shadow-slate-100/50 transition-all flex flex-col justify-between gap-5 group"
                >
                  <div className="space-y-3">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center transition-colors group-hover:bg-blue-600 group-hover:text-white">
                      {isTopLevel ? <Warehouse className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors text-sm">{node.name}</h3>
                      <p className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase mt-1">
                        {currentLevelLabel}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                      <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Vị trí con</span>
                        <span className="text-xs font-extrabold text-slate-700">{childCount}</span>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Tài liệu tại đây</span>
                        <span className="text-xs font-extrabold text-slate-700">{dInNode.length}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {childCount > 0 && (
                      <button
                        onClick={() => setCurrentParentId(node.id)}
                        className="flex-1 py-2.5 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5"
                      >
                        Xem bên trong <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedItem({
                        type: 'storage_location',
                        id: node.id,
                        name: node.name,
                        payload: qrPayload,
                        subText: isTopLevel ? 'Khu vực Kho vật lý' : `Thuộc: ${currentParent?.name || ''}`
                      })}
                      className="flex-1 py-2.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm shadow-blue-50/10"
                    >
                      <QrCode className="w-4 h-4" />
                      In QR
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredLocationNodes.length === 0 && (
              <div className="col-span-full py-16 text-center space-y-3 bg-white rounded-3xl border border-dashed border-slate-150">
                <MapPin className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-400">
                  {currentParent
                    ? `Vị trí này chưa có ${LOCATION_LEVEL_LABELS[currentDepth] || 'vị trí con'} nào khớp từ khóa`
                    : 'Chưa có Kho nào khớp từ khóa'}
                </p>
                <p className="text-[10px] text-slate-400">Bạn có thể cấu hình vị trí lưu trữ trong mục <b>Cấu hình hệ thống</b>.</p>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="folder"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filteredFolders.map((f) => {
              const dInFolder = getDocsInFolder(f);
              const qrPayload = `${window.location.origin}/?qrType=folder&qrId=${encodeURIComponent(f.id)}`;

              return (
                <div 
                  key={f.id}
                  className="bg-white rounded-3xl border border-slate-100 p-5 hover:border-blue-200/80 hover:shadow-md hover:shadow-slate-100/50 transition-all flex flex-col justify-between gap-5 group"
                >
                  <div className="space-y-3">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 group-hover:text-emerald-600 transition-colors text-sm truncate" title={f.name}>{f.name}</h3>
                      <p className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase mt-1 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {f.physicalLocation}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                      <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">ID Thư mục</span>
                        <span className="text-[10px] font-mono font-bold text-slate-600 truncate block" title={f.id}>{f.id}</span>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Tổng văn bản</span>
                        <span className="text-xs font-extrabold text-slate-700">{dInFolder.length}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedItem({
                      type: 'folder',
                      id: f.id,
                      name: f.name,
                      payload: qrPayload,
                      subText: `Vị trí: ${f.physicalLocation}`
                    })}
                    className="w-full py-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-50/10"
                  >
                    <QrCode className="w-4 h-4" />
                    Tạo nhãn & In QR
                  </button>
                </div>
              );
            })}

            {filteredFolders.length === 0 && (
              <div className="col-span-full py-16 text-center space-y-3 bg-white rounded-3xl border border-dashed border-slate-150">
                <Folder className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-400">Chưa có thư mục vật lý nào khớp từ khóa</p>
                <p className="text-[10px] text-slate-400">Bạn có thể cấu hình thư mục vật lý trong mục <b>Cấu hình hệ thống</b>.</p>
              </div>
            )}
          </motion.div>
        )}

      {/* Print & View QR Modal */}
      <AnimatePresence>
        {selectedItem && (
          <QRPrintModal 
            item={selectedItem} 
            orgName={settings?.orgName || 'VĂN THƯ PRO'}
            onClose={() => setSelectedItem(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* Internal Print Modal with qr-code-styling */
interface PrintModalProps {
  item: {
    type: 'storage_location' | 'folder';
    id: string;
    name: string;
    payload: string;
    subText?: string;
  };
  orgName: string;
  onClose: () => void;
}

function QRPrintModal({ item, orgName, onClose }: PrintModalProps) {
  const qrRef = useRef<HTMLDivElement>(null);
  const qrInstance = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    // Instantiate elegant QR Code Styling
    qrInstance.current = new QRCodeStyling({
      width: 250,
      height: 250,
      type: 'svg',
      data: item.payload,
      dotsOptions: {
        color: '#0f172a', // deep slate
        type: 'rounded'
      },
      backgroundOptions: {
        color: '#ffffff',
      },
      cornersSquareOptions: {
        type: 'extra-rounded',
        color: '#1e3a8a' // Navy blue corner
      }
    });

    if (qrRef.current) {
      // Clear container and append
      qrRef.current.innerHTML = '';
      qrInstance.current.append(qrRef.current);
    }
  }, [item]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (qrInstance.current) {
      qrInstance.current.download({
        name: `qr_${item.type}_${item.id}`,
        extension: 'png'
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Dynamic inline styles to support standard sticker label printer sizes and print-isolation */}
      <style>{`
        @media print {
          /* Hide app elements */
          body * {
            visibility: hidden;
            background: none !important;
          }
          /* Show print area and force high-contrast */
          .print-area, .print-area * {
            visibility: visible !important;
          }
          .print-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            margin: 0 !important;
            padding: 2rem !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
          }
          /* Avoid page breaks inside layout */
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col no-print"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-blue-600" />
            <h3 className="font-extrabold text-slate-800 text-sm">Xem và In Nhãn QR Code</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Print Content Preview */}
        <div className="p-8 flex flex-col items-center justify-center bg-slate-50/50">
          {/* Print area card - This gets printed */}
          <div className="print-area bg-white border-2 border-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-md flex flex-col items-center text-center space-y-4">
            {/* Header organization name inside label */}
            <div className="w-full border-b-2 border-slate-900 pb-2 flex flex-col items-center">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-700">{orgName}</span>
              <span className="text-[8px] uppercase tracking-wider font-bold text-slate-400 mt-0.5">HỆ THỐNG QUẢN LÝ VĂN BẢN VẬT LÝ ISO 15489</span>
            </div>

            {/* QR Code Container */}
            <div ref={qrRef} className="p-2 bg-white rounded-xl border-4 border-slate-100 flex items-center justify-center" />

            {/* Metadata Text */}
            <div className="space-y-1.5 w-full">
              <h4 className="text-sm font-extrabold text-slate-900 leading-tight tracking-tight uppercase">
                {item.name}
              </h4>
              {item.subText && (
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                  {item.subText}
                </p>
              )}
              <div className="bg-slate-900 text-white rounded-lg py-1 px-3 text-[8px] font-bold uppercase tracking-widest mt-2 block w-fit mx-auto">
                QUÉT MÃ ĐỂ XEM HỒ SƠ
              </div>
            </div>
          </div>
        </div>

        {/* Buttons Action */}
        <div className="p-5 border-t border-slate-150 bg-slate-50 grid grid-cols-2 gap-4">
          <button
            onClick={handleDownload}
            className="py-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            Tải File PNG
          </button>
          <button
            onClick={handlePrint}
            className="py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-200"
          >
            <Printer className="w-4 h-4" />
            In Nhãn Tem
          </button>
        </div>
      </motion.div>
    </div>
  );
}
