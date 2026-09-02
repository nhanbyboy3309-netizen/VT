import React, { useEffect, useState } from 'react';
import { apiService } from '../services/apiService';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  FileUp,
  FileDown,
  HardDrive,
  Pencil,
  RefreshCcw
} from 'lucide-react';
import { motion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '../lib/utils';

interface Props {
  onViewAllActivity?: () => void;
}

const TYPE_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-emerald-500', 'bg-amber-500', 'bg-slate-400'];

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exp);
  return `${value.toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

const ACTION_ICON: Record<string, any> = {
  'Tạo mới văn bản': FileUp,
  'Chỉnh sửa nội dung': Pencil,
  'Cập nhật trạng thái': RefreshCcw,
};

export default function Dashboard({ onViewAllActivity }: Props) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await apiService.getStats();
        setStats(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="animate-pulse space-y-8">...</div>;

  const cards = [
    { label: 'Tổng văn bản', value: stats?.totalDocuments || 0, icon: FileText, color: 'blue' },
    { label: 'Đang xử lý', value: stats?.pendingDocuments || 0, icon: Clock, color: 'orange' },
    { label: 'Đã hoàn thành', value: stats?.completedDocuments || 0, icon: CheckCircle, color: 'green' },
    { label: 'Quá hạn', value: stats?.overdueDocuments || 0, icon: AlertCircle, color: 'red' },
  ];

  const recentActivity: any[] = stats?.recentActivity || [];
  const typeBreakdown: any[] = stats?.typeBreakdown || [];
  const storageUsedBytes: number = stats?.storageUsedBytes || 0;
  const retentionAlerts: any[] = stats?.retentionAlerts || [];
  const retentionExpiredCount: number = stats?.retentionExpiredCount || 0;
  const retentionExpiringSoonCount: number = stats?.retentionExpiringSoonCount || 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Tổng quan hệ thống</h2>
          <p className="text-sm text-slate-500">Chào mừng bạn trở lại, đây là tóm tắt hoạt động hôm nay.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-100 transition-all group"
          >
            <div className={`w-12 h-12 rounded-2xl bg-${card.color}-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <card.icon className={`w-6 h-6 text-${card.color}-600`} />
            </div>
            <p className="text-sm font-medium text-slate-500 mb-1">{card.label}</p>
            <p className="text-3xl font-bold text-slate-900">{card.value}</p>
          </motion.div>
        ))}
      </div>

      {(retentionExpiredCount > 0 || retentionExpiringSoonCount > 0) && (
        <div className="bg-white p-8 rounded-3xl border border-amber-100 shadow-sm">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-bold">Cảnh báo hết hạn lưu trữ (ISO 15489)</h3>
            </div>
            <div className="flex items-center gap-2">
              {retentionExpiredCount > 0 && (
                <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-red-100 text-red-700 uppercase">{retentionExpiredCount} đã hết hạn</span>
              )}
              {retentionExpiringSoonCount > 0 && (
                <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700 uppercase">{retentionExpiringSoonCount} sắp hết hạn</span>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {retentionAlerts.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{item.number} — {item.title}</p>
                  <p className="text-[10px] text-slate-400">
                    Thời hạn: {item.retentionPeriod || 'Vĩnh viễn'}
                    {item.expiryDate ? ` • Hết hạn: ${new Date(item.expiryDate).toLocaleDateString('vi-VN')}` : ''}
                  </p>
                </div>
                <span className={cn(
                  "text-[10px] font-bold px-2 py-1 rounded-full shrink-0 uppercase",
                  item.status === 'expired' ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                )}>
                  {item.status === 'expired' ? 'Hết hạn' : 'Sắp hết hạn'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold">Hoạt động gần đây</h3>
            {onViewAllActivity && (
              <button onClick={onViewAllActivity} className="text-sm font-bold text-blue-600 hover:underline">
                Xem tất cả
              </button>
            )}
          </div>
          <div className="space-y-6">
            {recentActivity.length === 0 && (
              <p className="text-sm text-slate-400 italic text-center py-8">Chưa có hoạt động nào được ghi nhận.</p>
            )}
            {recentActivity.map((entry) => {
              const Icon = ACTION_ICON[entry.action] || FileText;
              return (
                <div key={entry.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl transition-all">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {entry.action}{entry.doc_number ? ` — ${entry.doc_number}` : ''}
                      {entry.doc_title ? `: ${entry.doc_title}` : ''}
                    </p>
                    <p className="text-xs text-slate-500">
                      Bởi {entry.user_name || 'Hệ thống'} • {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true, locale: vi })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-blue-600 p-8 rounded-3xl text-white relative overflow-hidden shadow-xl shadow-blue-200">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="w-5 h-5" />
                <h3 className="text-lg font-bold">Dung lượng lưu trữ</h3>
              </div>
              <p className="text-sm text-blue-100 mb-6">Tổng dung lượng file đã tải lên hệ thống.</p>
              <p className="text-3xl font-black">{formatBytes(storageUsedBytes)}</p>
            </div>
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-3xl" />
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold mb-6">Phân bổ theo loại</h3>
            <div className="space-y-4">
              {typeBreakdown.length === 0 && (
                <p className="text-xs text-slate-400 italic">Chưa có văn bản nào để thống kê.</p>
              )}
              {typeBreakdown.map((item, i) => (
                <div key={item.typeId} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span>{item.label}</span>
                    <span>{item.percent}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${TYPE_COLORS[i % TYPE_COLORS.length]}`} style={{ width: `${item.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
