import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import { subscribeToDepartments } from '../services/departmentService';
import { Department } from '../types';
import {
  UserPlus,
  Trash2,
  Shield,
  User,
  Loader2,
  X,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

const ROLE_ICON: Record<string, any> = {
  'Admin': Shield,
  'Nhân viên': User
};

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'Nhân viên',
    departmentId: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await apiService.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    const unsub = subscribeToDepartments(setDepartments);
    return () => unsub();
  }, []);

  const getDepartmentName = (id?: string | null) => departments.find(d => d.id === id)?.name;

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newUser.role !== 'Admin' && !newUser.departmentId) {
      setError('Vui lòng chọn phòng ban cho tài khoản này.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await apiService.registerUser({
        ...newUser,
        departmentId: newUser.role === 'Admin' ? null : newUser.departmentId
      });
      setSuccess('Thêm người dùng thành công!');
      setNewUser({ username: '', password: '', full_name: '', role: 'Nhân viên', departmentId: '' });
      setIsAdding(false);
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi thêm người dùng.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id: number, username: string) => {
    if (username === 'admin') {
      alert('Không thể xóa tài khoản admin hệ thống.');
      return;
    }
    if (!confirm(`Bạn có chắc muốn xóa người dùng ${username}?`)) return;

    try {
      await apiService.deleteUser(id);
      fetchUsers();
    } catch (err) {
      alert('Lỗi khi xóa người dùng.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-blue-600">
          <Shield className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">Quản lý tài khoản</h3>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-bold uppercase hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Thêm tài khoản
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleAddUser} className="bg-slate-50 border-2 border-dashed border-blue-200 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-blue-600 uppercase tracking-wider">Tạo tài khoản mới</h4>
                <button type="button" onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">Họ tên</label>
                  <input
                    type="text"
                    required
                    value={newUser.full_name}
                    onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                    className="w-full bg-white border-none py-2 px-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10"
                    placeholder="Nguyễn Văn A"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">Tên đăng nhập</label>
                  <input
                    type="text"
                    required
                    value={newUser.username}
                    onChange={(e) => setNewUser({...newUser, username: e.target.value.toLowerCase()})}
                    className="w-full bg-white border-none py-2 px-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10"
                    placeholder="user01"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">Mật khẩu</label>
                  <input
                    type="password"
                    required
                    value={newUser.password}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    className="w-full bg-white border-none py-2 px-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">Vai trò</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                    className="w-full bg-white border-none py-2 px-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10 appearance-none"
                  >
                    <option value="Nhân viên">Nhân viên</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                {newUser.role !== 'Admin' && (
                  <div className="col-span-full md:col-span-2">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">Phòng ban</label>
                    <select
                      value={newUser.departmentId}
                      onChange={(e) => setNewUser({...newUser, departmentId: e.target.value})}
                      className="w-full bg-white border-none py-2 px-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10 appearance-none"
                    >
                      <option value="">-- Chọn phòng ban --</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    {departments.length === 0 && (
                      <p className="text-[9px] text-slate-400 italic mt-1 ml-1">Chưa có phòng ban nào — tạo ở tab "Phòng ban" trước.</p>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-[10px] font-bold uppercase hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Xác nhận tạo tài khoản'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((u) => {
          const RoleIcon = ROLE_ICON[u.role] || User;
          return (
          <div key={u.id} className="p-5 bg-white rounded-3xl border border-slate-100 flex items-center justify-between group hover:shadow-xl hover:shadow-slate-100 transition-all">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-sm",
                u.role === 'Admin' ? "bg-blue-100 text-blue-600" : "bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600"
              )}>
                <RoleIcon className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">{u.full_name}</h4>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{u.username}</span>
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded-md",
                    u.role === 'Admin' ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                  )}>
                    {u.role}
                  </span>
                  {u.departmentId && (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                      {getDepartmentName(u.departmentId) || u.departmentId}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {u.username !== 'admin' && (
              <button
                onClick={() => handleDeleteUser(u.id, u.username)}
                className="p-2 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          );
        })}
      </div>

      {loading && users.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      )}
    </div>
  );
}
