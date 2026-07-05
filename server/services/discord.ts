import { Client, GatewayIntentBits, TextChannel, VoiceChannel, ChannelType } from 'discord.js';
import { minecraftServer } from './minecraftServer';
import { getDatabase } from '../database';
import { activeServer } from '../activeServer';
import { eventBus } from './eventBus';
import { emitToAll } from '../socketManager';
import { resolveMinecraftDir } from '../paths';

const MAX_CRASH_LINES = 20;

class DiscordService {
  private client: Client;
  private _connected = false;
  private _connecting = false;
  private _botName = '';
  private _guildName = '';
  private _guildId = '';
  private _textChannelId = '';
  private _voiceChannelId = '';
  private _textChannelName = '';
  private _voiceChannelName = '';
  private _lastError = '';
  private _lastNotificationAt: string | null = null;
  private _notificationCount = 0;
  private _ready = false;
  private boundHandlers: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.client.on('ready', () => {
      this._connected = true;
      this._connecting = false;
      this._botName = this.client.user?.tag || '';
      this._guildId = '';
      this._guildName = '';
      this._textChannelName = '';
      this._voiceChannelName = '';

      // Resolve guild/channel names - prefer configured guild
      const configuredGuildId = this._guildId;
      for (const g of this.client.guilds.cache.values()) {
        if (configuredGuildId && g.id !== configuredGuildId) continue;
        this._guildId = g.id;
        this._guildName = g.name;
        if (this._textChannelId && g.channels.cache.has(this._textChannelId)) {
          const ch = g.channels.cache.get(this._textChannelId);
          this._textChannelName = ch?.name || '';
        }
        if (this._voiceChannelId && g.channels.cache.has(this._voiceChannelId)) {
          const ch = g.channels.cache.get(this._voiceChannelId);
          this._voiceChannelName = ch?.name || '';
        }
        if (!configuredGuildId) break;
      }

      this._lastError = '';
      this.persistStatus('connected');
      this.emitStatus();
      this.setupHooks();
      this._ready = true;
    });

    this.client.on('disconnect', () => {
      this._connected = false;
      this._connecting = false;
      this._ready = false;
      this.removeHooks();
      this.persistStatus('disconnected');
      this.emitStatus();
    });

    this.client.on('error', (err) => {
      this._lastError = err.message;
      this.persistStatus('error');
      this.emitStatus();
    });

    // Reconnect when active server changes
    minecraftServer.on('server:started', () => {
      const cfg = this.loadConfig();
      if (cfg.autoReconnect && !this._connected && !this._connecting) {
        this.reconnect();
      }
    });
    
    // Periodically update Discord Activity Status with player count
    setInterval(() => {
      if (this._connected && this.client.user) {
        try {
          const db = require('../database').getDatabase();
          const p = db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online'").get();
          const online = p ? p.c : 0;
          this.client.user.setActivity(`with ${online} players`, { type: 0 }); // 0 = Playing
        } catch {}
      }
    }, 15000);

