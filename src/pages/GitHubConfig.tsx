import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Github, Save, CheckCircle, XCircle, Loader2, Eye, EyeOff, ArrowLeft
} from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

export default function GitHubConfig() {
  const navigate = useNavigate();
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const config = await api.getGitHubConfig();
        setOwner(config.owner || '');
        setRepo(config.repo || '');
        setHasToken(config.hasToken || false);
        if (config.hasToken) {
          setToken('••••••••');
        }
      } catch (err: any) {
        toast.error('Failed to load GitHub configuration');
      }
      setLoading(false);
    })();
  }, []);

  const handleTestConnection = async () => {
    if (!owner.trim() || !repo.trim()) {
      toast.error('Repository owner and name are required');
      return;
    }
    const tokenToTest = token.includes('•') ? undefined : token;
    if (!tokenToTest && !hasToken) {
      toast.error('Enter a token or save one first');
      return;
    }
    setTesting(true);
    setConnectionStatus('idle');
    setConnectionMessage('');
    try {
      const result = await api.testGitHubConnection(owner.trim(), repo.trim(), tokenToTest);
      setConnectionStatus('success');
      setConnectionMessage(`✓ Connected to ${result.fullName}`);
    } catch (err: any) {
      setConnectionStatus('error');
      setConnectionMessage(err.message || 'Connection failed');
    }
    setTesting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = { owner: owner.trim(), repo: repo.trim() };
      if (token && !token.includes('•')) {
        payload.token = token;
      }
      await api.saveGitHubConfig(payload);
      setHasToken(true);
      if (!token.includes('•')) {
        setToken('••••••••');
      }
      toast.success('GitHub configuration saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save configuration');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-3"
        >
          <ArrowLeft size={16} />
          Back to Settings
        </button>
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <Github className="text-minecraft-500" size={24} />
          GitHub Configuration
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Connect your GitHub repository for Feedback issue synchronization
        </p>
      </div>

      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
          <Github size={16} className="text-minecraft-500" />
          Repository Details
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Repository Owner</label>
            <input
              type="text"
              value={owner}
              onChange={(e) => { setOwner(e.target.value); setConnectionStatus('idle'); }}
              className="input"
              placeholder="e.g. Harsha240105"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Repository Name</label>
            <input
              type="text"
              value={repo}
              onChange={(e) => { setRepo(e.target.value); setConnectionStatus('idle'); }}
              className="input"
              placeholder="e.g. Mine-Control"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Personal Access Token {hasToken && <span className="text-green-400">(saved)</span>}
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => { setToken(e.target.value); setConnectionStatus('idle'); }}
              className="input pr-10 font-mono text-xs"
              placeholder={hasToken ? 'Token saved — enter new token to replace' : 'ghp_...'}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
            >
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Requires <span className="font-mono text-gray-400">repo</span> scope. Stored encrypted on this machine.
          </p>
        </div>

        {/* Connection Status */}
        {connectionStatus !== 'idle' && (
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-4 ${
            connectionStatus === 'success'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {connectionStatus === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {connectionMessage}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleTestConnection}
            disabled={testing || !owner.trim() || !repo.trim()}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {testing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Github size={14} />
            )}
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      <div className="card bg-surface-800/50">
        <h3 className="text-sm font-medium text-gray-200 mb-2">How it works</h3>
        <ul className="space-y-1.5 text-xs text-gray-400">
          <li className="flex items-start gap-2">
            <span className="text-minecraft-500 mt-0.5">1.</span>
            <span>Enter your GitHub repository owner and name (e.g. <span className="text-gray-300 font-mono">Harsha240105/Mine-Control</span>).</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-minecraft-500 mt-0.5">2.</span>
            <span>Generate a <span className="text-gray-300 font-mono">classic</span> PAT with <span className="text-gray-300 font-mono">repo</span> scope on GitHub.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-minecraft-500 mt-0.5">3.</span>
            <span>Test the connection to verify your token works.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-minecraft-500 mt-0.5">4.</span>
            <span>Save — your token is encrypted using AES-256-GCM and bound to this machine.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-minecraft-500 mt-0.5">5.</span>
            <span>Feedback tickets will sync to GitHub Issues automatically.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
