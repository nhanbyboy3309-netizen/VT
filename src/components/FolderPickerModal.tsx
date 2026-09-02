import React, { useEffect, useState } from 'react';
import { X, Folder, ChevronUp, FolderPlus, Check, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { apiService } from '../services/apiService';

interface FolderEntry {
  name: string;
  path: string;
}

interface Props {
  title?: string;
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export default function FolderPickerModal({ title, initialPath, onSelect, onClose }: Props) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const load = async (targetPath?: string | null, isFallback = false) => {
    setLoading(true);
    if (!isFallback) setError('');
    try {
      const data = await apiService.browseFolders(targetPath || undefined);
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setFolders(data.folders);
    } catch (err: any) {
      if (targetPath && !isFallback) {
        // The saved/typed value may not exist as a real path — fall back to
        // the drive list instead of leaving the picker on a dead-end error.
        return load(undefined, true);
      }
      setError(err.message || 'Không thể tải danh sách thư mục');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(initialPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentPath) return;
    try {
      await apiService.createFolder(currentPath, newFolderName.trim());
      setNewFolderName('');
      setCreating(false);
      load(currentPath);
    } catch (err: any) {
      alert(err.message || 'Không thể tạo thư mục');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="text-sm font-extrabold text-slate-800">{title || 'Chọn thư mục'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Vị trí hiện tại</p>
          <p className="text-xs font-mono font-bold text-slate-700 truncate" title={currentPath || ''}>
            {currentPath || 'Chọn ổ đĩa...'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : error ? (
            <div className="py-8 flex flex-col items-center gap-2 text-center px-4">
              <AlertCircle className="w-6 h-6 text-red-500" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {parentPath !== null && (
                <button
                  onClick={() => load(parentPath)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100 text-xs font-bold text-slate-500 transition-colors"
                >
                  <ChevronUp className="w-4 h-4" /> Lên thư mục cha
                </button>
              )}
              {currentPath === null && (
                <p className="text-[10px] text-slate-400 italic px-3 pb-1">Chọn một ổ đĩa để bắt đầu duyệt.</p>
              )}
              {folders.map(f => (
                <button
                  key={f.path}
                  onClick={() => load(f.path)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-blue-50 text-xs font-bold text-slate-700 transition-colors"
                >
                  <Folder className="w-4 h-4 text-blue-500 shrink-0" /> <span className="truncate">{f.name}</span>
                </button>
              ))}
              {folders.length === 0 && (
                <p className="text-[10px] text-slate-400 italic text-center py-4">Không có thư mục con nào.</p>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3">
          {creating ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
                placeholder="Tên thư mục mới..."
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/10"
              />
              <button onClick={handleCreateFolder} className="px-3 bg-blue-600 text-white rounded-xl text-[10px] font-bold uppercase hover:bg-blue-700 transition-all">
                Tạo
              </button>
              <button onClick={() => setCreating(false)} className="px-3 bg-slate-200 text-slate-600 rounded-xl text-[10px] font-bold uppercase hover:bg-slate-300 transition-all">
                Hủy
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              disabled={!currentPath}
              className="flex items-center gap-2 text-[10px] font-bold text-blue-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
            >
              <FolderPlus className="w-3.5 h-3.5" /> Tạo thư mục mới tại đây
            </button>
          )}
          <button
            onClick={() => currentPath && onSelect(currentPath)}
            disabled={!currentPath}
            className="w-full py-3 bg-blue-600 text-white rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
          >
            <Check className="w-4 h-4" /> Chọn thư mục này
          </button>
        </div>
      </motion.div>
    </div>
  );
}
