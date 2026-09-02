import React, { useState, useEffect } from 'react';
import { subscribeToSettings } from '../services/settingsService';
import { SystemSettings } from '../types';
import { 
  FileText, 
  Settings as SettingsIcon, 
  Plus, 
  Search,
  LayoutDashboard,
  Bell,
  ChevronRight,
  Database,
  ArrowUpRight,
  ArrowDownLeft,
  LogOut,
  User as UserIcon,
  QrCode,
  BookOpen
} from 'lucide-react';
import { cn } from '../lib/utils';
import DocumentList from './DocumentList';
import DocumentForm from './DocumentForm';
import SettingsPanel from './SettingsPanel';
import Dashboard from './Dashboard';
import Login from './Login';
import QRManager from './QRManager';
import ScannedQRView from './ScannedQRView';
import UserGuide from './UserGuide';
import { motion, AnimatePresence } from 'motion/react';
import { apiService } from '../services/apiService';

export default function Layout() {
  const [user, setUser] = useState<any>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'all' | 'outgoing' | 'incoming' | 'add_outgoing' | 'add_incoming' | 'qr_manager' | 'settings' | 'guide'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [editingDoc, setEditingDoc] = useState<any>(null);
  const [scannedQR, setScannedQR] = useState<{ type: 'location' | 'folder' | 'storage_location'; id: string } | null>(null);

  useEffect(() => {
    // Check for QR parameters in URL first
    const params = new URLSearchParams(window.location.search);
    const type = params.get('qrType');
    const id = params.get('qrId');
    if ((type === 'location' || type === 'folder' || type === 'storage_location') && id) {
      setScannedQR({ type: type as 'location' | 'folder' | 'storage_location', id });
    }

    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsAuthReady(true);
    const unsubscribeSettings = subscribeToSettings(setSettings);
    return () => {
      unsubscribeSettings();
    };
  }, []);

  const handleLogin = (userData: any) => {
    setUser(userData);
  };

  const handleLogout = () => {
    apiService.logout();
    setUser(null);
  };

  const handleCloseScan = () => {
    setScannedQR(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('qrType');
    url.searchParams.delete('qrId');
    window.history.replaceState({}, '', url.pathname + url.search);
  };

  const handleNavigateToDoc = async (docId: number) => {
    try {
      const doc = await apiService.getDocument(docId);
      if (doc) {
        handleEdit(doc);
        setScannedQR(null);
      }
    } catch (e) {
      console.error(e);
      alert('Không thể mở tài liệu này');
    }
  };

  const handleEdit = (doc: any) => {
    setEditingDoc(doc);
    setActiveTab(doc.type === 'VAN_BAN_DEN' ? 'add_incoming' : 'add_outgoing');
  };

  const handleTabChange = (tab: any) => {
    if (tab !== 'add_outgoing' && tab !== 'add_incoming') setEditingDoc(null);
    setActiveTab(tab);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Đang khởi động hệ thống...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (scannedQR) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center font-sans p-4">
          <ScannedQRView 
            qrType={scannedQR.type} 
            qrId={scannedQR.id} 
            onClose={handleCloseScan} 
          />
        </div>
      );
    }
    return <Login onLogin={handleLogin} />;
  }

  const menuItems = [
    { id: 'dashboard', label: 'Bảng điều khiển', icon: LayoutDashboard },
    { id: 'all', label: 'Tất cả văn bản', icon: FileText },
    { id: 'outgoing', label: 'Văn bản đi', icon: ArrowUpRight },
    { id: 'incoming', label: 'Văn bản đến', icon: ArrowDownLeft },
    { id: 'add_outgoing', label: 'Thêm văn bản đi', icon: Plus },
    { id: 'add_incoming', label: 'Thêm văn bản đến', icon: Plus },
    { id: 'qr_manager', label: 'Quản lý Mã QR', icon: QrCode },
    { id: 'guide', label: 'Hướng dẫn sử dụng', icon: BookOpen },
    // Nhân viên has full rights over their own department (types, storage
    // locations), so Settings is visible to everyone — SettingsPanel itself
    // hides the Admin-only tabs/sections (departments, accounts, approvals,
    // branding) for a non-Admin.
    { id: 'settings', label: 'Cấu hình', icon: SettingsIcon },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-slate-100 flex flex-col sticky top-0 h-screen">
        <div className="p-8 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-100 overflow-hidden">
            {settings?.logoUrl ? (
              <img src={apiService.getFileUrl(settings.logoUrl)} alt="Logo" className="w-full h-full object-contain bg-white" referrerPolicy="no-referrer" />
            ) : (
              <Database className="w-5 h-5 text-white" />
            )}
          </div>
          <span className="text-lg font-bold tracking-tight">{settings?.appName || 'Văn Thư Pro'}</span>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm font-medium transition-all group",
                activeTab === item.id 
                  ? "bg-blue-50 text-blue-600" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className={cn("w-5 h-5", activeTab === item.id ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600")} />
                {item.label}
              </div>
              {activeTab === item.id && <ChevronRight className="w-4 h-4" />}
            </button>
          ))}
        </nav>

        <div className="p-6">
          <div className="bg-slate-900 rounded-2xl p-5 text-white relative overflow-hidden">
            <div className="relative z-10">
              <p className="text-xs font-medium text-slate-400 mb-1">{settings?.orgName || 'Cơ quan'}</p>
              <p className="text-sm font-bold mb-3">Enterprise v1.2</p>
              <div className="flex items-center gap-2 text-[10px] bg-white/10 w-fit px-2 py-1 rounded-full">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                Hệ thống ổn định
              </div>
            </div>
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-600/20 rounded-full blur-2xl" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-100 px-8 flex items-center justify-between sticky top-0 z-40">
          <div className="flex-1 max-w-xl relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm kiếm theo mã số, tiêu đề hoặc nội dung..."
              className="w-full bg-slate-100 border-none py-3 pl-12 pr-4 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-6 ml-8">
            <button className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </button>
            
            <div className="h-8 w-px bg-slate-100" />

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold leading-none mb-1">{user.full_name || user.username}</p>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{user.role}</p>
              </div>
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                <UserIcon className="w-5 h-5" />
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                title="Đăng xuất"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="p-8 flex-1 overflow-y-auto">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
              {activeTab === 'dashboard' && <Dashboard onViewAllActivity={() => handleTabChange('all')} />}
              {activeTab === 'all' && <DocumentList searchQuery={searchQuery} onEdit={handleEdit} typeFilter="ALL" />}
              {activeTab === 'outgoing' && <DocumentList searchQuery={searchQuery} onEdit={handleEdit} typeFilter="OUTGOING" />}
              {activeTab === 'incoming' && <DocumentList searchQuery={searchQuery} onEdit={handleEdit} typeFilter="VAN_BAN_DEN" />}
              {activeTab === 'add_outgoing' && <DocumentForm 
                onSuccess={() => {
                  setEditingDoc(null);
                  setActiveTab('outgoing');
                }} 
                initialData={editingDoc}
              />}
              {activeTab === 'add_incoming' && <DocumentForm 
                onSuccess={() => {
                  setEditingDoc(null);
                  setActiveTab('incoming');
                }} 
                initialData={editingDoc}
                defaultType="VAN_BAN_DEN"
              />}
              {activeTab === 'qr_manager' && <QRManager />}
              {activeTab === 'settings' && <SettingsPanel />}
              {activeTab === 'guide' && <UserGuide />}
          </motion.div>
        </main>
      </div>

      <AnimatePresence>
        {scannedQR && (
          <ScannedQRView 
            qrType={scannedQR.type} 
            qrId={scannedQR.id} 
            onClose={handleCloseScan} 
            onNavigateToDocument={handleNavigateToDoc}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
