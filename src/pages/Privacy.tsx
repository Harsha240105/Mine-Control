import React, { useEffect, useState } from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, ShieldOff, Lock, Unlock, Eye, EyeOff,
  Key, FolderOpen, Globe, Server, HardDrive, Database, Trash2, Download,
  RefreshCw, AlertTriangle, CheckCircle, XCircle, ChevronRight, ExternalLink,
  Info, Clock, Wifi, MessageSquare, Activity, Upload, Terminal, Settings,
  FileText, Save, Users, Star, AlertOctagon, Search,
} from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface Location { label: string; path: string; size: string; exists: boolean; }
interface Integration { key: string; label: string; purpose: string; dataShared: string; enabled: boolean; connected: boolean; lastConnection: string | null; }
interface Permission { feature_key: string; label: string; description: string; enabled: number; }
interface Credential { key: string; displayName: string; hasValue: boolean; lastUpdated: string | null; maskedValue: string | null; }
interface SecurityCheck { check_type: string; status: string; detail: string; checked_at: string; }
interface AuditEntry { id: number; action: string; detail: string; timestamp: string; }

type Tab = 'overview' | 'data' | 'integrations' | 'permissions' | 'credentials' | 'export' | 'security' | 'audit';

export default function Privacy() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [locations, setLocations] = useState<Location[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [securityStatus, setSecurityStatus] = useState<any>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningCheck, setRunningCheck] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [exportWithSecrets, setExportWithSecrets] = useState(false);
  const [score, setScore] = useState<number>(0);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [loc, int, perm, cred, sec] = await Promise.all([
        api.getPrivacyLocations().catch(() => []),
        api.getPrivacyIntegrations().catch(() => []),
        api.getPrivacyPermissions().catch(() => []),
        api.getPrivacyCredentials().catch(() => []),
        api.getSecurityStatus().catch(() => null),
      ]);
      setLocations(loc);
      setIntegrations(int);
      setPermissions(perm);
      setCredentials(cred);
      setSecurityStatus(sec);
      setScore(sec?.score ?? 0);
    } catch { toast.error('Failed to load privacy data'); }
    finally { setLoading(false); }
  };

  const openFolder = async (folderPath: string) => {
    try {
      await api.openPrivacyFolder(folderPath);
    } catch { toast.error('Failed to open folder'); }
  };

  const togglePermission = async (featureKey: string, current: number) => {
    const newVal = current === 0;
    try {
      await api.setPrivacyPermission(featureKey, newVal);
      setPermissions(prev => prev.map(p => p.feature_key === featureKey ? { ...p, enabled: newVal ? 1 : 0 } : p));
      toast.success(`${featureKey.replace(/_/g, ' ')} ${newVal ? 'enabled' : 'disabled'}`);
      loadAll();
    } catch { toast.error('Failed to update permission'); }
  };

  const saveCredential = async (key: string) => {
    const value = credentialValues[key];
    if (!value) { toast.error('Enter a value'); return; }
    try {
      await api.savePrivacyCredential(key, value);
      setCredentialValues(prev => ({ ...prev, [key]: '' }));
      toast.success('Credential saved securely');
      const cred = await api.getPrivacyCredentials();
      setCredentials(cred);
    } catch { toast.error('Failed to save credential'); }
  };

  const deleteCredential = async (key: string) => {
    try {
      await api.deletePrivacyCredential(key);
      toast.success('Credential deleted');
      const cred = await api.getPrivacyCredentials();
      setCredentials(cred);
    } catch { toast.error('Failed to delete credential'); }
  };

  const runSecurityCheck = async () => {
    setRunningCheck(true);
    try {
      const result = await api.runSecurityCheck();
      setScore(result.score);
      toast.success(`Security check complete — Score: ${result.score}/100`);
      const sec = await api.getSecurityStatus();
      setSecurityStatus(sec);
    } catch { toast.error('Security check failed'); }
    finally { setRunningCheck(false); }
  };

  const handleExport = async () => {
    try {
      const data = await api.exportPrivacyData(exportWithSecrets);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `minecontrol-privacy-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Privacy data exported');
    } catch { toast.error('Export failed'); }
  };

  const handleDeleteAll = async () => {
    try {
      await api.deleteAllUserData();
      toast.success('All data deleted. Please restart the application.');
    } catch { toast.error('Delete failed'); }
  };

  const loadAuditLog = async () => {
    try {
      const log = await api.getPrivacyAuditLog(50);
      setAuditLog(log);
    } catch {}
  };

  const getScoreColor = (s: number) => {
    if (s >= 80) return 'text-green-400';
    if (s >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreBg = (s: number) => {
    if (s >= 80) return 'bg-green-500/10 border-green-500/20';
    if (s >= 50) return 'bg-yellow-500/10 border-yellow-500/20';
    return 'bg-red-500/10 border-red-500/20';
  };

  const getScoreIcon = (s: number) => {
    if (s >= 80) return ShieldCheck;
    if (s >= 50) return ShieldAlert;
    return ShieldOff;
  };

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'Overview', icon: Shield },
    { key: 'data', label: 'Data Locations', icon: HardDrive },
    { key: 'integrations', label: 'Integrations', icon: Globe },
    { key: 'permissions', label: 'Permissions', icon: Lock },
    { key: 'credentials', label: 'Credentials', icon: Key },
    { key: 'security', label: 'Security Health', icon: Activity },
    { key: 'export', label: 'Export & Delete', icon: Download },
    { key: 'audit', label: 'Audit Log', icon: FileText },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-minecraft-500 border-t-transparent" />
      </div>
    );
  }

  const ScoreIcon = getScoreIcon(score);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-xl ${getScoreBg(score)}`}>
          <ScoreIcon size={22} className={getScoreColor(score)} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-100">Privacy & Security Center</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Security Score: <span className={`font-semibold ${getScoreColor(score)}`}>{score}/100</span>
            {securityStatus?.lastChecked && (
              <span className="ml-3 text-xs text-gray-600">
                Last check: {new Date(securityStatus.lastChecked).toLocaleString()}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-surface-800">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); if (tab.key === 'audit') loadAuditLog(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-minecraft-500/10 text-minecraft-400 border border-minecraft-500/20'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-surface-800'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ===== OVERVIEW ===== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Security Score */}
          <div className={`card ${getScoreBg(score)}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-200">Security Score</h3>
              <button
                onClick={runSecurityCheck}
                disabled={runningCheck}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-minecraft-500/10 text-minecraft-400 hover:bg-minecraft-500/20 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={runningCheck ? 'animate-spin' : ''} />
                {runningCheck ? 'Running...' : 'Run Check'}
              </button>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-4xl font-bold" style={{ color: score >= 80 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444' }}>
                {score}
                <span className="text-lg text-gray-500 font-normal">/100</span>
              </div>
              <div className="flex gap-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-green-400">{securityStatus?.passCount || 0}</div>
                  <div className="text-[11px] text-gray-500">Passed</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-yellow-400">{securityStatus?.warnCount || 0}</div>
                  <div className="text-[11px] text-gray-500">Warnings</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-400">{securityStatus?.failCount || 0}</div>
                  <div className="text-[11px] text-gray-500">Failed</div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card-hover">
              <div className="flex items-center gap-2 mb-2">
                <Database size={14} className="text-cyan-400" />
                <span className="text-xs font-medium text-gray-400">Database</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${securityStatus?.checks?.find((c: any) => c.check_type === 'database_status')?.status === 'pass' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-xs text-gray-300">
                  {securityStatus?.checks?.find((c: any) => c.check_type === 'database_status')?.detail || 'Unknown'}
                </span>
              </div>
            </div>
            <div className="card-hover">
              <div className="flex items-center gap-2 mb-2">
                <Lock size={14} className="text-purple-400" />
                <span className="text-xs font-medium text-gray-400">Encryption</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${securityStatus?.checks?.find((c: any) => c.check_type === 'encryption_status')?.status === 'pass' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-xs text-gray-300">
                  {securityStatus?.checks?.find((c: any) => c.check_type === 'encryption_status')?.detail || 'Unknown'}
                </span>
              </div>
            </div>
            <div className="card-hover">
              <div className="flex items-center gap-2 mb-2">
                <Save size={14} className="text-green-400" />
                <span className="text-xs font-medium text-gray-400">Backup Status</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${securityStatus?.checks?.find((c: any) => c.check_type === 'backup_status')?.status === 'pass' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-xs text-gray-300">
                  {securityStatus?.checks?.find((c: any) => c.check_type === 'backup_status')?.detail || 'Unknown'}
                </span>
              </div>
            </div>
            <div className="card-hover">
              <div className="flex items-center gap-2 mb-2">
                <Wifi size={14} className="text-blue-400" />
                <span className="text-xs font-medium text-gray-400">Firewall</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${securityStatus?.checks?.find((c: any) => c.check_type === 'firewall_status')?.status === 'pass' ? 'bg-green-500' : securityStatus?.checks?.find((c: any) => c.check_type === 'firewall_status')?.status === 'warn' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                <span className="text-xs text-gray-300">
                  {securityStatus?.checks?.find((c: any) => c.check_type === 'firewall_status')?.detail || 'Unknown'}
                </span>
              </div>
            </div>
          </div>

          {/* Privacy Notice */}
          <div className="card bg-blue-500/5 border border-blue-500/20">
            <div className="flex items-start gap-3">
              <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-blue-400 mb-1">Local-First by Design</h3>
                <p className="text-xs text-gray-400">
                  MineControl OS stores all data locally on your machine. No data is uploaded to external servers unless you explicitly configure and enable an integration (Discord, Playit.gg, Issue Tracker). You have full control over what data is stored, what is shared, and when it is deleted.
                </p>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          {securityStatus?.checks?.some((c: any) => c.status !== 'pass') && (
            <div className="card border border-yellow-500/20 bg-yellow-500/5">
              <h3 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2">
                <AlertTriangle size={16} />
                Recommendations
              </h3>
              <div className="space-y-2">
                {securityStatus.checks.filter((c: any) => c.status !== 'pass').map((c: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 ${c.status === 'fail' ? 'text-red-400' : 'text-yellow-400'}`}>
                      {c.status === 'fail' ? <XCircle size={12} /> : <AlertTriangle size={12} />}
                    </span>
                    <div>
                      <span className="text-gray-300 capitalize">{c.check_type.replace(/_/g, ' ')}: </span>
                      <span className="text-gray-500">{c.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== DATA LOCATIONS ===== */}
      {activeTab === 'data' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            All data is stored locally on your machine. Click a folder to open it in your file explorer.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {locations.map((loc, i) => (
              <div key={i} className="card-hover flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-200 truncate">{loc.label}</h3>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{loc.path}</p>
                  <p className="text-[11px] text-gray-600 mt-0.5">{loc.size}</p>
                </div>
                <button
                  onClick={() => openFolder(loc.path)}
                  className="p-2 text-gray-500 hover:text-minecraft-400 hover:bg-surface-800 rounded-lg transition-colors ml-2 shrink-0"
                  title="Open folder"
                >
                  <FolderOpen size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="card bg-surface-800/50 border border-surface-700">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Info size={12} className="text-blue-400" />
              Base path: <code className="text-minecraft-400">{locations[0]?.path?.split('data')[0] || 'N/A'}</code>
            </div>
          </div>
        </div>
      )}

      {/* ===== INTEGRATIONS ===== */}
      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            These optional external services can be enabled or disabled individually. None are active without your consent.
          </p>
          <div className="space-y-3">
            {integrations.map((int, i) => (
              <div key={i} className="card-hover">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-200">{int.label}</h3>
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${
                        int.enabled ? (int.connected ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400') : 'bg-gray-800 text-gray-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${int.enabled ? (int.connected ? 'bg-green-500' : 'bg-yellow-500') : 'bg-gray-500'}`} />
                        {int.enabled ? (int.connected ? 'Connected' : 'Enabled') : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{int.purpose}</p>
                    {int.dataShared && (
                      <div className="mt-2 text-[11px] text-gray-600">
                        <span className="text-gray-500">Data shared: </span>{int.dataShared}
                      </div>
                    )}
                    {int.lastConnection && (
                      <p className="text-[11px] text-gray-600 mt-1">
                        Last connection: {new Date(int.lastConnection).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== PERMISSIONS ===== */}
      {activeTab === 'permissions' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Control which features and permissions are enabled. Disabled features cannot access your system or data.
          </p>
          <div className="space-y-2">
            {permissions.map((perm) => (
              <div key={perm.feature_key} className="card-hover flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-200">{perm.label}</h3>
                  <p className="text-xs text-gray-500">{perm.description}</p>
                </div>
                <button
                  onClick={() => togglePermission(perm.feature_key, perm.enabled)}
                  className={`relative w-10 h-5 rounded-full transition-colors ml-3 ${
                    perm.enabled ? 'bg-green-500/50' : 'bg-gray-700'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    perm.enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== CREDENTIALS ===== */}
      {activeTab === 'credentials' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            API keys and tokens are encrypted at rest using AES-256-GCM with a machine-derived key. They are never displayed in plaintext in the UI or logs.
          </p>
          <div className="space-y-3">
            {credentials.map((cred) => (
              <div key={cred.key} className="card-hover">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-medium text-gray-200">{cred.displayName}</h3>
                    <p className="text-xs text-gray-500">Key: {cred.key}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {cred.hasValue ? (
                      <>
                        <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Stored</span>
                        <button
                          onClick={() => deleteCredential(cred.key)}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-500">Not configured</span>
                    )}
                  </div>
                </div>
                {cred.hasValue && cred.lastUpdated && (
                  <p className="text-[11px] text-gray-600 mb-2">Last updated: {new Date(cred.lastUpdated).toLocaleString()}</p>
                )}
                {!cred.hasValue && (
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="Enter value..."
                      value={credentialValues[cred.key] || ''}
                      onChange={(e) => setCredentialValues(prev => ({ ...prev, [cred.key]: e.target.value }))}
                      className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-minecraft-500/50"
                    />
                    <button
                      onClick={() => saveCredential(cred.key)}
                      className="px-3 py-1.5 bg-minecraft-500/10 text-minecraft-400 rounded-lg text-sm hover:bg-minecraft-500/20 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== SECURITY HEALTH ===== */}
      {activeTab === 'security' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Detailed security check results and recommendations.</p>
            <button
              onClick={runSecurityCheck}
              disabled={runningCheck}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-minecraft-500/10 text-minecraft-400 hover:bg-minecraft-500/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={runningCheck ? 'animate-spin' : ''} />
              {runningCheck ? 'Running...' : 'Run Full Check'}
            </button>
          </div>

          <div className={`card ${getScoreBg(score)}`}>
            <div className="flex items-center gap-3 mb-3">
              <ScoreIcon size={24} className={getScoreColor(score)} />
              <div>
                <h3 className="text-lg font-bold text-gray-100">Security Score: <span className={getScoreColor(score)}>{score}/100</span></h3>
                {securityStatus?.lastChecked && (
                  <p className="text-xs text-gray-500">Last checked: {new Date(securityStatus.lastChecked).toLocaleString()}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
              {(securityStatus?.checks || []).map((check: SecurityCheck, i: number) => (
                <div key={i} className={`p-3 rounded-lg border ${
                  check.status === 'pass' ? 'bg-green-500/5 border-green-500/20' :
                  check.status === 'warn' ? 'bg-yellow-500/5 border-yellow-500/20' :
                  'bg-red-500/5 border-red-500/20'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {check.status === 'pass' ? <CheckCircle size={14} className="text-green-400" /> :
                     check.status === 'warn' ? <AlertTriangle size={14} className="text-yellow-400" /> :
                     <XCircle size={14} className="text-red-400" />}
                    <span className="text-xs font-medium text-gray-300 capitalize">{check.check_type.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-[11px] text-gray-500">{check.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {securityStatus?.maskSecretsInLogs !== undefined && (
            <div className="card bg-surface-800/50 border border-surface-700">
              <h3 className="text-sm font-semibold text-gray-200 mb-3">Privacy Settings</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Mask secrets in logs</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${securityStatus.maskSecretsInLogs ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {securityStatus.maskSecretsInLogs ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Mask secrets in UI</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${securityStatus.maskSecretsInUi ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {securityStatus.maskSecretsInUi ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Collect analytics</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${securityStatus.collectAnalytics ? 'bg-yellow-500/10 text-yellow-400' : 'bg-green-500/10 text-green-400'}`}>
                    {securityStatus.collectAnalytics ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Auto-clear logs</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${securityStatus.autoClearLogs ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                    {securityStatus.autoClearLogs ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Log retention</span>
                  <span className="text-xs text-gray-400">{securityStatus.logRetentionDays} days</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== EXPORT & DELETE ===== */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          {/* Export */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
              <Download size={16} className="text-blue-400" />
              Export Data
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Export your application settings, privacy preferences, and metadata. Secrets (encrypted credentials) are excluded by default.
            </p>
            <label className="flex items-center gap-2 mb-4 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={exportWithSecrets}
                onChange={(e) => setExportWithSecrets(e.target.checked)}
                className="rounded border-surface-600 bg-surface-800 text-minecraft-500 focus:ring-minecraft-500"
              />
              Include encrypted credentials in export
            </label>
            <button onClick={handleExport} className="btn-primary text-sm flex items-center gap-2">
              <Download size={14} />
              Export Privacy Data
            </button>
          </div>

          {/* Clear Operations */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
              <Trash2 size={16} className="text-yellow-400" />
              Clear Data
            </h3>
            <div className="space-y-2">
              <ClearAction label="Clear Cache" desc="Download cache, temp files" onAction={() => api.clearPrivacyCache()} />
              <ClearAction label="Clear Logs" desc="Chat logs, audit logs, server log files" onAction={() => api.clearPrivacyLogs()} />
              <ClearAction label="Clear Feedback Queue" desc="Pending feedback sync queue" onAction={() => api.clearPrivacyFeedback()} />
              <ClearAction label="Clear Diagnostics" desc="Connection diagnostics history" onAction={() => api.clearPrivacyDiagnostics()} />
            </div>
          </div>

          {/* Delete All */}
          <div className="card border border-red-500/20 bg-red-500/5">
            <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
              <AlertOctagon size={16} />
              Delete All User Data
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              This will permanently delete all servers, players, worlds, backups, settings, and preferences. This action cannot be undone.
            </p>
            {confirming === 'delete-all' ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-red-400">Are you sure? This cannot be undone.</p>
                <button onClick={handleDeleteAll} className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors">
                  Confirm Delete
                </button>
                <button onClick={() => setConfirming(null)} className="px-3 py-1.5 text-gray-500 rounded-lg text-sm hover:text-gray-300 transition-colors">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming('delete-all')}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-sm hover:bg-red-500/20 transition-colors"
              >
                <Trash2 size={14} />
                Delete All User Data
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== AUDIT LOG ===== */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Security-relevant events are logged here for accountability.</p>
            <button onClick={loadAuditLog} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
          {auditLog.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-sm text-gray-500">No audit log entries yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {auditLog.map((entry) => (
                <div key={entry.id} className="card-hover flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-minecraft-500 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-300 capitalize">{entry.action.replace(/_/g, ' ')}</span>
                      <span className="text-[11px] text-gray-600">{new Date(entry.timestamp).toLocaleString()}</span>
                    </div>
                    {entry.detail && <p className="text-xs text-gray-500 mt-0.5">{entry.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClearAction({ label, desc, onAction }: { label: string; desc: string; onAction: () => Promise<any> }) {
  const [busy, setBusy] = useState(false);
  const handleClick = async () => {
    setBusy(true);
    try {
      const result = await onAction();
      toast.success(result.message || `${label} cleared`);
    } catch { toast.error(`Failed to clear ${label}`); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-surface-800/50 border border-surface-700/50">
      <div>
        <span className="text-sm text-gray-300">{label}</span>
        <p className="text-[11px] text-gray-600">{desc}</p>
      </div>
      <button
        onClick={handleClick}
        disabled={busy}
        className="text-xs px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
      >
        {busy ? 'Clearing...' : 'Clear'}
      </button>
    </div>
  );
}
