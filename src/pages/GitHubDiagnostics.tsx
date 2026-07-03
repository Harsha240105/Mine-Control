import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import toast from 'react-hot-toast';
import {
  Github, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  Server, Clock, List, ExternalLink, Loader2, Activity,
} from 'lucide-react';

interface CheckItem {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

interface SyncStats {
  pending: number;
  failed: number;
  lastSync: string | null;
  recentErrors: { ticket_id: string; error: string; last_attempt: string }[];
}

export default function GitHubDiagnostics() {
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [sync, setSync] = useState<SyncStats | null>(null);
  const [overall, setOverall] = useState<string>('pending');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const data = await api.get('/github/diagnostics') as any;
      setChecks(data.checks);
      setSync(data.sync);
      setOverall(data.overall);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load diagnostics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      await api.post('/github/test-connection', {});
      toast.success('Connection test passed');
      fetchDiagnostics();
    } catch (err: any) {
      toast.error(err.message || 'Connection test failed');
      fetchDiagnostics();
    } finally {
      setTesting(false);
    }
  };

  const handleRetryFailed = async () => {
    setRetrying(true);
    try {
      const result = await api.post('/github/retry-failed', {}) as any;
      toast.success(`Retried ${result.retried} failed items`);
      fetchDiagnostics();
    } catch (err: any) {
      toast.error(err.message || 'Failed to retry');
    } finally {
      setRetrying(false);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle size={18} className="text-green-400 shrink-0" />;
      case 'fail': return <XCircle size={18} className="text-red-400 shrink-0" />;
      default: return <AlertTriangle size={18} className="text-yellow-400 shrink-0" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-200 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Github size={28} className="text-purple-400" />
            <h1 className="text-2xl font-bold text-white">GitHub Diagnostics</h1>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            overall === 'pass' ? 'bg-green-900/50 text-green-300' :
            overall === 'fail' ? 'bg-red-900/50 text-red-300' :
            'bg-yellow-900/50 text-yellow-300'
          }`}>
            {overall === 'pass' ? 'All Checks Passed' :
             overall === 'fail' ? 'Issues Detected' :
             'Needs Attention'}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-purple-400" />
          </div>
        ) : (
          <>
            {/* Checks */}
            <div className="bg-surface-900/50 rounded-xl border border-surface-700 overflow-hidden">
              <div className="px-5 py-3 border-b border-surface-700 flex items-center gap-2">
                <Activity size={16} className="text-purple-400" />
                <span className="font-semibold text-white">System Checks</span>
              </div>
              <div className="divide-y divide-surface-700/50">
                {checks.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-500">No checks available</div>
                ) : (
                  checks.map((check, i) => (
                    <div key={i} className="px-5 py-3 flex items-start gap-3">
                      {statusIcon(check.status)}
                      <div className="min-w-0">
                        <div className="font-medium text-white text-sm">{check.name}</div>
                        <div className={`text-xs mt-0.5 ${
                          check.status === 'pass' ? 'text-green-400/70' :
                          check.status === 'fail' ? 'text-red-400/70' :
                          'text-yellow-400/70'
                        }`}>{check.message}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Sync Queue */}
            <div className="bg-surface-900/50 rounded-xl border border-surface-700 overflow-hidden">
              <div className="px-5 py-3 border-b border-surface-700 flex items-center gap-2">
                <List size={16} className="text-purple-400" />
                <span className="font-semibold text-white">Sync Queue</span>
              </div>
              <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-surface-800/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-white">{sync?.pending ?? 0}</div>
                  <div className="text-xs text-gray-400 mt-1">Pending</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-3 text-center">
                  <div className={`text-2xl font-bold ${(sync?.failed ?? 0) > 0 ? 'text-red-400' : 'text-white'}`}>{sync?.failed ?? 0}</div>
                  <div className="text-xs text-gray-400 mt-1">Failed</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-3 text-center">
                  <Clock size={20} className="mx-auto text-gray-400 mb-1" />
                  <div className="text-xs text-gray-400 truncate max-w-full">
                    {sync?.lastSync ? new Date(sync.lastSync).toLocaleString() : 'Never'}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">Last Sync</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-3 text-center">
                  <Server size={20} className="mx-auto text-gray-400 mb-1" />
                  <div className="text-xs text-gray-400">Queue</div>
                  <div className="text-[10px] text-gray-500 mt-1">Status</div>
                </div>
              </div>
            </div>

            {/* Recent Errors */}
            {sync?.recentErrors && sync.recentErrors.length > 0 && (
              <div className="bg-surface-900/50 rounded-xl border border-red-900/30 overflow-hidden">
                <div className="px-5 py-3 border-b border-red-900/30 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-400" />
                  <span className="font-semibold text-red-300">Recent Sync Errors</span>
                </div>
                <div className="divide-y divide-red-900/20">
                  {sync.recentErrors.map((err, i) => (
                    <div key={i} className="px-5 py-3">
                      <div className="flex items-start gap-2">
                        <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-xs font-mono text-red-300 break-all">{err.error}</div>
                          <div className="text-[10px] text-gray-500 mt-1">
                            Ticket: {err.ticket_id} | Last attempt: {new Date(err.last_attempt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
              >
                {testing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {testing ? 'Testing...' : 'Test GitHub Connection'}
              </button>
              <button
                onClick={handleRetryFailed}
                disabled={retrying || (sync?.failed ?? 0) === 0}
                className="flex items-center gap-2 px-4 py-2 bg-red-600/80 hover:bg-red-500 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
              >
                {retrying ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {retrying ? 'Retrying...' : 'Retry All Failed'}
              </button>
              <button
                onClick={() => {
                  window.open('https://github.com/settings/tokens', '_blank', 'noopener,noreferrer');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-surface-700 hover:bg-surface-600 text-gray-300 rounded-lg transition-colors text-sm"
              >
                <ExternalLink size={16} />
                GitHub Token Settings
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
