import React, { useState, useEffect } from 'react';
import { MessageSquare, Save, CheckCircle, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

const NOTIFICATION_EVENTS = [
  { key: 'serverStart', label: 'Server Start' },
  { key: 'serverStop', label: 'Server Stop' },
  { key: 'serverCrash', label: 'Server Crash' },
  { key: 'backupCreated', label: 'Backup Created' },
  { key: 'playerJoin', label: 'Player Join' },
  { key: 'playerLeave', label: 'Player Leave' },
] as const;

export default function Discord() {
  const [token, setToken] = useState('');
  const [channelId, setChannelId] = useState('');
  const [voiceChannelId, setVoiceChannelId] = useState('');
  const [notifications, setNotifications] = useState<Record<string, boolean>>({
    serverStart: true,
    serverStop: true,
    serverCrash: true,
    backupCreated: true,
    playerJoin: false,
    playerLeave: false,
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await api.get('/discord');
        if (data.token) setToken(data.token);
        if (data.channelId) setChannelId(data.channelId);
        if (data.voiceChannelId) setVoiceChannelId(data.voiceChannelId);
        if (data.notifications) setNotifications({ ...notifications, ...data.notifications });
      } catch (err: any) {
        toast.error('Failed to load Discord settings: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/discord', { token, channelId, voiceChannelId, notifications });
      toast.success('Discord settings saved! Bot is restarting...');
    } catch (err: any) {
      toast.error('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-gray-400">Loading Discord settings...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 lg:p-10 animate-fade-in max-w-4xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-100 flex items-center gap-3">
          <MessageSquare className="text-blue-500" size={32} />
          Discord Integration
        </h1>
        <p className="text-gray-400 mt-2 text-lg">
          Connect a Discord Bot to synchronize chat and events.
        </p>
      </div>

      <div className="card p-6 border border-blue-500/20 bg-blue-500/5 mb-8">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400">
            <CheckCircle size={24} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-100">Live Chat Synchronization</h3>
            <p className="text-gray-400 text-sm mt-1 mb-4">
              When configured, the bot will automatically send Minecraft server startup, crash, and player join/leave events to the specified Discord channel. It also enables 2-way chat between the Discord channel and the Minecraft server.
            </p>
            <div className="text-sm bg-black/30 p-3 rounded-lg border border-gray-700/50">
              <ol className="list-decimal pl-5 space-y-2 text-gray-300">
                <li>Create a new application in the <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Discord Developer Portal</a>.</li>
                <li>Go to the <strong>Bot</strong> tab, reset the token, and copy it here.</li>
                <li>Enable the <strong>Message Content Intent</strong> under Privileged Gateway Intents.</li>
                <li>Invite the bot to your server using the OAuth2 URL Generator.</li>
                <li>Copy the ID of the channel where you want the bot to post messages.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card p-6">
          <h2 className="text-xl font-bold text-gray-100 mb-6">Bot Configuration</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Discord Bot Token</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="MTE..."
                className="input-field font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-2">Keep this token secret. It gives full access to your Discord bot.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Target Channel ID</label>
              <input
                type="text"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                placeholder="123456789012345678"
                className="input-field font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-2">Enable Developer Mode in Discord to right-click a channel and copy its ID.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Voice Channel ID</label>
              <input
                type="text"
                value={voiceChannelId}
                onChange={(e) => setVoiceChannelId(e.target.value)}
                placeholder="123456789012345678"
                className="input-field font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-2">The bot will use this for voice integrations (e.g., channel status updates).</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">Notification Events</label>
              <div className="grid grid-cols-2 gap-3">
                {NOTIFICATION_EVENTS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer p-3 rounded-lg bg-surface-800/50 border border-surface-700/50 hover:border-surface-600 transition-colors">
                    <input
                      type="checkbox"
                      checked={notifications[key]}
                      onChange={(e) => setNotifications(prev => ({ ...prev, [key]: e.target.checked }))}
                      className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
                    />
                    <span className="text-sm text-gray-200">{label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">Choose which events the bot should notify about in the target channel.</p>
            </div>

          </div>

          <div className="mt-8 pt-6 border-t border-gray-800 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary flex items-center gap-2"
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save & Restart Bot'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
