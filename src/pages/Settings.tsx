import React, { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon, Save, Key, Shield, Server, RefreshCw,
  Eye, EyeOff, Globe, Users, Wifi
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, isOwner } = useAuth();
  const [config, setConfig] = useState<any>({});
  const [props, setProps] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    Promise.all([fetchConfig(), fetchProps()]).finally(() => setLoading(false));
  }, []);

  const fetchConfig = async () => {
    try { setConfig(await api.getServerConfig()); } catch {}
  };

  const fetchProps = async () => {
    try { setProps(await api.getServerProperties()); } catch {}
  };

  const handleSave = async () => {
    try {
      await api.updateServerConfig(config);
      await api.updateServerProperties({
        'online-mode': props['online-mode'],
        'level-seed': props['level-seed'],
        motd: props.motd || config.motd,
        'max-players': props['max-players'] || config.maxPlayers,
        difficulty: props.difficulty || config.difficulty,
        'view-distance': props['view-distance'] || config.viewDistance,
        pvp: props.pvp !== 'false' ? 'true' : 'false',
      });
      toast.success('Saved. Restart server for changes to take effect.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      setCurrentPassword(''); setNewPassword('');
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
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-gray-100">Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Configure your Minecraft server</p>
      </div>

      {/* Connection Mode */}
      <div className="card border border-minecraft-500/20">
        <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
          <Wifi size={16} className="text-minecraft-500" />
          Connection Mode
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          <strong className="text-yellow-400">Cracked (offline)</strong> — TLauncher &amp; any client can join without a Mojang account.
          {' '}<strong className="text-green-400">Premium (online)</strong> — Only official Minecraft accounts can join.
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => setProps({ ...props, 'online-mode': 'false' })}
            className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all ${
              props['online-mode'] === 'false'
                ? 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-400'
                : 'bg-surface-800 border border-surface-600 text-gray-400 hover:border-gray-500'
            }`}
          >
            <span className="block text-lg mb-1">🟡</span>
            Cracked (TLauncher)
          </button>
          <button
            onClick={() => setProps({ ...props, 'online-mode': 'true' })}
            className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all ${
              props['online-mode'] === 'true'
                ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                : 'bg-surface-800 border border-surface-600 text-gray-400 hover:border-gray-500'
            }`}
          >
            <span className="block text-lg mb-1">🟢</span>
            Premium (Official)
          </button>
        </div>
      </div>

      {/* Server Configuration */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
          <Server size={16} className="text-minecraft-500" />
          Server Configuration
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Server Name (MOTD)</label>
            <input
              type="text"
              value={props.motd || config.motd || ''}
              onChange={(e) => setProps({ ...props, motd: e.target.value })}
              className="input"
            />
            <p className="text-xs text-gray-500 mt-1">Use § for color codes</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">World Seed</label>
            <input
              type="text"
              value={props['level-seed'] || ''}
              onChange={(e) => setProps({ ...props, 'level-seed': e.target.value })}
              className="input"
              placeholder="Leave empty for random"
            />
            <p className="text-xs text-gray-500 mt-1">Only applies to new worlds</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Max Players</label>
            <input
              type="number"
              value={props['max-players'] || config.maxPlayers || 4}
              onChange={(e) => setProps({ ...props, 'max-players': e.target.value })}
              className="input"
              min={1}
              max={20}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Difficulty</label>
            <select
              value={props.difficulty || config.difficulty || 'normal'}
              onChange={(e) => setProps({ ...props, difficulty: e.target.value })}
              className="select"
            >
              <option value="peaceful">Peaceful</option>
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Default Gamemode</label>
            <select
              value={config.gamemode || 'survival'}
              onChange={(e) => setConfig({ ...config, gamemode: e.target.value })}
              className="select"
            >
              <option value="survival">Survival</option>
              <option value="creative">Creative</option>
              <option value="adventure">Adventure</option>
              <option value="spectator">Spectator</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Server Port</label>
            <input
              type="number"
              value={config.port || 25565}
              onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 25565 })}
              className="input"
              min={1024}
              max={65535}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">View Distance</label>
            <input
              type="number"
              value={props['view-distance'] || config.viewDistance || 10}
              onChange={(e) => setProps({ ...props, 'view-distance': e.target.value })}
              className="input"
              min={3}
              max={32}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Min RAM</label>
            <input
              type="text"
              value={config.minRam || '2G'}
              onChange={(e) => setConfig({ ...config, minRam: e.target.value })}
              className="input"
              placeholder="2G"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Max RAM</label>
            <input
              type="text"
              value={config.maxRam || '8G'}
              onChange={(e) => setConfig({ ...config, maxRam: e.target.value })}
              className="input"
              placeholder="8G"
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={props.pvp !== 'false'}
              onChange={(e) => setProps({ ...props, pvp: e.target.checked ? 'true' : 'false' })}
              className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
            />
            <div>
              <span className="text-sm text-gray-200">PvP</span>
              <p className="text-xs text-gray-500">Allow player versus player combat</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.whitelistEnabled !== false}
              onChange={(e) => setConfig({ ...config, whitelistEnabled: e.target.checked })}
              className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
            />
            <div>
              <span className="text-sm text-gray-200">Whitelist</span>
              <p className="text-xs text-gray-500">Only whitelisted players can join</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoRestart !== false}
              onChange={(e) => setConfig({ ...config, autoRestart: e.target.checked })}
              className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
            />
            <div>
              <span className="text-sm text-gray-200">Auto Restart on Crash</span>
              <p className="text-xs text-gray-500">Automatically restart the server if it crashes</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoBackup !== false}
              onChange={(e) => setConfig({ ...config, autoBackup: e.target.checked })}
              className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
            />
            <div>
              <span className="text-sm text-gray-200">Auto Backup</span>
              <p className="text-xs text-gray-500">Automatically backup worlds every hour</p>
            </div>
          </label>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Save size={16} />
            Save & Restart Server
          </button>
        </div>
      </div>
      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
          <Shield size={16} className="text-minecraft-500" />
          Security
        </h3>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Current Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input pr-10"
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">New Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              required
              minLength={6}
            />
          </div>
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Key size={16} />
            Change Password
          </button>
        </form>
      </div>

      {/* Info */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4">System Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Version:</span>
            <span className="ml-2 text-gray-300">MineControl OS v1.0.8</span>
          </div>
          <div>
            <span className="text-gray-500">User:</span>
            <span className="ml-2 text-gray-300">{user?.username} ({user?.role})</span>
          </div>
          <div>
            <span className="text-gray-500">Data Directory:</span>
            <span className="ml-2 text-gray-300 font-mono text-xs">./minecraft/</span>
          </div>
          <div>
            <span className="text-gray-500">Java:</span>
            <span className="ml-2 text-gray-300 font-mono text-xs">{config.javaPath || 'java'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
