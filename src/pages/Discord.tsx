import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Save, CheckCircle, AlertTriangle, XCircle, HelpCircle,
  Loader, RefreshCw, Power, PowerOff, Plug, PlugZap, Send, History,
  Shield, ShieldOff, ExternalLink, ChevronDown, ChevronUp, Zap, Radio,
} from 'lucide-react';
import { api } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import { useActiveServer } from '../hooks/useActiveServer';
import toast from 'react-hot-toast';

const NOTIFICATION_EVENTS = [
  { key: 'notify_server_start', label: 'Server Start', default: true },
  { key: 'notify_server_stop', label: 'Server Stop', default: true },
  { key: 'notify_server_crash', label: 'Server Crash', default: true },
  { key: 'notify_server_restart', label: 'Server Restart', default: true },
  { key: 'notify_backup_created', label: 'Backup Created', default: true },
  { key: 'notify_backup_restored', label: 'Backup Restored', default: true },
  { key: 'notify_backup_failed', label: 'Backup Failed', default: true },
  { key: 'notify_player_join', label: 'Player Join', default: false },
  { key: 'notify_player_left', label: 'Player Leave', default: false },
  { key: 'notify_player_kicked', label: 'Player Kicked', default: false },
  { key: 'notify_player_banned', label: 'Player Banned', default: true },
  { key: 'notify_player_unbanned', label: 'Player Unbanned', default: true },
  { key: 'notify_player_approved', label: 'Player Approved', default: true },
  { key: 'notify_whitelist_updated', label: 'Whitelist Updated', default: true },
  { key: 'notify_software_changed', label: 'Software Changed', default: true },
  { key: 'notify_version_changed', label: 'Version Changed', default: true },
  { key: 'notify_update_available', label: 'Update Available', default: true },
];

