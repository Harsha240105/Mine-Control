import { Client, GatewayIntentBits, TextChannel, ChannelType, Message } from 'discord.js';
import os from 'os';
import { minecraftServer } from './minecraftServer';
import { getDatabase } from '../database';
import { getActiveServerId } from '../db/repository/serverConfigRepository';
import { activeServer } from '../activeServer';
import { eventBus } from './eventBus';
import { emitToAll } from '../socketManager';

const MAX_CRASH_LINES = 20;
const MAX_NOTIFICATION_HISTORY = 100;

interface DiscordConfig {
  botToken: string;
  textChannelId: string;
  voiceChannelId: string;
  autoReconnect: boolean;
  chatBridgeEnabled: boolean;
  bridgeForwardDiscordToMinecraft: boolean;
  commandPrefix: string;
  allowedRoleIds: string;
}

interface TestConnectionResult {
  success: boolean;
  message: string;
  botTag?: string;
  guildName?: string;
  channelName?: string;
  permissions?: string[];
}

class DiscordService {
  private client!: Client;
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
  private _reconnecting = false;
  private _connectionId = 0;
  private boundHandlers: Array<{ event: string; handler: (...args: any[]) => void }> = [];
  private activityInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.initClient();
  }

  private createClient(): Client {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    return client;
  }

  private initClient() {
    this.client = this.createClient();
    this.attachClientListeners(this.client);
  }

  private attachClientListeners(client: Client) {
    client.on('ready', () => {
      if (client !== this.client) return;
      this._connected = true;
      this._connecting = false;
      this._reconnecting = false;
      this._botName = client.user?.tag || '';
      this._guildId = '';
      this._guildName = '';
      this._textChannelName = '';
      this._voiceChannelName = '';

      for (const g of client.guilds.cache.values()) {
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
        break;
      }

      this._lastError = '';
      this.persistStatus('connected');
      this.updateLastConnectedAt();
      this.emitStatus();
      this.setupHooks();
      this.startActivityUpdater();
      this._ready = true;
    });

    client.on('messageCreate', async (message: Message) => {
      if (client !== this.client) return;
      if (message.author.bot) return;
      if (message.channel.id !== this._textChannelId) return;
      if (!this._ready) return;

      const cfg = this.loadConfig();
      const prefix = cfg.commandPrefix || '!';

      if (message.content.startsWith(prefix)) {
        await this.handleCommand(message, prefix, cfg);
        return;
      }

      if (cfg.bridgeForwardDiscordToMinecraft && minecraftServer.isRunning) {
        const sender = message.author.displayName || message.author.username;
        minecraftServer.sendCommand(`tellraw @a {"text":"[Discord] ${sender}: ${message.content}","color":"blue"}`).catch(() => {});
      }
    });

    client.on('disconnect', () => {
      if (client !== this.client) return;
      this._connected = false;
      this._connecting = false;
      this._reconnecting = false;
      this._ready = false;
      this.removeHooks();
      this.stopActivityUpdater();
      this.persistStatus('disconnected');
      this.emitStatus();
    });

    client.on('error', (err) => {
      if (client !== this.client) return;
      this._connected = false;
      this._connecting = false;
      this._reconnecting = false;
      this._lastError = err.message;
      this.persistStatus('error');
      this.emitStatus();
    });

    minecraftServer.on('server:started', () => {
      const cfg = this.loadConfig();
      if (cfg.autoReconnect && !this._connected && !this._connecting) {
        this.reconnect();
      }
    });

    activeServer.on('changed', () => {
      if (this._connected) {
        this.reconnect();
      }
    });
  }

  private startActivityUpdater() {
    this.stopActivityUpdater();
    this.activityInterval = setInterval(() => {
      if (this._connected && this.client.user) {
        try {
          const db = getDatabase();
          const sid = getActiveServerId();
          const p = sid
            ? db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online' AND (server_id = ? OR server_id IS NULL)").get(sid)
            : db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online'").get();
          const online = p ? (p as any).c : 0;
          this.client.user.setActivity(`with ${online} players`, { type: 0 });
        } catch {}
      }
    }, 15000);
  }

  private stopActivityUpdater() {
    if (this.activityInterval) {
      clearInterval(this.activityInterval);
      this.activityInterval = null;
    }
  }

  get connected() { return this._connected; }
  get connecting() { return this._connecting; }
  get reconnecting() { return this._reconnecting; }
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
    if (!cfg.botToken || !cfg.textChannelId) return;
    await this.connect(cfg.botToken, cfg.textChannelId, cfg.voiceChannelId);
  }

  async connect(token: string, textChannelId: string, voiceChannelId?: string, retries = 3): Promise<boolean> {
    if (this._connecting) return false;

    const connId = ++this._connectionId;

    try { await this.client.destroy(); } catch {}

    this._connected = false;
    this._connecting = true;
    this._reconnecting = false;
    this._textChannelId = textChannelId;
    this._voiceChannelId = voiceChannelId || '';
    this.persistStatus('connecting');
    this.emitStatus();

    let lastError: any = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      if (connId !== this._connectionId) return false;

      const newClient = this.createClient();
      this.attachClientListeners(newClient);
      this.client = newClient;

      try {
        const loginPromise = newClient.login(token);
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timed out after 20s')), 20000)
        );
        await Promise.race([loginPromise, timeout]);
        if (connId !== this._connectionId) return false;
        this._connecting = false;
        return true;
      } catch (err: any) {
        lastError = err;
        try { await newClient.destroy(); } catch {}

        if (connId !== this._connectionId) return false;

        const isRetryable = err.message?.includes('ECONNREFUSED') ||
          err.message?.includes('ENOTFOUND') ||
          err.message?.includes('ETIMEDOUT') ||
          err.message?.includes('timed out') ||
          err.message?.includes('NETWORK');

        if (attempt < retries && isRetryable) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          console.log(`[Discord] Connection attempt ${attempt}/${retries} failed, retrying in ${delay}ms: ${err.message}`);
          this._lastError = `Attempt ${attempt}/${retries} failed, retrying...`;
          this.emitStatus();
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        this._connected = false;
        this._connecting = false;
        this._reconnecting = false;
        this._lastError = err.message || 'Failed to connect';
        this.persistStatus('error');
        this.emitStatus();
        return false;
      }
    }

    this._connected = false;
    this._connecting = false;
    this._reconnecting = false;
    this._lastError = lastError?.message || 'Failed to connect after retries';
    this.persistStatus('error');
    this.emitStatus();
    return false;
  }

  async disconnect(): Promise<void> {
    this.removeHooks();
    this.stopActivityUpdater();
    const connId = ++this._connectionId;
    try { await this.client.destroy(); } catch {}
    this._connected = false;
    this._connecting = false;
    this._reconnecting = false;
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
    if (!cfg.botToken || !cfg.textChannelId) {
      this._reconnecting = false;
      this.emitStatus();
      return false;
    }
    console.log(`[Discord] reconnect() called - setting _reconnecting = true`);
    this._reconnecting = true;
    this.emitStatus();
    const result = await this.connect(cfg.botToken, cfg.textChannelId, cfg.voiceChannelId);
    console.log(`[Discord] reconnect() connect result: ${result}, _reconnecting now: ${this._reconnecting}`);
    if (!result) {
      this._reconnecting = false;
      this.emitStatus();
    }
    return result;
  }

  async testConnection(token: string, textChannelId: string): Promise<TestConnectionResult> {
    const testClient = this.createClient();

    try {
      const loginPromise = testClient.login(token);
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timed out after 20s')), 20000)
      );
      await Promise.race([loginPromise, timeout]);

      const channel = await Promise.race([
        testClient.channels.fetch(textChannelId),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Channel fetch timed out')), 10000)),
      ]).catch(() => null);

      if (!channel) {
        await testClient.destroy();
        return { success: false, message: 'Channel not found. Check the channel ID.' };
      }

      if (!channel.isTextBased()) {
        await testClient.destroy();
        return { success: false, message: 'Channel is not a text channel.' };
      }

      const me = testClient.user;
      let perms: string[] = [];
      if ('permissionsFor' in channel && me) {
        const channelPerms = (channel as TextChannel).permissionsFor(me.id);
        if (channelPerms && !channelPerms.has('SendMessages')) {
          await testClient.destroy();
          return { success: false, message: 'Missing Send Messages permission in this channel.' };
        }
        if (channelPerms) {
          if (channelPerms.has('SendMessages')) perms.push('Send Messages');
          if (channelPerms.has('EmbedLinks')) perms.push('Embed Links');
          if (channelPerms.has('AttachFiles')) perms.push('Attach Files');
          if (channelPerms.has('ReadMessageHistory')) perms.push('Read History');
        }
      }

      const guildName = testClient.guilds.cache.first()?.name || 'Unknown';
      const botTag = testClient.user?.tag || 'Unknown';
      const channelName = ('name' in channel) ? (channel as any).name : 'Unknown';

      await testClient.destroy();
      return {
        success: true,
        message: `Connected as ${botTag}. Guild: ${guildName}. Channel: #${channelName}`,
        botTag,
        guildName,
        channelName,
        permissions: perms,
      };
    } catch (err: any) {
      try { await testClient.destroy(); } catch {}
      if (err.message?.includes('token') || err.message?.includes('401') || err.message?.includes('TOKEN_INVALID')) {
        return { success: false, message: 'Invalid bot token.' };
      }
      if (err.message?.includes('NETWORK') || err.message?.includes('ECONNREFUSED')) {
        return { success: false, message: 'Network error. Check your internet connection.' };
      }
      if (err.message?.includes('timed out')) {
        return { success: false, message: 'Connection timed out. Discord gateway may be unreachable — try again in a moment.' };
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
      reconnecting: this._reconnecting,
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

  // --- Notification History ---

  private logNotification(eventType: string, title: string, content: string, success: boolean, error?: string) {
    try {
      const db = getDatabase();
      const serverId = getActiveServerId();
      if (!serverId) return;

      db.prepare(
        'INSERT INTO discord_notifications (server_id, event_type, title, content, sent_at, success, error) VALUES (?, ?, ?, ?, datetime(\'now\'), ?, ?)'
      ).run(serverId, eventType, title, content, success ? 1 : 0, error || '');

      const count = (db.prepare('SELECT COUNT(*) as c FROM discord_notifications WHERE server_id = ?').get(serverId) as any)?.c || 0;
      if (count > MAX_NOTIFICATION_HISTORY) {
        const deleteCount = count - MAX_NOTIFICATION_HISTORY;
        db.prepare(
          'DELETE FROM discord_notifications WHERE id IN (SELECT id FROM discord_notifications WHERE server_id = ? ORDER BY sent_at ASC LIMIT ?)'
        ).run(serverId, deleteCount);
      }
    } catch {}
  }

  async sendTrackedEmbed(eventType: string, data: Parameters<DiscordService['sendEmbed']>[0]): Promise<boolean> {
    const result = await this.sendEmbed(data);
    this.logNotification(eventType, data.title, data.description || data.fields?.map(f => `${f.name}: ${f.value}`).join('\n') || '', result, result ? undefined : this._lastError);
    return result;
  }

  // --- Command Handling ---

  private async handleCommand(message: Message, prefix: string, cfg: DiscordConfig) {
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    if (!command) return;

    if (cfg.allowedRoleIds) {
      const allowedIds = cfg.allowedRoleIds.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (allowedIds.length > 0 && message.member) {
        const hasRole = message.member.roles.cache.some((r: any) => allowedIds.includes(r.id));
        if (!hasRole) {
          await message.reply('You do not have permission to use bot commands.');
          return;
        }
      }
    }

    switch (command) {
      case 'players':
      case 'list':
        await this.handlePlayersCommand(message);
        break;
      case 'status':
        await this.handleStatusCommand(message);
        break;
      case 'tps':
        await this.handleTpsCommand(message);
        break;
      case 'command':
      case 'cmd':
        await this.handleConsoleCommand(message, args);
        break;
      case 'help':
        await this.handleHelpCommand(message, prefix);
        break;
      default:
        await message.reply(`Unknown command. Try \`${prefix}help\`.`);
    }
  }

  private async handlePlayersCommand(message: Message) {
    const db = getDatabase();
    const serverId = getActiveServerId();
    if (!serverId) { await message.reply('No server selected.'); return; }
    const players = db.prepare("SELECT username, playtime FROM players WHERE server_id = ? AND status = 'online' ORDER BY playtime DESC").all(serverId) as any[];
    if (players.length === 0) {
      await message.reply('No players online.');
      return;
    }
    const list = players.map((p: any, i: number) => `${i + 1}. **${p.username}** (${Math.round(p.playtime / 60)}min)`).join('\n');
    await message.reply(`**${players.length} player(s) online:**\n${list}`);
  }

  private async handleStatusCommand(message: Message) {
    const serverId = getActiveServerId();
    const db = getDatabase();
    const running = minecraftServer.isRunning;
    const config = minecraftServer.getConfig();
    const port = config?.port || 25565;
    const tps = minecraftServer.currentTps;
    const uptime = minecraftServer.uptime;
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const online = serverId
      ? (db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online' AND (server_id = ? OR server_id IS NULL)").get(serverId) as any)?.c || 0
      : 0;
    const serverRow = serverId ? db.prepare('SELECT name, version, version_source FROM servers WHERE id = ?').get(serverId) as any : null;
    await message.reply(
      `**${serverRow?.name || 'Minecraft Server'}**\n` +
      `State: ${running ? 'Running' : 'Stopped'} | Port: ${port}\n` +
      `TPS: ${running ? tps.toFixed(1) : 'N/A'} | Players: ${online}\n` +
      `Uptime: ${d}d ${h}h ${m}m\n` +
      `Version: ${serverRow?.version_source || ''} ${serverRow?.version || ''}`
    );
  }

  private async handleTpsCommand(message: Message) {
    if (!minecraftServer.isRunning) { await message.reply('Server is not running.'); return; }
    const tps = minecraftServer.currentTps;
    await message.reply(`Current TPS: **${tps.toFixed(1)}**`);
  }

  private async handleConsoleCommand(message: Message, args: string[]) {
    if (!minecraftServer.isRunning) { await message.reply('Server is not running.'); return; }
    const cmd = args.join(' ');
    if (!cmd) { await message.reply('Usage: `!command <console command>`'); return; }
    await minecraftServer.sendCommand(cmd);
    await message.reply(`Sent command: \`/${cmd}\``);
  }

  private async handleHelpCommand(message: Message, prefix: string) {
    await message.reply(
      `**Bot Commands:**\n` +
      `\`${prefix}players\` - List online players\n` +
      `\`${prefix}status\` - Server status\n` +
      `\`${prefix}tps\` - Current TPS\n` +
      `\`${prefix}command <cmd>\` - Run console command\n` +
      `\`${prefix}help\` - This message`
    );
  }

  // --- Chat Bridge ---

  async sendChatMessage(username: string, message: string) {
    if (!this._connected || !this._textChannelId) return;
    const cfg = this.loadConfig();
    if (!cfg.chatBridgeEnabled) return;
    await this.sendEmbed({
      title: `${username}`,
      description: message,
      color: 0x5865f2,
      footer: 'Minecraft Chat',
      timestamp: true,
    });
  }

  // --- Notification Builders ---

  private getServerInfo(): any {
    const db = getDatabase();
    const serverId = getActiveServerId();
    if (!serverId) return { name: 'MineControl OS', port: 25565, version: '', version_source: 'Minecraft', autoRestart: false };
    return db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) || { name: 'MineControl OS', port: 25565, version: '', version_source: 'Minecraft', autoRestart: false };
  }

  private _cachedPublicIp: string | null = null;

  private async fetchPublicIp(): Promise<string | null> {
    if (this._cachedPublicIp) return this._cachedPublicIp;
    return new Promise((resolve) => {
      const https = require('https');
      const req = https.get('https://api.ipify.org?format=json', { timeout: 5000 }, (res: any) => {
        let data = '';
        res.on('data', (c: string) => data += c);
        res.on('end', () => {
          try {
            const ip = JSON.parse(data).ip;
            if (ip) {
              this._cachedPublicIp = ip;
              resolve(ip);
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }

  private async getJoinAddress(port: number): Promise<string> {
    const db = getDatabase();
    const sid = getActiveServerId();

    if (sid) {
      const playitKey = `playitAddress_${sid}`;
      const row = db.prepare("SELECT value FROM server_config WHERE key = ?").get(playitKey) as any;
      if (row?.value) return `\`${row.value}\``;
    }

    const publicIp = await this.fetchPublicIp();
    if (publicIp) return `\`${publicIp}:${port}\``;

    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          return `\`${net.address}:${port}\``;
        }
      }
    }

    return `\`localhost:${port}\``;
  }

  async notifyServerStarted() {
    if (!this.shouldNotify('notify_server_start')) return;
    const server = this.getServerInfo();
    const db = getDatabase();
    const sid = getActiveServerId();
    const players = sid
      ? db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online' AND (server_id = ? OR server_id IS NULL)").get(sid)
      : db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online'").get() as any;
    const online = players?.c || 0;
    const port = server.port || 25565;
    const joinAddress = await this.getJoinAddress(port);
    const isPlayitOrPublic = joinAddress.includes('.') && !joinAddress.includes('localhost');
    const connectionType = isPlayitOrPublic ? 'Public' : 'Local';

    await this.sendTrackedEmbed('server_started', {
      title: 'Server Started',
      color: 0x22c55e,
      fields: [
        { name: 'Server', value: server.name || 'MineControl OS', inline: true },
        { name: 'Software', value: server.version_source || 'Minecraft', inline: true },
        { name: 'Version', value: server.version || 'Unknown', inline: true },
        { name: 'Join Address', value: joinAddress, inline: true },
        { name: 'Players Online', value: `${online}`, inline: true },
        { name: 'Connection', value: connectionType, inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyServerStopped(code?: number | null) {
    if (!this.shouldNotify('notify_server_stop')) return;
    const server = this.getServerInfo();

    await this.sendTrackedEmbed('server_stopped', {
      title: 'Server Stopped',
      color: 0xef4444,
      fields: [
        { name: 'Server', value: server.name || 'MineControl OS', inline: true },
        { name: 'Exit Code', value: code !== null && code !== undefined ? `${code}` : 'N/A', inline: true },
      ],
      footer: `MineControl OS`,
    });

    setTimeout(() => {
      if (this._connected) {
        this.client.user?.setStatus('invisible');
        this.disconnect();
      }
    }, 2000);
  }

  async notifyServerRestarted() {
    if (!this.shouldNotify('notify_server_restart')) return;
    const server = this.getServerInfo();

    await this.sendTrackedEmbed('server_restarted', {
      title: 'Server Restarted',
      color: 0xf59e0b,
      fields: [
        { name: 'Server', value: server.name || 'MineControl OS', inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyServerCrashed(error: string) {
    if (!this.shouldNotify('notify_server_crash')) return;
    const server = this.getServerInfo();
    const crashLines = error.split('\n').slice(0, MAX_CRASH_LINES).join('\n');
    const truncated = error.split('\n').length > MAX_CRASH_LINES;

    const db = getDatabase();
    const count = (db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE action = 'crash' AND timestamp > datetime('now', '-1 day')").get() as any)?.c || 0;
    const autoRestart = server.autoRestart;

    await this.sendTrackedEmbed('server_crashed', {
      title: 'Server Crashed',
      color: 0xdc2626,
      fields: [
        { name: 'Server', value: server.name || 'MineControl OS', inline: true },
        { name: 'Crash Count (24h)', value: `${count}`, inline: true },
        { name: 'Auto Restart', value: autoRestart ? 'Enabled' : 'Disabled', inline: true },
        { name: 'Last Console Lines', value: `\`\`\`${crashLines}\`\`\`${truncated ? '\n(truncated)' : ''}` },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyPlayerJoined(username: string) {
    if (!this.shouldNotify('notify_player_join')) return;
    const db = getDatabase();
    const sid = getActiveServerId();
    const players = sid
      ? db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online' AND (server_id = ? OR server_id IS NULL)").get(sid)
      : db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online'").get() as any;
    const online = players?.c || 0;

    await this.sendTrackedEmbed('player_joined', {
      title: 'Player Joined',
      color: 0x22c55e,
      fields: [
        { name: 'Player', value: username, inline: true },
        { name: 'Time', value: new Date().toLocaleTimeString(), inline: true },
        { name: 'Online Now', value: `${online}`, inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyPlayerLeft(username: string) {
    if (!this.shouldNotify('notify_player_left')) return;
    const db = getDatabase();
    const sid = getActiveServerId();
    const players = sid
      ? db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online' AND (server_id = ? OR server_id IS NULL)").get(sid)
      : db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online'").get() as any;
    const online = players?.c || 0;

    await this.sendTrackedEmbed('player_left', {
      title: 'Player Left',
      color: 0xf59e0b,
      fields: [
        { name: 'Player', value: username, inline: true },
        { name: 'Time', value: new Date().toLocaleTimeString(), inline: true },
        { name: 'Online Now', value: `${online}`, inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyPlayerKicked(username: string) {
    if (!this.shouldNotify('notify_player_kicked')) return;
    await this.sendTrackedEmbed('player_kicked', {
      title: 'Player Kicked',
      color: 0xf97316,
      fields: [
        { name: 'Player', value: username, inline: true },
        { name: 'Time', value: new Date().toLocaleTimeString(), inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyPlayerBanned(username: string) {
    if (!this.shouldNotify('notify_player_banned')) return;
    await this.sendTrackedEmbed('player_banned', {
      title: 'Player Banned',
      color: 0xdc2626,
      fields: [
        { name: 'Player', value: username, inline: true },
        { name: 'Time', value: new Date().toLocaleTimeString(), inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyPlayerUnbanned(username: string) {
    if (!this.shouldNotify('notify_player_unbanned')) return;
    await this.sendTrackedEmbed('player_unbanned', {
      title: 'Player Unbanned',
      color: 0x22c55e,
      fields: [
        { name: 'Player', value: username, inline: true },
        { name: 'Time', value: new Date().toLocaleTimeString(), inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyPlayerApproved(username: string) {
    if (!this.shouldNotify('notify_player_approved')) return;
    await this.sendTrackedEmbed('player_approved', {
      title: 'Player Approved',
      color: 0x22c55e,
      fields: [
        { name: 'Player', value: username, inline: true },
        { name: 'Time', value: new Date().toLocaleTimeString(), inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyBackupCreated(data: { name: string; size: string; reason?: string; type?: string }) {
    if (!this.shouldNotify('notify_backup_created')) return;
    const typeLabel = data.type === 'auto' ? 'Automatic' : data.type === 'scheduled' ? 'Scheduled' : 'Manual';

    await this.sendTrackedEmbed('backup_created', {
      title: `${typeLabel} Backup Created`,
      color: 0x8b5cf6,
      fields: [
        { name: 'Name', value: data.name, inline: true },
        { name: 'Size', value: data.size, inline: true },
        { name: 'Reason', value: data.reason || 'N/A', inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyBackupRestored(data: { name: string; size?: string; reason?: string }) {
    if (!this.shouldNotify('notify_backup_restored')) return;
    await this.sendTrackedEmbed('backup_restored', {
      title: 'Backup Restored',
      color: 0x8b5cf6,
      fields: [
        { name: 'Backup', value: data.name, inline: true },
        { name: 'Reason', value: data.reason || 'Manual restore', inline: true },
        { name: 'Time', value: new Date().toLocaleString(), inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyBackupFailed(data: { name: string; error: string; type?: string }) {
    if (!this.shouldNotify('notify_backup_failed')) return;
    await this.sendTrackedEmbed('backup_failed', {
      title: 'Backup Failed',
      color: 0xdc2626,
      fields: [
        { name: 'Name', value: data.name, inline: true },
        { name: 'Error', value: data.error },
        { name: 'Time', value: new Date().toLocaleString(), inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyWhitelistUpdated() {
    if (!this.shouldNotify('notify_whitelist_updated')) return;
    await this.sendTrackedEmbed('whitelist_updated', {
      title: 'Whitelist Updated',
      color: 0x3b82f6,
      fields: [
        { name: 'Time', value: new Date().toLocaleString(), inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifySoftwareChanged(software: string) {
    if (!this.shouldNotify('notify_software_changed')) return;
    const server = this.getServerInfo();
    await this.sendTrackedEmbed('software_changed', {
      title: 'Software Changed',
      color: 0x3b82f6,
      fields: [
        { name: 'Software', value: software, inline: true },
        { name: 'Server', value: server.name || 'MineControl OS', inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyVersionChanged(version: string) {
    if (!this.shouldNotify('notify_version_changed')) return;
    const server = this.getServerInfo();
    await this.sendTrackedEmbed('version_changed', {
      title: 'Minecraft Version Changed',
      color: 0x3b82f6,
      fields: [
        { name: 'Version', value: version, inline: true },
        { name: 'Software', value: server.version_source || 'Minecraft', inline: true },
        { name: 'Server', value: server.name || 'MineControl OS', inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  async notifyUpdateAvailable(type: 'server' | 'application') {
    if (!this.shouldNotify('notify_update_available')) return;
    await this.sendTrackedEmbed('update_available', {
      title: type === 'server' ? 'Server Update Available' : 'Application Update Available',
      color: 0x3b82f6,
      fields: [
        { name: 'Type', value: type === 'server' ? 'Minecraft Server' : 'MineControl OS', inline: true },
        { name: 'Time', value: new Date().toLocaleString(), inline: true },
      ],
      footer: `MineControl OS`,
    });
  }

  // --- Internal ---

  private loadConfig(): DiscordConfig {
    const db = getDatabase();
    const serverId = getActiveServerId();
    const defaults: DiscordConfig = {
      botToken: '', textChannelId: '', voiceChannelId: '', autoReconnect: true,
      chatBridgeEnabled: false, bridgeForwardDiscordToMinecraft: false,
      commandPrefix: '!', allowedRoleIds: '',
    };
    if (!serverId) return defaults;

    const row = db.prepare('SELECT * FROM discord_config WHERE server_id = ?').get(serverId) as any;
    if (!row) return defaults;

    return {
      botToken: row.bot_token || '',
      textChannelId: row.text_channel_id || '',
      voiceChannelId: row.voice_channel_id || '',
      autoReconnect: !!row.auto_reconnect,
      chatBridgeEnabled: !!row.chat_bridge_enabled,
      bridgeForwardDiscordToMinecraft: !!row.bridge_forward_discord_to_minecraft,
      commandPrefix: row.command_prefix || '!',
      allowedRoleIds: row.allowed_role_ids || '',
    };
  }

  private persistStatus(status: string) {
    try {
      const db = getDatabase();
      const serverId = getActiveServerId();
      if (!serverId) return;

      const existing = db.prepare('SELECT id FROM discord_config WHERE server_id = ?').get(serverId);
      if (existing) {
        db.prepare(`
          UPDATE discord_config SET bot_status = ?, last_error = ?, updated_at = datetime('now')
          WHERE server_id = ?
        `).run(status, this._lastError, serverId);
      } else {
        db.prepare(`
          INSERT INTO discord_config (server_id, bot_status, last_error, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
        `).run(serverId, status, this._lastError || '');
      }
    } catch (e: any) {
      if (e.message?.includes('no such column')) {
        try {
          const db = getDatabase();
          db.exec("ALTER TABLE discord_config ADD COLUMN updated_at TEXT DEFAULT ''");
        } catch {}
        try {
          const db = getDatabase();
          const serverId = getActiveServerId();
          if (!serverId) return;
          const existing = db.prepare('SELECT id FROM discord_config WHERE server_id = ?').get(serverId);
          if (existing) {
            db.prepare('UPDATE discord_config SET bot_status = ?, last_error = ? WHERE server_id = ?')
              .run(status, this._lastError, serverId);
          } else {
            db.prepare("INSERT INTO discord_config (server_id, bot_status, last_error, created_at) VALUES (?, ?, ?, datetime('now'))")
              .run(serverId, status, this._lastError || '');
          }
        } catch {}
      }
    }
  }

  private updateLastConnectedAt() {
    try {
      const db = getDatabase();
      const serverId = getActiveServerId();
      if (!serverId) return;
      db.prepare("UPDATE discord_config SET last_connected_at = datetime('now') WHERE server_id = ?").run(serverId);
    } catch {}
  }

  private shouldNotify(key: string): boolean {
    const db = getDatabase();
    const serverId = getActiveServerId();
    if (!serverId) return false;
    const row = db.prepare(`SELECT ${key} FROM discord_config WHERE server_id = ?`).get(serverId) as any;
    return row ? !!row[key] : false;
  }

  private emitStatus() {
    try {
      const s = this.getStatus();
      console.log(`[Discord] emitStatus: connected=${s.connected} connecting=${s.connecting} reconnecting=${s.reconnecting} lastError=${s.lastError}`);
      emitToAll('discord:update', s);
    } catch {}
  }

  private removeHooks() {
    for (const { event, handler } of this.boundHandlers) {
      if (event.startsWith('backup:') || event.startsWith('player:') || event.startsWith('server:')) {
        eventBus.off(event, handler);
      }
      minecraftServer.off(event as any, handler);
    }
    this.boundHandlers = [];
  }

  private setupHooks() {
    if (this.boundHandlers.length > 0) return;

    this.hookBus('server:started', () => this.notifyServerStarted());
    this.hookBus('server:stopped', (code: number | null) => this.notifyServerStopped(code));
    this.hookBus('server:crashed', (err: string) => this.notifyServerCrashed(err));
    this.hookBus('server:restarted', () => this.notifyServerRestarted());
    this.hookBus('player:join', (username: string) => this.notifyPlayerJoined(username));
    this.hookBus('player:leave', (username: string) => this.notifyPlayerLeft(username));
    this.hookBus('player:kicked', (username: string) => this.notifyPlayerKicked(username));
    this.hookBus('player:banned', (username: string) => this.notifyPlayerBanned(username));
    this.hookBus('player:unbanned', (username: string) => this.notifyPlayerUnbanned(username));
    this.hookBus('player:approved', (username: string) => this.notifyPlayerApproved(username));
    this.hookBus('backup:created', (data: any) => this.notifyBackupCreated(data));
    this.hookBus('backup:restored', (data: any) => this.notifyBackupRestored(data));
    this.hookBus('backup:failed', (data: any) => this.notifyBackupFailed(data));
    this.hookBus('whitelist:updated', () => this.notifyWhitelistUpdated());
    this.hookBus('software:changed', (sw: string) => this.notifySoftwareChanged(sw));
    this.hookBus('version:changed', (v: string) => this.notifyVersionChanged(v));
    this.hookBus('update:available', (type: 'server' | 'application') => this.notifyUpdateAvailable(type));
    this.hookBus('player:chat', (username: string, message: string) => this.sendChatMessage(username, message));
  }

  private hookBus(event: string, handler: (...args: any[]) => void) {
    eventBus.on(event, handler);
    this.boundHandlers.push({ event, handler });
  }

  destroy() {
    this.removeHooks();
    this.stopActivityUpdater();
    this._ready = false;
    try { this.client.destroy(); } catch {}
    this._connected = false;
    this._connecting = false;
    this._reconnecting = false;
    this.persistStatus('disconnected');
  }
}

export const discordService = new DiscordService();
