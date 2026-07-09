import express from 'express';
import { AuthRequest, authMiddleware, requirePermission } from '../middleware/auth';
import { getDatabase } from '../database';
import { getActiveServerId } from '../db/repository/serverConfigRepository';
import { discordService } from '../services/discord';

const router = express.Router();

// Get full Discord configuration + bot status
router.get('/', authMiddleware, (req: AuthRequest, res) => {
  const activeId = getActiveServerId();
  if (!activeId) return res.json({ configured: false, error: 'No active server' });

  const row = getDatabase().prepare('SELECT * FROM discord_config WHERE server_id = ?').get(activeId) as any;
  const config = row ? {
    botToken: row.bot_token ? '••••••••' : '',
    guildId: row.guild_id || '',
    textChannelId: row.text_channel_id || '',
    voiceChannelId: row.voice_channel_id || '',
    autoReconnect: !!row.auto_reconnect,
    notify_server_start: !!row.notify_server_start,
    notify_server_stop: !!row.notify_server_stop,
    notify_server_crash: !!row.notify_server_crash,
    notify_server_restart: !!row.notify_server_restart,
    notify_backup_created: !!row.notify_backup_created,
    notify_backup_restored: !!row.notify_backup_restored,
    notify_backup_failed: !!row.notify_backup_failed,
    notify_player_join: !!row.notify_player_join,
    notify_player_left: !!row.notify_player_left,
    notify_player_kicked: !!row.notify_player_kicked,
    notify_player_banned: !!row.notify_player_banned,
    notify_player_unbanned: !!row.notify_player_unbanned,
    notify_player_approved: !!row.notify_player_approved,
    notify_whitelist_updated: !!row.notify_whitelist_updated,
    notify_software_changed: !!row.notify_software_changed,
    notify_version_changed: !!row.notify_version_changed,
    notify_update_available: !!row.notify_update_available,
    chat_bridge_enabled: !!row.chat_bridge_enabled,
    bridge_forward_discord_to_minecraft: !!row.bridge_forward_discord_to_minecraft,
    command_prefix: row.command_prefix || '!',
    allowed_role_ids: row.allowed_role_ids || '',
    botStatus: row.bot_status || 'disconnected',
    lastConnectedAt: row.last_connected_at,
    lastError: row.last_error || '',
  } : { configured: false };

  res.json({ ...config, ...discordService.getStatus() });
});

// Save Discord configuration
router.post('/', authMiddleware, requirePermission('settings.edit'), async (req: AuthRequest, res) => {
  const db = getDatabase();
  const activeId = getActiveServerId();
  if (!activeId) return res.status(400).json({ error: 'No active server' });

  const existing = db.prepare('SELECT id FROM discord_config WHERE server_id = ?').get(activeId);

  const fields = [
    'bot_token', 'guild_id', 'text_channel_id', 'voice_channel_id', 'auto_reconnect',
    'notify_server_start', 'notify_server_stop', 'notify_server_crash', 'notify_server_restart',
    'notify_backup_created', 'notify_backup_restored', 'notify_backup_failed',
    'notify_player_join', 'notify_player_left', 'notify_player_kicked',
    'notify_player_banned', 'notify_player_unbanned', 'notify_player_approved',
    'notify_whitelist_updated', 'notify_software_changed', 'notify_version_changed', 'notify_update_available',
    'chat_bridge_enabled', 'bridge_forward_discord_to_minecraft', 'command_prefix', 'allowed_role_ids',
  ];

  const updateFields: string[] = [];
  const values: any[] = [];

  for (const f of fields) {
    const val = req.body[f];
    if (val !== undefined) {
      // Skip masked placeholder token to avoid overwriting the real token
      if (f === 'bot_token' && val === '••••••••' && existing) continue;
      updateFields.push(`${f} = ?`);
      values.push(typeof val === 'boolean' ? (val ? 1 : 0) : val);
    }
  }

  if (updateFields.length === 0) return res.json({ success: true });

  updateFields.push("updated_at = datetime('now')");

  if (existing) {
    db.prepare(`UPDATE discord_config SET ${updateFields.join(', ')} WHERE server_id = ?`).run(...values, activeId);
  } else {
    const colKeys = fields.filter(f => req.body[f] !== undefined);
    const colVals = colKeys.map(f => typeof req.body[f] === 'boolean' ? (req.body[f] ? 1 : 0) : req.body[f]);
    db.prepare(`INSERT INTO discord_config (server_id, ${colKeys.join(', ')}) VALUES (?, ${colKeys.map(() => '?').join(', ')})`).run(activeId, ...colVals);
  }

  // Reconnect if token/channel changed
  const reqToken = req.body.bot_token;
  const token = reqToken !== undefined && reqToken !== '••••••••' ? reqToken :
    (db.prepare('SELECT bot_token FROM discord_config WHERE server_id = ?').get(activeId) as any)?.bot_token || '';
  const textChan = req.body.text_channel_id !== undefined ? req.body.text_channel_id :
    (db.prepare('SELECT text_channel_id FROM discord_config WHERE server_id = ?').get(activeId) as any)?.text_channel_id || '';
  const voiceChan = req.body.voice_channel_id !== undefined ? req.body.voice_channel_id :
    (db.prepare('SELECT voice_channel_id FROM discord_config WHERE server_id = ?').get(activeId) as any)?.voice_channel_id || '';

  let connectResult = true;
  if (req.body.bot_token !== undefined || req.body.text_channel_id !== undefined || req.body.voice_channel_id !== undefined) {
    if (token && textChan) {
      connectResult = await discordService.connect(token, textChan, voiceChan);
    } else {
      await discordService.disconnect();
    }
  }

  const status = discordService.getStatus();
  res.json({ success: true, connected: connectResult, lastError: status.lastError || '' });
});