export default function Discord() {
  const { server: activeServer } = useActiveServer();
  const { socket } = useSocket();
  const [token, setToken] = useState('');
  const [channelId, setChannelId] = useState('');
  const [voiceChannelId, setVoiceChannelId] = useState('');
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [botStatus, setBotStatus] = useState<any>(null);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [permissions, setPermissions] = useState<any>(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchStatus();
    fetchHistory();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('discord:update', (status: any) => setBotStatus(status));
    return () => { socket.off('discord:update'); };
  }, [socket]);

  const fetchConfig = async () => {
    try {
      const data = await api.getDiscordConfig();
      if (data.botToken) setToken(data.botToken);
      if (data.textChannelId) setChannelId(data.textChannelId);
      if (data.voiceChannelId) setVoiceChannelId(data.voiceChannelId);
      if (data.autoReconnect !== undefined) setAutoReconnect(data.autoReconnect);
      if (data.notify_server_start !== undefined) {
        const n: Record<string, boolean> = {};
        for (const ev of NOTIFICATION_EVENTS) {
          n[ev.key] = data[ev.key] ?? ev.default;
        }
        setNotifications(n);
      }
    } catch {}
    setLoading(false);
  };

  const fetchStatus = async () => {
    try { setBotStatus(await api.getDiscordStatus()); } catch {}
  };

  const fetchHistory = async () => {
    try { setHistory(await api.getDiscordHistory(20)); } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        bot_token: token,
        text_channel_id: channelId,
        voice_channel_id: voiceChannelId,
        auto_reconnect: autoReconnect,
      };
      for (const ev of NOTIFICATION_EVENTS) {
        payload[ev.key] = notifications[ev.key] ?? ev.default;
      }
      await api.saveDiscordConfig(payload);
      toast.success('Discord settings saved!');
      setTimeout(fetchStatus, 1000);
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    }
    setSaving(false);
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const result = await api.connectDiscord();
      if (result.success) {
        toast.success('Bot connected!');
        setBotStatus(result.status);
      } else {
        toast.error(result.error || 'Failed to connect');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    try {
      await api.disconnectDiscord();
      toast.success('Bot disconnected');
      setBotStatus(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testDiscordConnection(token, channelId);
      setTestResult(result);
      if (result.success) toast.success('Connection test passed!');
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    }
    setTesting(false);
  };

  const handleCheckPermissions = async () => {
    setShowPermissions(!showPermissions);
    if (!showPermissions) {
      try { setPermissions(await api.getDiscordPermissions()); } catch {}
    }
  };

  const handleTestMessage = async () => {
    try {
      const result = await api.sendDiscordTestMessage();
      if (result.success) toast.success('Test message sent!');
      else toast.error('Failed to send test message');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const isConnected = botStatus?.connected;
  const isConnecting = botStatus?.connecting || connecting;
  const botName = botStatus?.botName || 'N/A';

  if (!activeServer) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <MessageSquare className="w-12 h-12 mx-auto text-gray-500" />
          <p className="text-gray-400 text-sm font-medium">No server selected</p>
          <p className="text-gray-600 text-xs">Select a server first to configure Discord integration.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader size={24} className="text-minecraft-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="text-blue-500" size={22} />
            <h2 className="text-xl font-bold text-gray-100">Discord Integration</h2>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Connect a bot to notify your community about server events</p>
        </div>
      </div>

      {/* Status Bar */}
      <div className="card flex items-center gap-3 py-3 px-5">
        <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : isConnecting ? 'bg-yellow-500 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-sm font-medium">{isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}</span>
        {isConnected && (
          <span className="text-xs text-gray-400">as <span className="text-blue-400 font-mono">{botName}</span></span>
        )}
        {botStatus?.guildName && (
          <span className="text-xs text-gray-500">· Guild: <span className="text-gray-300">{botStatus.guildName}</span></span>
        )}
        {botStatus?.textChannelName && (
          <span className="text-xs text-gray-500">· Channel: <span className="text-gray-300">#{botStatus.textChannelName}</span></span>
        )}
        <div className="flex-1" />
        {botStatus?.lastNotificationAt && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Zap size={12} className="text-blue-400" />
            {botStatus.notificationCount} notifications
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Bot Configuration */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Bot Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Bot Token</label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="MTE..."
                  className="input font-mono text-sm w-full"
                />
                <p className="text-xs text-gray-600 mt-1">Keep this secret. Never share it.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Text Channel ID</label>
                  <input
                    type="text"
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    placeholder="123456789012345678"
                    className="input font-mono text-sm w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Voice Channel ID (optional)</label>
                  <input
                    type="text"
                    value={voiceChannelId}
                    onChange={(e) => setVoiceChannelId(e.target.value)}
                    placeholder="123456789012345678"
                    className="input font-mono text-sm w-full"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoReconnect}
                  onChange={(e) => setAutoReconnect(e.target.checked)}
                  className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
                />
                <span className="text-xs text-gray-300">Auto-reconnect after application restart</span>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
                {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
              <button onClick={handleTest} disabled={testing || !token || !channelId} className="btn-secondary flex items-center gap-2 text-sm">
                {testing ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <button onClick={handleTestMessage} disabled={!isConnected} className="btn-secondary flex items-center gap-2 text-sm">
                <Send size={14} /> Send Test
              </button>
            </div>

            {testResult && (
              <div className={`mt-3 p-3 rounded-lg text-xs ${testResult.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                <span className="flex items-center gap-1">
                  {testResult.success ? <CheckCircle size={12} /> : <XCircle size={12} />}
                  {testResult.message}
                </span>
              </div>
            )}
          </div>

          {/* Notification Settings */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Notification Events</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {NOTIFICATION_EVENTS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer p-2.5 rounded-lg bg-surface-800/50 border border-surface-700/50 hover:border-surface-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={notifications[key] ?? false}
                    onChange={(e) => setNotifications(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
                  />
                  <span className="text-xs text-gray-200">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Controls Panel */}
        <div className="space-y-4">
          {/* Bot Actions */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Bot Controls</h3>
            <div className="space-y-2">
              {isConnected ? (
                <button onClick={handleDisconnect} className="w-full flex items-center gap-2 text-sm bg-red-600/20 hover:bg-red-600/30 text-red-400 px-3 py-2 rounded-lg transition-colors">
                  <PowerOff size={14} /> Disconnect Bot
                </button>
              ) : (
                <button onClick={handleConnect} disabled={connecting || !token || !channelId} className="w-full flex items-center gap-2 text-sm bg-green-600/20 hover:bg-green-600/30 text-green-400 px-3 py-2 rounded-lg transition-colors">
                  {connecting ? <Loader size={14} className="animate-spin" /> : <Power size={14} />}
                  {connecting ? 'Connecting...' : 'Connect Bot'}
                </button>
              )}
              <button onClick={() => api.reconnectDiscord().then(r => { if (r.success) toast.success('Reconnected'); else toast.error('Reconnect failed'); }).catch(() => toast.error('Failed'))} disabled={!token} className="w-full flex items-center gap-2 text-sm bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-2 rounded-lg transition-colors">
                <RefreshCw size={14} /> Reconnect Bot
              </button>
              <button onClick={handleCheckPermissions} disabled={!isConnected} className="w-full flex items-center gap-2 text-sm bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-2 rounded-lg transition-colors">
                <Shield size={14} /> {showPermissions ? 'Hide' : 'Check'} Permissions
              </button>
            </div>

            {showPermissions && permissions && (
              <div className="mt-3 space-y-2 text-xs">
                {permissions.text.length > 0 && (
                  <div>
                    <span className="text-gray-400 block mb-1">Text Channel:</span>
                    <div className="flex flex-wrap gap-1">
                      {permissions.text.map((p: string) => (
                        <span key={p} className="bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded text-[10px]">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
                {permissions.voice.length > 0 && (
                  <div>
                    <span className="text-gray-400 block mb-1">Voice Channel:</span>
                    <div className="flex flex-wrap gap-1">
                      {permissions.voice.map((p: string) => (
                        <span key={p} className="bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded text-[10px]">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
                {permissions.admin && (
                  <span className="inline-block bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded text-[10px]">Administrator</span>
                )}
                {permissions.text.length === 0 && permissions.voice.length === 0 && (
                  <span className="text-gray-500">No special permissions</span>
                )}
              </div>
            )}
          </div>

          {/* Setup Instructions */}
          <details className="card">
            <summary className="text-sm font-semibold text-gray-200 cursor-pointer flex items-center gap-2">
              <HelpCircle size={14} className="text-blue-400" />
              Setup Guide
            </summary>
            <div className="mt-3 text-xs text-gray-400 space-y-2">
              <ol className="list-decimal list-inside space-y-1.5">
                <li>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Discord Developer Portal</a></li>
                <li>Create a new application, go to Bot tab</li>
                <li>Reset &amp; copy the bot token</li>
                <li>Enable <strong>Message Content Intent</strong></li>
                <li>Use OAuth2 URL Generator to invite the bot</li>
                <li>Copy the text channel ID (Developer Mode)</li>
              </ol>
            </div>
          </details>

          {/* Diagnostics History */}
          <details className="card">
            <summary className="text-sm font-semibold text-gray-200 cursor-pointer flex items-center gap-2" onClick={(e) => { setShowHistory(!showHistory); if (!showHistory) fetchHistory(); }}>
              <History size={14} className="text-minecraft-500" />
              Notification History ({history.length})
            </summary>
            {showHistory && (
              <div className="mt-3 space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                {history.length === 0 ? (
                  <p className="text-xs text-gray-500 py-2">No notifications sent yet</p>
                ) : (
                  history.map((h: any, i: number) => (
                    <div key={h.id || i} className="bg-surface-800 rounded p-2 text-[10px]">
                      <div className="flex justify-between text-gray-300">
                        <span className="font-medium">{h.event_type}</span>
                        <span className="text-gray-500">{new Date(h.sent_at).toLocaleString()}</span>
                      </div>
                      <div className="text-gray-500 truncate">{h.title}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </details>
        </div>
      </div>
    </div>
  );
}
