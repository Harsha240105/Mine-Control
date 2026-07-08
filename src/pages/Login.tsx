import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Server, Eye, EyeOff, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [require2FA, setRequire2FA] = useState(false);
  const [totpToken, setTotpToken] = useState('');
  const [userId, setUserId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      const result = await login(username, password);
      if (result && result.require2FA) {
        setRequire2FA(true);
        setUserId(result.userId || '');
        setLoading(false);
        return;
      }
      toast.success('Welcome to MineControl OS');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpToken) {
      toast.error('Please enter your 2FA code');
      return;
    }
    setLoading(true);
    try {
      const result = await api.loginWith2FA(username, password, totpToken);
      localStorage.setItem('mc_token', result.token);
      toast.success('Welcome to MineControl OS');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Invalid 2FA code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-950 p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-minecraft-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-800 border border-surface-700 mb-4 glow">
            <Server className="w-8 h-8 text-minecraft-500" />
          </div>
          <h1 className="text-2xl font-bold">
            <span className="text-minecraft-400">Mine</span>
            <span className="text-gray-100">Control</span>
            <span className="text-minecraft-500">OS</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Minecraft Server Management</p>
        </div>

        <div className="card p-8">
          {require2FA ? (
            <form onSubmit={handle2FASubmit} className="space-y-5">
              <div className="text-center mb-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-minecraft-500/10 mb-3">
                  <Smartphone className="w-6 h-6 text-minecraft-400" />
                </div>
                <p className="text-sm text-gray-300">Two-Factor Authentication</p>
                <p className="text-xs text-gray-500 mt-1">Enter the 6-digit code from your authenticator app</p>
              </div>

              <div>
                <input
                  value={totpToken}
                  onChange={e => setTotpToken(e.target.value)}
                  className="input text-center text-2xl font-mono tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || totpToken.length !== 6}
                className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
              >
                {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>

              <button
                type="button"
                onClick={() => { setRequire2FA(false); setTotpToken(''); }}
                className="text-xs text-gray-500 hover:text-gray-300 w-full text-center"
              >
                Back to login
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input"
                  placeholder="Enter username"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pr-10"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
              >
                {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          )}

          <div className="mt-6 p-3 bg-surface-800/50 rounded-lg border border-surface-700">
            <p className="text-xs text-gray-500 text-center">
              Default login: <span className="text-gray-300 font-mono">owner</span> /{' '}
              <span className="text-gray-300 font-mono">minecontrol</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