// Connect Discord bot
router.post('/connect', authMiddleware, requirePermission('settings.edit'), async (req: AuthRequest, res) => {
  const activeId = getActiveServerId();
  if (!activeId) return res.status(400).json({ error: 'No active server' });

  const row = getDatabase().prepare('SELECT * FROM discord_config WHERE server_id = ?').get(activeId) as any;
  if (!row || !row.bot_token || !row.text_channel_id) {
    return res.status(400).json({ success: false, error: 'Discord not configured. Save bot token and channel ID first.' });
  }

  const ok = await discordService.connect(row.bot_token, row.text_channel_id, row.voice_channel_id || '');
  res.json({ success: ok, status: discordService.getStatus() });
});

// Disconnect Discord bot
router.post('/disconnect', authMiddleware, requirePermission('settings.edit'), async (_req: AuthRequest, res) => {
  await discordService.disconnect();
  res.json({ success: true, status: discordService.getStatus() });
});

// Reconnect Discord bot
router.post('/reconnect', authMiddleware, requirePermission('settings.edit'), async (_req: AuthRequest, res) => {
  const ok = await discordService.reconnect();
  res.json({ success: ok, status: discordService.getStatus() });
});

// Test connection (without saving)
router.post('/test', authMiddleware, async (req: AuthRequest, res) => {
  const { botToken, textChannelId } = req.body;
  if (!textChannelId) {
    return res.status(400).json({ success: false, message: 'Channel ID required' });
  }
  // If frontend sends the masked placeholder, read the real token from DB
  const token = botToken && botToken !== '••••••••' ? botToken :
    (() => { const row = getDatabase().prepare('SELECT bot_token FROM discord_config WHERE server_id = ?').get(getActiveServerId()) as any; return row?.bot_token || ''; })();
  if (!token) {
    return res.status(400).json({ success: false, message: 'No bot token configured. Enter a token first.' });
  }
  const result = await discordService.testConnection(token, textChannelId);
  res.json(result);
});

// Get bot status
router.get('/status', authMiddleware, async (_req: AuthRequest, res) => {
  res.json(discordService.getStatus());
});

// Check permissions
router.get('/permissions', authMiddleware, async (_req: AuthRequest, res) => {
  const perms = await discordService.checkPermissions();
  res.json(perms);
});

// Get notification history
router.get('/history', authMiddleware, (req: AuthRequest, res) => {
  const activeId = getActiveServerId();
  if (!activeId) return res.json([]);

  const limit = parseInt(req.query.limit as string) || 20;
  const history = getDatabase().prepare('SELECT * FROM discord_notifications WHERE server_id = ? ORDER BY sent_at DESC LIMIT ?').all(activeId, limit);
  res.json(history);
});

// Send a test message
router.post('/test-message', authMiddleware, async (_req: AuthRequest, res) => {
  const ok = await discordService.sendEmbed({
    title: '🧪 Test Notification',
    color: 0x5865f2,
    fields: [
      { name: 'Status', value: 'This is a test message from MineControl OS', inline: false },
      { name: 'Time', value: new Date().toLocaleString(), inline: true },
    ],
    footer: 'MineControl OS · Test',
  });
  res.json({ success: ok });
});

export default router;
