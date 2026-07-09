import { useEffect, useState } from 'react';
import { Shield, Key, Smartphone, Plus, Trash2, ToggleLeft, ToggleRight, CheckCircle, XCircle, Copy, Download } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useActiveServer } from '../hooks/useActiveServer';
import { Button } from '../components/ui/stateful-button';
import toast from 'react-hot-toast';

interface IPEntry {
  id: string;
  server_id: string;
  ip_address: string;
  description: string;
  created_by: string;
  created_at: string;
}

export default function SecuritySettings() {
  const { user } = useAuth();
  const { server: activeServer } = useActiveServer();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'2fa' | 'whitelist'>('2fa');

  // 2FA state
  const [tfaEnabled, setTfaEnabled] = useState(false);
  const [tfaSecret, setTfaSecret] = useState('');
  const [tfaQrCode, setTfaQrCode] = useState('');
  const [tfaRecoveryCodes, setTfaRecoveryCodes] = useState<string[]>([]);
  const [showTfaSetup, setShowTfaSetup] = useState(false);
  const [tfaVerifyToken, setTfaVerifyToken] = useState('');
  const [tfaDisablePassword, setTfaDisablePassword] = useState('');

  // IP whitelist state
  const [whitelistEnabled, setWhitelistEnabled] = useState(false);
  const [whitelistEntries, setWhitelistEntries] = useState<IPEntry[]>([]);
  const [newIp, setNewIp] = useState('');
  const [newIpDesc, setNewIpDesc] = useState('');

  useEffect(() => {
    loadData();
  }, [activeServer?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const status = await api.get2FAStatus();
      setTfaEnabled(status.enabled);
    } catch {}
    try {
      const wl = await api.getIpWhitelist(activeServer?.id);
      setWhitelistEntries(wl.entries || []);
      setWhitelistEnabled(wl.enabled);
    } catch {}
    setLoading(false);
  };

  const setupTFA = async () => {
    try {
      const res = await api.setup2FA();
      setTfaSecret(res.secret);
      setTfaQrCode(res.qrCodeDataUrl);
      setTfaRecoveryCodes(res.recoveryCodes || []);
      setShowTfaSetup(true);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const verifyTFA = async () => {
    if (!tfaVerifyToken) return;
    try {
      await api.verify2FA(tfaVerifyToken);
      toast.success('2FA enabled successfully');
      setShowTfaSetup(false);
      setTfaEnabled(true);
      setTfaVerifyToken('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const disableTFA = async () => {
    if (!tfaDisablePassword) return;
    try {
      await api.disable2FA(tfaDisablePassword);
      toast.success('2FA disabled');
      setTfaEnabled(false);
      setTfaDisablePassword('');
      setTfaSecret('');
      setTfaQrCode('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const copyRecoveryCodes = () => {
    navigator.clipboard.writeText(tfaRecoveryCodes.join('\n'));
    toast.success('Recovery codes copied');
  };

  const addWhitelistEntry = async () => {
    if (!newIp) return;
    try {
      const res = await api.addIpWhitelist(newIp, newIpDesc, activeServer?.id);
      setWhitelistEntries(prev => [res.entry, ...prev]);
      setNewIp('');
      setNewIpDesc('');
      toast.success('IP added to whitelist');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const removeWhitelistEntry = async (id: string) => {
    try {
      await api.removeIpWhitelist(id);
      setWhitelistEntries(prev => prev.filter(e => e.id !== id));
      toast.success('IP removed from whitelist');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggleWhitelist = async () => {
    try {
      const res = await api.toggleIpWhitelist(!whitelistEnabled);
      setWhitelistEnabled(res.enabled);
      toast.success(`IP whitelist ${res.enabled ? 'enabled' : 'disabled'}`);
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
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-gray-100">Security Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Two-factor authentication and IP whitelist management</p>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-surface-800">
        <Button
          variant="none"
          onClick={() => setTab('2fa')}
          className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
            tab === '2fa'
              ? 'bg-minecraft-500/10 text-minecraft-400 border border-minecraft-500/20'
              : 'text-gray-500 hover:text-gray-300 hover:bg-surface-800'
          }`}
        >
          <Smartphone size={16} />
          Two-Factor Auth
        </Button>
        <Button
          variant="none"
          onClick={() => setTab('whitelist')}
          className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
            tab === 'whitelist'
              ? 'bg-minecraft-500/10 text-minecraft-400 border border-minecraft-500/20'
              : 'text-gray-500 hover:text-gray-300 hover:bg-surface-800'
          }`}
        >
          <Shield size={16} />
          IP Whitelist
        </Button>
      </div>

      {tab === '2fa' && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <Smartphone size={16} className="text-minecraft-500" />
            Two-Factor Authentication
          </h3>

          {tfaEnabled ? (
            <div>
              <div className="flex items-center gap-2 text-sm text-green-400 mb-4">
                <CheckCircle size={16} />
                2FA is enabled
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Enter password to disable 2FA</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={tfaDisablePassword}
                      onChange={e => setTfaDisablePassword(e.target.value)}
                      placeholder="Current password"
                      className="input flex-1"
                    />
                    <Button variant="danger" onClick={disableTFA}>
                      <XCircle size={16} />
                      Disable 2FA
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : showTfaSetup ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>

              {tfaQrCode && (
                <div className="flex justify-center">
                  <img src={tfaQrCode} alt="2FA QR Code" className="w-48 h-48 bg-white p-2 rounded-lg" />
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">Or enter this secret manually</label>
                <div className="flex gap-2">
                  <input readOnly value={tfaSecret} className="input flex-1 font-mono text-xs" />
                  <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(tfaSecret); toast.success('Secret copied'); }}>
                    <Copy size={14} />
                    Copy
                  </Button>
                </div>
              </div>

              {tfaRecoveryCodes.length > 0 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Recovery codes (save these somewhere safe)</label>
                  <div className="bg-surface-900 rounded-lg p-3 text-xs font-mono text-gray-400">
                    {tfaRecoveryCodes.map((c, i) => (
                      <div key={i}>{c}</div>
                    ))}
                  </div>
                  <Button variant="secondary" onClick={copyRecoveryCodes} className="mt-2 text-xs">
                    <Copy size={12} />
                    Copy Codes
                  </Button>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">Verify by entering a 6-digit code from your authenticator app</label>
                <div className="flex gap-2">
                  <input
                    value={tfaVerifyToken}
                    onChange={e => setTfaVerifyToken(e.target.value)}
                    placeholder="000000"
                    maxLength={6}
                    className="input w-32 font-mono text-center text-lg"
                  />
                  <Button variant="primary" onClick={verifyTFA}>
                    <CheckCircle size={16} />
                    Verify & Enable
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500 mb-4">Add an extra layer of security by requiring a one-time code from your authenticator app when logging in.</p>
              <Button variant="primary" onClick={setupTFA}>
                <Smartphone size={16} />
                Set Up 2FA
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'whitelist' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                <Shield size={16} className="text-minecraft-500" />
                IP Whitelist
              </h3>
              <Button variant="none" onClick={toggleWhitelist} className="text-sm">
                {whitelistEnabled ? (
                  <ToggleRight size={20} className="text-minecraft-400" />
                ) : (
                  <ToggleLeft size={20} className="text-gray-500" />
                )}
                <span className={whitelistEnabled ? 'text-minecraft-400' : 'text-gray-500'}>
                  {whitelistEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </Button>
            </div>
            <p className="text-xs text-gray-500 mb-4">Only allow access from specified IP addresses. When enabled, all other IPs will be blocked from accessing this server.</p>

            <div className="flex gap-2 mb-4">
              <input
                value={newIp}
                onChange={e => setNewIp(e.target.value)}
                placeholder="IP address (e.g. 192.168.1.100)"
                className="input flex-1"
              />
              <input
                value={newIpDesc}
                onChange={e => setNewIpDesc(e.target.value)}
                placeholder="Description (optional)"
                className="input w-48"
              />
              <Button variant="primary" onClick={addWhitelistEntry} disabled={!newIp}>
                <Plus size={16} />
                Add
              </Button>
            </div>

            {whitelistEntries.length === 0 ? (
              <p className="text-sm text-gray-600 py-4 text-center">No IP addresses in the whitelist yet.</p>
            ) : (
              <div className="space-y-2">
                {whitelistEntries.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between bg-surface-800 rounded-lg px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-gray-200">{entry.ip_address}</span>
                        {entry.description && <span className="text-xs text-gray-500">— {entry.description}</span>}
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        Added by {entry.created_by || 'system'} on {new Date(entry.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Button variant="none" onClick={() => removeWhitelistEntry(entry.id)} className="text-gray-500 hover:text-red-400 transition-colors">
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
