import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Save, CheckCircle, AlertTriangle, XCircle, HelpCircle,
  Loader2, RefreshCw, Power, PowerOff, Send, History,
  Shield, ExternalLink, ChevronDown, ChevronUp, Zap, Copy, Trash2, Check,
} from 'lucide-react';
import { api } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import { useActiveServer } from '../hooks/useActiveServer';
import toast from 'react-hot-toast';
import { Button } from '../components/ui/stateful-button';

interface NotificationEvent {
  key: string;
  label: string;
  default: boolean;
}

interface BotStatus {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  botName: string;
  guildName: string;
  textChannelName: string;
  lastError: string;
  lastNotificationAt: string | null;
  notificationCount: number;
}

interface HistoryEntry {
  id: number;
  event_type: string;
  title: string;
  content: string;
  sent_at: string;
  success: number;
  error: string;
}

const NOTIFICATION_EVENTS: NotificationEvent[] = [
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

function StatusIndicator({ status }: { status: BotStatus | null }) {
  const connected = status?.connected;
  const connecting = status?.connecting;
  const reconnecting = status?.reconnecting;
  const hasError = !connected && !connecting && !reconnecting && !!status?.lastError;

  let dotClass = 'bg-gray-500';
  let textClass = 'text-gray-400';
  let label = 'Disconnected';

  if (connected) {
    dotClass = 'bg-green-500 shadow-sm shadow-green-500/50';
    textClass = 'text-green-400';
    label = 'Connected';
  } else if (reconnecting) {
    dotClass = 'bg-blue-500 animate-pulse shadow-sm shadow-blue-500/50';
    textClass = 'text-blue-400';
    label = 'Reconnecting';
  } else if (connecting) {
    dotClass = 'bg-yellow-500 animate-pulse shadow-sm shadow-yellow-500/50';
    textClass = 'text-yellow-400';
    label = 'Connecting';
  } else if (hasError) {
    dotClass = 'bg-red-500 shadow-sm shadow-red-500/50';
    textClass = 'text-red-400';
    label = 'Error';
  }

  return (
    <div className="card flex items-center gap-3 py-3 px-5 flex-wrap">
      <span className={`w-3 h-3 rounded-full shrink-0 ${dotClass}`} />
      <span data-testid="bot-status" className={`text-sm font-medium ${textClass}`}>{label}</span>
      {connected && status?.botName && (
        <span className="text-xs text-gray-400">
          as <span className="text-blue-400 font-mono">{status.botName}</span>
        </span>
      )}
      {status?.guildName && (
        <span className="text-xs text-gray-500 hidden sm:inline">
          Guild: <span className="text-gray-300">{status.guildName}</span>
        </span>
      )}
      {status?.textChannelName && (
        <span className="text-xs text-gray-500 hidden sm:inline">
          Channel: <span className="text-gray-300">#{status.textChannelName}</span>
        </span>
      )}
      <div className="flex-1 min-w-0" />
      {hasError && (
        <span className="text-xs text-red-400 flex items-center gap-1 max-w-[200px] truncate" title={status.lastError}>
          <AlertTriangle size={12} className="shrink-0" />
          {status.lastError}
        </span>
      )}
      {status?.lastNotificationAt && (
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <Zap size={12} className="text-blue-400" />
          {status.notificationCount} sent
        </span>
      )}
    </div>
  );
}

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
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [permissions, setPermissions] = useState<{ text: string[]; voice: string[]; admin: boolean } | null>(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await api.getDiscordConfig();
      if (data.botToken) setToken(data.botToken);
      if (data.textChannelId) setChannelId(data.textChannelId);
      if (data.voiceChannelId) setVoiceChannelId(data.voiceChannelId);
      if (data.autoReconnect !== undefined) setAutoReconnect(data.autoReconnect);
      if (data.isConfigured !== undefined) setIsConfigured(data.isConfigured);
      if (data.notify_server_start !== undefined) {
        const n: Record<string, boolean> = {};
        for (const ev of NOTIFICATION_EVENTS) {
          n[ev.key] = data[ev.key] ?? ev.default;
        }
        setNotifications(n);
      }
    } catch {}
    setLoading(false);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await api.getDiscordStatus();
      setBotStatus(s);
    } catch {}
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await api.getDiscordHistory(100);
      setHistory(data);
    } catch {}
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (!activeServer) return;
    fetchConfig();
    fetchStatus();
  }, [activeServer?.id, fetchConfig, fetchStatus]);

  useEffect(() => {
    if (!socket) return;
    const handler = (status: BotStatus) => setBotStatus(status);
    socket.on('discord:update', handler);
    return () => { socket.off('discord:update', handler); };
  }, [socket]);

  useEffect(() => {
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        text_channel_id: channelId,
        voice_channel_id: voiceChannelId,
        auto_reconnect: autoReconnect,
      };
      if (token && token !== '••••••••') {
        payload.bot_token = token;
      }
      for (const ev of NOTIFICATION_EVENTS) {
        payload[ev.key] = notifications[ev.key] ?? ev.default;
      }
      const result = await api.saveDiscordConfig(payload);
      setIsConfigured(true);
      if (result.connected === false) {
        toast.error('Config saved but bot failed to connect: ' + (result.lastError || 'Unknown error'));
      } else {
        toast.success('Discord settings saved');
      }
      setTimeout(fetchStatus, 1500);
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
        toast.success('Bot connected');
        setBotStatus(result.status);
      } else {
        const errMsg = result.error || result.status?.lastError || 'Failed to connect';
        toast.error(errMsg);
        setBotStatus(result.status);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    try {
      const result = await api.disconnectDiscord();
      toast.success('Bot disconnected');
      setBotStatus(result.status);
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
      if (result.success) toast.success('Connection test passed');
      else toast.error(result.message);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
      toast.error(err.message);
    }
    setTesting(false);
  };

  const handleCheckPermissions = async () => {
    if (showPermissions) {
      setShowPermissions(false);
      return;
    }
    try {
      const p = await api.getDiscordPermissions();
      setPermissions(p);
      setShowPermissions(true);
    } catch (err: any) {
      toast.error('Failed to check permissions: ' + err.message);
    }
  };

  const handleTestMessage = async () => {
    try {
      const result = await api.sendDiscordTestMessage();
      if (result.success) toast.success('Test message sent');
      else toast.error('Failed to send test message');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleReconnect = async () => {
    try {
      const r = await api.reconnectDiscord();
      if (r.success) toast.success('Reconnected');
      else toast.error('Reconnect failed');
    } catch {
      toast.error('Reconnect failed');
    }
  };

  const handleClearHistory = async () => {
    try {
      await api.clearDiscordHistory();
      setHistory([]);
      toast.success('History cleared');
    } catch (err: any) {
      toast.error('Failed to clear history: ' + err.message);
    }
  };

  const handleCopyHistory = async (entry: HistoryEntry) => {
    const text = `[${entry.event_type}] ${entry.title} - ${entry.content || ''} (${new Date(entry.sent_at).toLocaleString()})`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const isConnected = botStatus?.connected;
  const isConnecting = botStatus?.connecting || connecting;
  const isReconnecting = botStatus?.reconnecting;
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
        <Loader2 size={24} className="text-minecraft-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="text-blue-500 shrink-0" size={22} />
          <h2 className="text-xl font-bold text-gray-100">Discord Integration</h2>
        </div>
        {isConfigured && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <CheckCircle size={12} className="text-green-500" />
            Configuration saved
          </span>
        )}
      </div>

      {/* Status Bar */}
      <StatusIndicator status={botStatus} />

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
                  placeholder="Enter your bot token"
                  className="input font-mono text-sm w-full"
                />
                <p className="text-xs text-gray-600 mt-1">Stored securely in the database. Never exposed via API.</p>
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
              <Button onClick={handleSave} loading={saving}>
                <Save size={14} />
                Save Configuration
              </Button>
              <Button variant="secondary" onClick={handleTest} loading={testing} disabled={!token || !channelId}>
                <RefreshCw size={14} />
                Test Connection
              </Button>
              <Button variant="secondary" onClick={handleTestMessage} disabled={!isConnected}>
                <Send size={14} /> Send Test Message
              </Button>
            </div>

            {testResult && (
              <div className={`mt-3 p-3 rounded-lg text-xs flex items-start gap-2 ${testResult.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {testResult.success ? <CheckCircle size={14} className="shrink-0 mt-0.5" /> : <XCircle size={14} className="shrink-0 mt-0.5" />}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Notification Settings */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Notification Events</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
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
                <Button variant="none" onClick={handleDisconnect} className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400">
                  <PowerOff size={14} /> Disconnect Bot
                </Button>
              ) : (
                <Button variant="none" onClick={handleConnect} loading={connecting} disabled={!token || !channelId} className="w-full bg-green-600/20 hover:bg-green-600/30 text-green-400">
                  <Power size={14} />
                  {connecting ? 'Connecting...' : 'Connect Bot'}
                </Button>
              )}
              <Button variant="none" onClick={handleReconnect} disabled={!token} className="w-full bg-surface-800 hover:bg-surface-700 text-gray-300">
                <RefreshCw size={14} /> Reconnect
              </Button>
              <Button variant="none" onClick={handleCheckPermissions} disabled={!isConnected} className="w-full bg-surface-800 hover:bg-surface-700 text-gray-300">
                <Shield size={14} /> {showPermissions ? 'Hide' : 'Check'} Permissions
              </Button>
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

          {/* Setup Guide */}
          <div className="card">
            <button
              onClick={() => setShowSetupGuide(!showSetupGuide)}
              className="text-sm font-semibold text-gray-200 cursor-pointer flex items-center gap-2 w-full text-left"
            >
              <HelpCircle size={14} className="text-blue-400 shrink-0" />
              Setup Guide
              {showSetupGuide ? <ChevronUp size={14} className="ml-auto text-gray-500" /> : <ChevronDown size={14} className="ml-auto text-gray-500" />}
            </button>
            {showSetupGuide && (
              <div className="mt-3 text-xs text-gray-400 space-y-2">
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Discord Developer Portal</a></li>
                  <li>Create a new application, go to Bot tab</li>
                  <li>Reset &amp; copy the bot token</li>
                  <li>Enable <strong>Message Content Intent</strong></li>
                  <li>Use OAuth2 URL Generator to invite the bot</li>
                  <li>Copy the text channel ID (Developer Mode)</li>
                </ol>
                <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-400 hover:underline mt-2">
                  <ExternalLink size={11} /> Open Developer Portal
                </a>
              </div>
            )}
          </div>

          {/* Notification History */}
          <div className="card">
            <button
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory(); }}
              className="text-sm font-semibold text-gray-200 cursor-pointer flex items-center gap-2 w-full text-left"
            >
              <History size={14} className="text-minecraft-500 shrink-0" />
              Notification History ({history.length})
              {showHistory ? <ChevronUp size={14} className="ml-auto text-gray-500" /> : <ChevronDown size={14} className="ml-auto text-gray-500" />}
            </button>
            {showHistory && (
              <div className="mt-3 space-y-1">
                {history.length > 0 && (
                  <div className="flex gap-2 mb-2">
                    <Button variant="none" onClick={handleClearHistory} className="text-[10px] px-2 py-1 bg-red-600/10 hover:bg-red-600/20 text-red-400">
                      <Trash2 size={10} /> Clear
                    </Button>
                  </div>
                )}
                <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                  {historyLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 size={16} className="text-gray-500 animate-spin" />
                    </div>
                  ) : history.length === 0 ? (
                    <p className="text-xs text-gray-500 py-2">No notifications sent yet</p>
                  ) : (
                    history.map((h) => (
                      <div key={h.id} className="bg-surface-800 rounded p-2 text-[10px] flex items-start gap-2 group">
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-gray-300 gap-2">
                            <span className="font-medium truncate">{h.event_type.replace(/_/g, ' ')}</span>
                            <span className="text-gray-500 shrink-0">{new Date(h.sent_at).toLocaleTimeString()}</span>
                          </div>
                          <div className="text-gray-500 truncate">{h.title}</div>
                          {!h.success && h.error && (
                            <div className="text-red-400 truncate">{h.error}</div>
                          )}
                        </div>
                        <button
                          onClick={() => handleCopyHistory(h)}
                          className="text-gray-600 hover:text-gray-300 transition-colors shrink-0 mt-0.5"
                          title="Copy"
                        >
                          {copiedId === h.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
