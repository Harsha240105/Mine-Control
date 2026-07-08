import { useEffect, useState } from 'react';
import { Users, Plus, Trash2, Shield, Smartphone, Save } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

interface AppUser {
  id: string;
  username: string;
  role: string;
  totp_enabled: number;
  created_at: string;
  last_login: string;
}

export default function AdminUsers() {
  const { user, isOwner } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('Member');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([api.getUsers(), api.getRoles()]);
      setUsers(u);
      setRoles(r);
    } catch (err: any) {
      toast.error(err.message);
    }
    setLoading(false);
  };

  const createUser = async () => {
    if (!newUsername || !newPassword) return;
    try {
      await api.createUser({ username: newUsername, password: newPassword, role: newRole });
      toast.success('User created');
      setShowCreate(false);
      setNewUsername('');
      setNewPassword('');
      setNewRole('Member');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const updateUserRole = async (userId: string, role: string) => {
    try {
      await api.updateUser(userId, { role });
      toast.success('Role updated');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const deleteUser = async (userId: string, username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;
    try {
      await api.deleteUser(userId);
      toast.success('User deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">User Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage application user accounts and roles</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Add User
        </button>
      </div>

      {showCreate && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <Users size={16} className="text-minecraft-500" />
            Create New User
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Username</label>
              <input value={newUsername} onChange={e => setNewUsername(e.target.value)} className="input" placeholder="Username" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Password (min 6 chars)</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input" placeholder="Password" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)} className="select">
                {roles.map((r: any) => (
                  <option key={r.name} value={r.name}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={createUser} disabled={!newUsername || !newPassword} className="btn-primary flex items-center gap-2">
              <Save size={16} />
              Create User
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wider border-b border-surface-700">
                <th className="pb-3 pr-4">Username</th>
                <th className="pb-3 pr-4">Role</th>
                <th className="pb-3 pr-4">2FA</th>
                <th className="pb-3 pr-4">Created</th>
                <th className="pb-3 pr-4">Last Login</th>
                <th className="pb-3 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-surface-800 hover:bg-surface-800/50">
                  <td className="py-3 pr-4">
                    <span className="text-gray-200 font-medium">{u.username}</span>
                    {u.username === user?.username && (
                      <span className="text-xs text-minecraft-400 ml-2">(you)</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      value={u.role}
                      onChange={e => updateUserRole(u.id, e.target.value)}
                      disabled={u.role === 'Owner' && !isOwner}
                      className="select text-xs py-1"
                    >
                      {roles.map((r: any) => (
                        <option key={r.name} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-4">
                    {u.totp_enabled ? (
                      <span className="flex items-center gap-1 text-xs text-green-400"><Smartphone size={12} /> Enabled</span>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="py-3 pr-4 text-gray-500 text-xs">{u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}</td>
                  <td className="py-3 pr-4">
                    {u.username !== user?.username && (
                      <button
                        onClick={() => deleteUser(u.id, u.username)}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