    activeServer.on('changed', () => {
      if (this._connected) {
        this.reconnect();
      }
    });
  }

  get connected() { return this._connected; }
  get connecting() { return this._connecting; }
  get botName() { return this._botName; }
  get guildName() { return this._guildName; }
  get guildId() { return this._guildId; }
  get textChannelName() { return this._textChannelName; }
  get voiceChannelName() { return this._voiceChannelName; }
  get lastError() { return this._lastError; }
  get lastNotificationAt() { return this._lastNotificationAt; }
  get notificationCount() { return this._notificationCount; }

  async initialize() {
    const cfg = this.loadConfig();
    if (!cfg.botToken || !cfg.textChannelId) {
      return;
    }
    await this.connect(cfg.botToken, cfg.textChannelId, cfg.voiceChannelId);
  }

  async connect(token: string, textChannelId: string, voiceChannelId?: string): Promise<boolean> {
    if (this._connecting) return false;
    if (this._connected) await this.disconnect();
    this._connecting = true;
    this._textChannelId = textChannelId;
    this._voiceChannelId = voiceChannelId || '';
    this.emitStatus();

    try {
      await this.client.login(token);
      return true;
    } catch (err: any) {
      this._connected = false;
      this._connecting = false;
      this._lastError = err.message || 'Failed to connect';
      this.persistStatus('error');
      this.emitStatus();
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.removeHooks();
    try { this.client.destroy(); } catch {}
    this._connected = false;
    this._connecting = false;
    this._ready = false;
    this._botName = '';
    this._guildName = '';
    this._guildId = '';
    this._textChannelName = '';
    this._voiceChannelName = '';
    this.persistStatus('disconnected');
    this.emitStatus();
  }

  async reconnect(): Promise<boolean> {
    const cfg = this.loadConfig();
    if (!cfg.botToken || !cfg.textChannelId) return false;
    return await this.connect(cfg.botToken, cfg.textChannelId, cfg.voiceChannelId);
  }

  async testConnection(token: string, textChannelId: string): Promise<{ success: boolean; message: string }> {
    const testClient = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });

    try {
      await testClient.login(token);
      // Try to fetch the channel
      const channel = await testClient.channels.fetch(textChannelId).catch(() => null);
      if (!channel) {
        testClient.destroy();
        return { success: false, message: 'Could not find channel. Check the channel ID.' };
      }
      if (channel && (channel as TextChannel).isTextBased && !(channel as TextChannel).isTextBased()) {
        testClient.destroy();
        return { success: false, message: 'Channel is not a text channel.' };
      }
      // Check permissions
      const me = testClient.user;
      if (channel && 'permissionsFor' in channel) {
        const perms = (channel as TextChannel).permissionsFor(me!.id);
        if (perms && !perms.has('SendMessages')) {
          testClient.destroy();
          return { success: false, message: 'Bot does not have Send Messages permission in this channel.' };
        }
      }
      testClient.destroy();
      return { success: true, message: `Connected as ${testClient.user?.tag}. Channel found. Permission OK.` };
    } catch (err: any) {
      if (testClient) try { testClient.destroy(); } catch {}
      if (err.message?.includes('token') || err.message?.includes('401')) {
        return { success: false, message: 'Invalid bot token.' };
      }
      return { success: false, message: err.message || 'Connection test failed.' };
    }
  }

  async checkPermissions(): Promise<{ text: string[]; voice: string[]; admin: boolean }> {
    const result = { text: [] as string[], voice: [] as string[], admin: false };
    if (!this._connected || !this._guildId) return result;

    try {
      const guild = await this.client.guilds.fetch(this._guildId);
      const me = guild.members.me;
      if (!me) return result;

      const textPerms = me.permissionsIn(this._textChannelId);
      if (textPerms.has('SendMessages')) result.text.push('Send Messages');
      if (textPerms.has('EmbedLinks')) result.text.push('Embed Links');
      if (textPerms.has('AttachFiles')) result.text.push('Attach Files');
      if (textPerms.has('ReadMessageHistory')) result.text.push('Read History');
      if (textPerms.has('MentionEveryone')) result.text.push('Mention Everyone');

      if (this._voiceChannelId && guild.channels.cache.has(this._voiceChannelId)) {
        const voicePerms = me.permissionsIn(this._voiceChannelId);
        if (voicePerms.has('Connect')) result.voice.push('Connect');
        if (voicePerms.has('Speak')) result.voice.push('Speak');
        if (voicePerms.has('MuteMembers')) result.voice.push('Mute Members');
        if (voicePerms.has('MoveMembers')) result.voice.push('Move Members');
      }

      if (me.permissions.has('Administrator')) result.admin = true;
    } catch {}
    return result;
  }

  async sendMessage(content: string): Promise<boolean> {
    if (!this._connected || !this._textChannelId) return false;
    try {
      const channel = await this.client.channels.fetch(this._textChannelId);
      if (channel && channel.isTextBased()) {
        await (channel as TextChannel).send(content);
        this._lastNotificationAt = new Date().toISOString();
        this._notificationCount++;
        this.emitStatus();
        return true;
      }
    } catch (err: any) {
      this._lastError = err.message;
      this.emitStatus();
    }
    return false;
  }

  async sendEmbed(data: {
    title: string;
    description?: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: string;
    timestamp?: boolean;
  }): Promise<boolean> {
    if (!this._connected || !this._textChannelId) return false;
    try {
      const channel = await this.client.channels.fetch(this._textChannelId);
      if (!channel || !channel.isTextBased()) return false;

      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle(data.title)
        .setColor(data.color || 0x5865f2);

      if (data.description) embed.setDescription(data.description);
      if (data.fields) embed.addFields(data.fields);
      if (data.footer) embed.setFooter({ text: data.footer });
      if (data.timestamp !== false) embed.setTimestamp();

      await (channel as TextChannel).send({ embeds: [embed] });
      this._lastNotificationAt = new Date().toISOString();
      this._notificationCount++;
      this.emitStatus();
      return true;
    } catch (err: any) {
      this._lastError = err.message;
      this.emitStatus();
    }
    return false;
  }

  getStatus() {
    return {
      connected: this._connected,
      connecting: this._connecting,
      botName: this._botName,
      guildId: this._guildId,
      guildName: this._guildName,
      textChannelId: this._textChannelId,
      textChannelName: this._textChannelName,
      voiceChannelId: this._voiceChannelId,
      voiceChannelName: this._voiceChannelName,
      lastError: this._lastError,
      lastNotificationAt: this._lastNotificationAt,
      notificationCount: this._notificationCount,
    };
  }

  // --- Notification Builders ---

  private getServerInfo(): any {
    const db = getDatabase();
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
    if (!activeId) return { name: 'MineControl OS', port: 25565, version: '', version_source: 'Minecraft', autoRestart: false };
    return db.prepare('SELECT * FROM servers WHERE id = ?').get(activeId) || { name: 'MineControl OS', port: 25565, version: '', version_source: 'Minecraft', autoRestart: false };
  }

  async notifyServerStarted() {
    if (!this.shouldNotify('notify_server_start')) return;
    const server = this.getServerInfo();
    const db = getDatabase();
    const players = db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online'").get() as any;
    const online = players?.c || 0;

    let voiceLine = '';
    if (this._voiceChannelId && this._voiceChannelName) {
      voiceLine = `\n🎙️ Voice Channel: **${this._voiceChannelName}**`;
    }

    await this.sendEmbed({
      title: '✅ Server Started',
      color: 0x22c55e,
      fields: [
        { name: 'Server', value: server.name || 'MineControl OS', inline: true },
        { name: 'Software', value: server.version_source || 'Minecraft', inline: true },
        { name: 'Version', value: server.version || 'Unknown', inline: true },
        { name: 'Join Address', value: `\`localhost:${server.port || 25565}\``, inline: true },
        { name: 'Players Online', value: `${online}`, inline: true },
        { name: 'Connection', value: `Local${this._voiceChannelName ? ` + Voice` : ''}`, inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyServerStopped(code?: number | null) {
    setTimeout(() => {
      if (this._connected) {
        this.client.user?.setStatus('invisible');
        this.disconnect();
      }
    }, 2000);
    if (!this.shouldNotify('notify_server_stop')) return;
    const server = this.getServerInfo();

    await this.sendEmbed({
      title: '🛑 Server Stopped',
      color: 0xef4444,
      fields: [
        { name: 'Server', value: server.name || 'MineControl OS', inline: true },
        { name: 'Exit Code', value: code !== null && code !== undefined ? `${code}` : 'N/A', inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyServerRestarted() {
    if (!this.shouldNotify('notify_server_restart')) return;
    const server = this.getServerInfo();

    await this.sendEmbed({
      title: '🔄 Server Restarted',
      color: 0xf59e0b,
      fields: [
        { name: 'Server', value: server.name || 'MineControl OS', inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyServerCrashed(error: string) {
    if (!this.shouldNotify('notify_server_crash')) return;
    const server = this.getServerInfo();
    const crashLines = error.split('\n').slice(0, MAX_CRASH_LINES).join('\n');
    const truncated = error.split('\n').length > MAX_CRASH_LINES;

    const db = getDatabase();
    const count = (db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE event_type = 'crash' AND timestamp > datetime('now', '-1 day')").get() as any)?.c || 0;
    const autoRestart = server.autoRestart;

    await this.sendEmbed({
      title: '❌ Server Crashed',
      color: 0xdc2626,
      fields: [
        { name: 'Server', value: server.name || 'MineControl OS', inline: true },
        { name: 'Crash Count (24h)', value: `${count}`, inline: true },
        { name: 'Auto Restart', value: autoRestart ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Last Console Lines', value: `\`\`\`${crashLines}\`\`\`${truncated ? '\n*(truncated)*' : ''}` },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyPlayerJoined(username: string) {
    if (!this.shouldNotify('notify_player_join')) return;
    const db = getDatabase();
    const now = new Date().toISOString();
    const players = db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online'").get() as any;
    const online = players?.c || 0;

    await this.sendEmbed({
      title: '📥 Player Joined',
      color: 0x22c55e,
      fields: [
        { name: 'Player', value: username, inline: true },
        { name: 'Time', value: new Date().toLocaleTimeString(), inline: true },
        { name: 'Online Now', value: `${online}`, inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyPlayerLeft(username: string) {
    if (!this.shouldNotify('notify_player_left')) return;
    const db = getDatabase();
    const players = db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online'").get() as any;
    const online = players?.c || 0;

    await this.sendEmbed({
      title: '📤 Player Left',
      color: 0xf59e0b,
      fields: [
        { name: 'Player', value: username, inline: true },
        { name: 'Time', value: new Date().toLocaleTimeString(), inline: true },
        { name: 'Online Now', value: `${online}`, inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyPlayerKicked(username: string) {
    if (!this.shouldNotify('notify_player_kicked')) return;
    await this.sendEmbed({
      title: '👢 Player Kicked',
      color: 0xf97316,
      fields: [
        { name: 'Player', value: username, inline: true },
        { name: 'Time', value: new Date().toLocaleTimeString(), inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyPlayerBanned(username: string) {
    if (!this.shouldNotify('notify_player_banned')) return;
    await this.sendEmbed({
      title: '🔨 Player Banned',
      color: 0xdc2626,
      fields: [
        { name: 'Player', value: username, inline: true },
        { name: 'Time', value: new Date().toLocaleTimeString(), inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyPlayerUnbanned(username: string) {
    if (!this.shouldNotify('notify_player_unbanned')) return;
    await this.sendEmbed({
      title: '🔓 Player Unbanned',
      color: 0x22c55e,
      fields: [
        { name: 'Player', value: username, inline: true },
        { name: 'Time', value: new Date().toLocaleTimeString(), inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyPlayerApproved(username: string) {
    if (!this.shouldNotify('notify_player_approved')) return;
    await this.sendEmbed({
      title: '✅ Player Approved',
      color: 0x22c55e,
      fields: [
        { name: 'Player', value: username, inline: true },
        { name: 'Time', value: new Date().toLocaleTimeString(), inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyBackupCreated(data: { name: string; size: string; reason?: string; type?: string }) {
    if (!this.shouldNotify('notify_backup_created')) return;
    const typeLabel = data.type === 'auto' ? '🔄 Automatic' : data.type === 'scheduled' ? '📅 Scheduled' : '👤 Manual';

    await this.sendEmbed({
      title: `${typeLabel} Backup Created`,
      color: 0x8b5cf6,
      fields: [
        { name: 'Name', value: data.name, inline: true },
        { name: 'Size', value: data.size, inline: true },
        { name: 'Reason', value: data.reason || 'N/A', inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyBackupRestored(data: { name: string; size?: string; reason?: string }) {
    if (!this.shouldNotify('notify_backup_restored')) return;
    await this.sendEmbed({
      title: '📦 Backup Restored',
      color: 0x8b5cf6,
      fields: [
        { name: 'Backup', value: data.name, inline: true },
        { name: 'Reason', value: data.reason || 'Manual restore', inline: true },
        { name: 'Time', value: new Date().toLocaleString(), inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyBackupFailed(data: { name: string; error: string; type?: string }) {
    if (!this.shouldNotify('notify_backup_failed')) return;
    await this.sendEmbed({
      title: '❌ Backup Failed',
      color: 0xdc2626,
      fields: [
        { name: 'Name', value: data.name, inline: true },
        { name: 'Error', value: data.error },
        { name: 'Time', value: new Date().toLocaleString(), inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyWhitelistUpdated() {
    if (!this.shouldNotify('notify_whitelist_updated')) return;
    await this.sendEmbed({
      title: '📋 Whitelist Updated',
      color: 0x3b82f6,
      fields: [
        { name: 'Time', value: new Date().toLocaleString(), inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifySoftwareChanged(software: string) {
    if (!this.shouldNotify('notify_software_changed')) return;
    const server = this.getServerInfo();
    await this.sendEmbed({
      title: '🔄 Software Changed',
      color: 0x3b82f6,
      fields: [
        { name: 'Software', value: software, inline: true },
        { name: 'Server', value: server.name || 'MineControl OS', inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyVersionChanged(version: string) {
    if (!this.shouldNotify('notify_version_changed')) return;
    const server = this.getServerInfo();
    await this.sendEmbed({
      title: '📦 Minecraft Version Changed',
      color: 0x3b82f6,
      fields: [
        { name: 'Version', value: version, inline: true },
        { name: 'Software', value: server.version_source || 'Minecraft', inline: true },
        { name: 'Server', value: server.name || 'MineControl OS', inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  async notifyUpdateAvailable(type: 'server' | 'application') {
    if (!this.shouldNotify('notify_update_available')) return;
    await this.sendEmbed({
      title: type === 'server' ? '📥 Server Update Available' : '📥 Application Update Available',
      color: 0x3b82f6,
      fields: [
        { name: 'Type', value: type === 'server' ? 'Minecraft Server' : 'MineControl OS', inline: true },
        { name: 'Time', value: new Date().toLocaleString(), inline: true },
      ],
      footer: `MineControl OS · ${new Date().toLocaleString()}`,
    });
  }

  // --- Internal ---

  private loadConfig() {
    const db = getDatabase();
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
    if (!activeId) return { botToken: '', textChannelId: '', voiceChannelId: '', autoReconnect: true };

    const row = db.prepare('SELECT * FROM discord_config WHERE server_id = ?').get(activeId) as any;
    if (!row) return { botToken: '', textChannelId: '', voiceChannelId: '', autoReconnect: true };

    return {
      botToken: row.bot_token || '',
      textChannelId: row.text_channel_id || '',
      voiceChannelId: row.voice_channel_id || '',
      autoReconnect: !!row.auto_reconnect,
    };
  }

  private persistStatus(status: string) {
    const db = getDatabase();
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
    if (!activeId) return;

    db.prepare(`
      UPDATE discord_config SET bot_status = ?, last_error = ?, updated_at = datetime('now')
      WHERE server_id = ?
    `).run(status, this._lastError, activeId);
  }

  private shouldNotify(key: string): boolean {
    const db = getDatabase();
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
    if (!activeId) return false;
    const row = db.prepare(`SELECT ${key} FROM discord_config WHERE server_id = ?`).get(activeId) as any;
    return row ? !!row[key] : false;
  }

  private emitStatus() {
    try {
      emitToAll('discord:update', this.getStatus());
    } catch {}
  }

  private removeHooks() {
    for (const { event, handler } of this.boundHandlers) {
      minecraftServer.off(event as any, handler);
    }
    for (const { event, handler } of this.boundHandlers) {
      if (event.startsWith('backup:')) eventBus.off(event, handler);
    }
    this.boundHandlers = [];
  }

  private setupHooks() {
    if (this.boundHandlers.length > 0) return;

    // Server events
    this.hook('server:started', () => this.notifyServerStarted());
    this.hook('server:stopped', (code: number | null) => this.notifyServerStopped(code));
    this.hook('server:crashed', (err: string) => this.notifyServerCrashed(err));
    this.hook('player:join', (username: string) => this.notifyPlayerJoined(username));
    this.hook('player:leave', (username: string) => this.notifyPlayerLeft(username));

    // Backup events via event bus
    this.hookBus('backup:created', (data: any) => this.notifyBackupCreated(data));
    this.hookBus('backup:restored', (data: any) => this.notifyBackupRestored(data));
    this.hookBus('backup:failed', (data: any) => this.notifyBackupFailed(data));
  }

  private hookBus(event: string, handler: (...args: any[]) => void) {
    eventBus.on(event, handler);
    this.boundHandlers.push({ event, handler });
  }

  private hook(event: string, handler: (...args: any[]) => void) {
    minecraftServer.on(event as any, handler);
    this.boundHandlers.push({ event, handler });
  }

  destroy() {
    this.removeHooks();
    this._ready = false;
    try { this.client.destroy(); } catch {}
    this._connected = false;
    this._connecting = false;
    this.persistStatus('disconnected');
  }
}

export const discordService = new DiscordService();
