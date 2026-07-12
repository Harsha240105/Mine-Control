import { useState } from 'react';
import { Server, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface AppLockScreenProps {
  onUnlocked: () => void;
}

export default function AppLockScreen({ onUnlocked }: AppLockScreenProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = useRecovery ? recoveryCode : code;
    if (!token) {
      toast.error('Please enter a code');
      return;
    }
    setLoading(true);
    try {
      if (useRecovery) {
        await api.verifyRecoveryCode(token);
      } else {
        await api.verifyAppLock(token);
      }
      toast.success('Unlocked');
      onUnlocked();
    } catch (err: any) {
      toast.error(err.message || 'Invalid code');
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
          <p className="text-gray-500 text-sm mt-1">App is locked</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleVerify} className="space-y-5">
            <div className="text-center mb-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-minecraft-500/10 mb-3">
                <Smartphone className="w-6 h-6 text-minecraft-400" />
              </div>
              <p className="text-sm text-gray-300">
                {useRecovery ? 'Enter a recovery code' : 'Enter the 6-digit code from your authenticator app'}
              </p>
            </div>

            <div>
              <input
                value={useRecovery ? recoveryCode : code}
                onChange={e => useRecovery ? setRecoveryCode(e.target.value) : setCode(e.target.value)}
                className="input text-center text-2xl font-mono tracking-widest"
                placeholder={useRecovery ? 'XXXXXXXX' : '000000'}
                maxLength={useRecovery ? 8 : 6}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading || (!useRecovery && code.length !== 6) || (useRecovery && !recoveryCode)}
              className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {loading ? 'Verifying...' : 'Unlock'}
            </button>

            <button
              type="button"
              onClick={() => { setUseRecovery(!useRecovery); setCode(''); setRecoveryCode(''); }}
              className="text-xs text-gray-500 hover:text-gray-300 w-full text-center"
            >
              {useRecovery ? 'Use authenticator code instead' : 'Use recovery code'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
