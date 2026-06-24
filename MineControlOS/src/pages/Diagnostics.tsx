import React, { useEffect, useState } from 'react';
import {
  Stethoscope,
  CheckCircle,
  XCircle,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Shield,
  Globe,
  Server,
  Wifi,
  Activity,
  ExternalLink,
} from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  message: string;
}

interface HealthResult {
  checks: DiagnosticCheck[];
  reachable: boolean;
  publicIp: string;
  cgnat: boolean;
  cgnatReason: string | null;
  overall: string;
}

export default function Diagnostics() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticCheck[]>([]);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(false);
  const [runningHealthCheck, setRunningHealthCheck] = useState(false);

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const loadDiagnostics = async () => {
    setLoading(true);
    try {
      const data = await api.getDiagnostics();
      setDiagnostics(data);
    } catch {}
    setLoading(false);
  };

  const runHealthCheck = async () => {
    setRunningHealthCheck(true);
    setHealthLoading(true);
    try {
      const result = await api.healthCheck();
      setHealth(result);
      if (result.overall === 'pass') {
        toast.success('All checks passed!');
      } else if (result.overall === 'fail') {
        toast.error('Some checks failed - see details');
      } else {
        toast('Some checks need attention', { icon: '⚠️' });
      }
    } catch (err: any) {
      toast.error(err.message);
    }
    setHealthLoading(false);
    setRunningHealthCheck(false);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle size={18} className="text-green-400" />;
      case 'fail': return <XCircle size={18} className="text-red-400" />;
      case 'warn': return <AlertTriangle size={18} className="text-yellow-400" />;
      default: return <HelpCircle size={18} className="text-gray-400" />;
    }
  };

  const statusBg = (status: string) => {
    switch (status) {
      case 'pass': return 'bg-green-500/5 border-green-500/20';
      case 'fail': return 'bg-red-500/5 border-red-500/20';
      case 'warn': return 'bg-yellow-500/5 border-yellow-500/20';
      default: return 'bg-surface-800 border-surface-700';
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
          <h2 className="text-xl font-bold text-gray-100">Server Diagnostics</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Check server configuration, connectivity, and troubleshoot issues
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadDiagnostics} className="btn-ghost p-2" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={runHealthCheck}
            disabled={runningHealthCheck}
            className="btn-primary flex items-center gap-2"
          >
            {runningHealthCheck ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Activity size={16} />
            )}
            Run Health Check
          </button>
        </div>
      </div>

      {/* Configuration Checks */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
          <Shield size={16} className="text-minecraft-500" />
          Configuration Checks
        </h3>
        <div className="space-y-2">
          {diagnostics.map((check, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-lg border ${statusBg(check.status)}`}
            >
              <div className="mt-0.5">{statusIcon(check.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200">{check.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded uppercase ${
                    check.status === 'pass' ? 'text-green-400 bg-green-500/10' :
                    check.status === 'fail' ? 'text-red-400 bg-red-500/10' :
                    check.status === 'warn' ? 'text-yellow-400 bg-yellow-500/10' :
                    'text-gray-400 bg-gray-500/10'
                  }`}>
                    {check.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{check.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Health Check Results */}
      {health && (
        <div className="card border border-minecraft-500/20">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <Activity size={16} className="text-minecraft-500" />
            Health Check Results
            <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${
              health.overall === 'pass' ? 'bg-green-500/10 text-green-400' :
              health.overall === 'fail' ? 'bg-red-500/10 text-red-400' :
              'bg-yellow-500/10 text-yellow-400'
            }`}>
              {health.overall.toUpperCase()}
            </span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-surface-800 rounded-lg p-3">
              <span className="text-xs text-gray-500 block mb-1">Public IP</span>
              <span className="text-sm font-mono text-gray-200">{health.publicIp || 'Unknown'}</span>
            </div>
            <div className="bg-surface-800 rounded-lg p-3">
              <span className="text-xs text-gray-500 block mb-1">Port Reachable</span>
              <span className={`text-sm font-medium ${health.reachable ? 'text-green-400' : 'text-red-400'}`}>
                {health.reachable ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="bg-surface-800 rounded-lg p-3">
              <span className="text-xs text-gray-500 block mb-1">CGNAT Detected</span>
              <span className={`text-sm font-medium ${health.cgnat ? 'text-yellow-400' : 'text-green-400'}`}>
                {health.cgnat ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          {health.cgnatReason && (
            <div className="flex items-start gap-3 p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 mb-4">
              <AlertTriangle size={18} className="text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-yellow-300/80">
                <p className="font-medium text-yellow-400 mb-1">CGNAT Detected</p>
                <p>{health.cgnatReason}</p>
                <p className="mt-1">Use Playit.gg tunnel to bypass CGNAT without port forwarding.</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {health.checks.map((check, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border ${statusBg(check.status)}`}
              >
                <div className="mt-0.5">{statusIcon(check.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">{check.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded uppercase ${
                      check.status === 'pass' ? 'text-green-400 bg-green-500/10' :
                      check.status === 'fail' ? 'text-red-400 bg-red-500/10' :
                      'text-yellow-400 bg-yellow-500/10'
                    }`}>
                      {check.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{check.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Fixes */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
          <Wifi size={16} className="text-minecraft-500" />
          Quick Fixes
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-surface-800 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-200 mb-2">Check Port 25565</h4>
            <p className="text-xs text-gray-500 mb-3">Run in Command Prompt:</p>
            <code className="block text-xs font-mono text-minecraft-400 bg-surface-900 px-3 py-2 rounded">
              netstat -ano | findstr :25565
            </code>
            <p className="text-xs text-gray-500 mt-2">Should show <strong className="text-green-400">0.0.0.0:25565</strong> (not 127.0.0.1)</p>
          </div>
          <div className="bg-surface-800 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-200 mb-2">Add Firewall Rule</h4>
            <p className="text-xs text-gray-500 mb-3">Run as Administrator:</p>
            <code className="block text-xs font-mono text-minecraft-400 bg-surface-900 px-3 py-2 rounded">
              netsh advfirewall firewall add rule name="Minecraft" dir=in action=allow protocol=TCP localport=25565
            </code>
          </div>
          <div className="bg-surface-800 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-200 mb-2">Fix server-ip</h4>
            <p className="text-xs text-gray-500 mb-3">In server.properties, set:</p>
            <code className="block text-xs font-mono text-minecraft-400 bg-surface-900 px-3 py-2 rounded">
              server-ip=
            </code>
            <p className="text-xs text-gray-500 mt-2">Must be empty (not 127.0.0.1)</p>
          </div>
          <div className="bg-surface-800 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-200 mb-2">Test CGNAT</h4>
            <p className="text-xs text-gray-500 mb-3">Visit in browser:</p>
            <a
              href="https://whatismyipaddress.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-minecraft-400 hover:text-minecraft-300"
            >
              whatismyipaddress.com <ExternalLink size={10} />
            </a>
            <p className="text-xs text-gray-500 mt-2">If IP starts with 100.x.x.x, you have CGNAT</p>
          </div>
        </div>
      </div>
    </div>
  );
}
