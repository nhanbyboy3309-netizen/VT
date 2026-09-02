import React from 'react';
import { X, QrCode as QrCodeIcon, Download, ExternalLink, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QRCodeDisplay from './QRCodeDisplay';
import { Document } from '../types';
import { apiService } from '../services/apiService';

interface Props {
  document: Document | null;
  onClose: () => void;
}

export default function QRCodeModal({ document, onClose }: Props) {
  if (!document) return null;

  const qrData = JSON.stringify({
    id: document.id,
    number: document.number,
    url: document.fileUrl ? apiService.getFileUrl(document.fileUrl) : ''
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-white rounded-[2.5rem] shadow-2xl max-w-sm w-full overflow-hidden border border-slate-100"
        >
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-100">
                <QrCodeIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Mã QR Văn Bản</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{document.number}</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl transition-all shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-10 flex flex-col items-center">
            <QRCodeDisplay data={qrData} size={240} />
            
            <div className="mt-8 w-full space-y-3">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Tiêu đề</p>
                <p className="text-xs font-bold text-slate-700 leading-relaxed truncate">{document.title}</p>
              </div>

              {document.fileUrl && (
                <a 
                  href={apiService.getFileUrl(document.fileUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3.5 bg-blue-50 text-blue-600 rounded-2xl text-xs font-bold hover:bg-blue-600 hover:text-white transition-all border border-blue-100 uppercase tracking-wider"
                >
                  <ExternalLink className="w-4 h-4" />
                  Mở tài liệu gốc
                </a>
              )}
            </div>
          </div>

          <div className="p-6 bg-slate-50 border-t border-slate-100 text-center">
            <p className="text-[10px] text-slate-400 font-medium italic">
              Quét mã này để truy cập nhanh tài liệu trên các thiết bị khác trong cùng mạng nội bộ.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
