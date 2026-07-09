import { getDatabase } from '../database';
import { getActiveServerId } from '../db/repository/serverConfigRepository';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { resolvePath, resolveMinecraftDir, getMinecraftDir } from '../paths';
import { activeServer } from '../activeServer';
import { getIO } from '../socketManager';

function generateTicketId(): string {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(100000 + Math.random() * 900000));
  return `MCOS-${year}-${seq}`;
}

function randomId(): string {
  return uuidv4();
}

function getAppVersion(): string {
  try {
    return require('../../package.json').version;
  } catch {
    try {
      return require('../package.json').version;
    } catch {
      return '1.0.52';
    }
  }
}

function collectDiagnostics(issueType: string): Record<string, any> {
  const db = getDatabase();
  const mcDir = resolveMinecraftDir();
  const server = activeServer.current;
  const serverConfig = server ? db.prepare('SELECT * FROM servers WHERE id = ?').get(server.id) as any : null;

  let consoleLines: string[] = [];
  try {
    const logPath = path.join(mcDir, 'logs', 'server-out.log');
    const pathsToTry = [logPath, path.join(process.cwd(), 'server-out.log')];
    for (const p of pathsToTry) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        consoleLines = content.split(/\r?\n/).filter(Boolean).slice(-100);
        break;
      }
    }
  } catch {}

  let pluginsList: string[] = [];
  try {
    const plugins = db.prepare('SELECT name, version FROM plugins').all() as any[];
    pluginsList = plugins.map((p) => `${p.name}@${p.version}`);
  } catch {}

  let modsList: string[] = [];
  try {
    const mods = db.prepare('SELECT name, version FROM mods').all() as any[];
    modsList = mods.map((m) => `${m.name}@${m.version}`);
  } catch {}

  let crashLogs: string[] = [];
  try {
    const logsDir = path.join(mcDir, 'logs');
    if (fs.existsSync(logsDir)) {
      const crashFiles = fs.readdirSync(logsDir).filter(f => f.startsWith('crash-') || f.includes('hs_err'));
      for (const cf of crashFiles.slice(-3)) {
        crashLogs.push(cf + ': ' + fs.readFileSync(path.join(logsDir, cf), 'utf-8').slice(0, 3000));
      }
    }
  } catch {}

  let serverLogTail: string[] = [];
  try {
    const logsDir = path.join(mcDir, 'logs');
    if (fs.existsSync(logsDir)) {
      const logFiles = fs.readdirSync(logsDir).filter(f => f.startsWith('server-') && f.endsWith('.log')).sort().reverse();
      if (logFiles.length > 0) {
        const latest = fs.readFileSync(path.join(logsDir, logFiles[0]), 'utf-8');
        serverLogTail = latest.split(/\r?\n/).filter(Boolean).slice(-150);
      }
    }
  } catch {}

  let appLogTail: string[] = [];
  try {
    const appLogPath = resolvePath('data', 'app.log');
    if (fs.existsSync(appLogPath)) {
      const content = fs.readFileSync(appLogPath, 'utf-8');
      appLogTail = content.split(/\r?\n/).filter(Boolean).slice(-100);
    }
  } catch {}

  let firewallStatus = 'unknown';
  try {
    const { firewallManager } = require('./firewallManager');
    if (firewallManager.isAdmin()) {
      const fwOut = execSync('netsh advfirewall firewall show rule name="MineControl OS Minecraft" dir=in verbose', { encoding: 'utf-8', timeout: 3000 });
      firewallStatus = fwOut.includes('Enabled:               Yes') ? 'active' : 'inactive';
    } else {
      firewallStatus = 'no_rule';
    }
  } catch {
    firewallStatus = 'no_rule';
  }

  const javaInfo = (() => {
    try {
      return execSync('java -version 2>&1', { encoding: 'utf-8', timeout: 3000 }).split(/\r?\n/)[0] || '';
    } catch { return ''; }
  })();

  const cpus = os.cpus();
  const totalRamGB = Math.round((os.totalmem() / (1024 ** 3)) * 100) / 100;

  const diagnostics: Record<string, any> = {
    app_version: getAppVersion(),
    os: `${os.type()} ${os.release()}`,
    os_arch: process.arch,
    platform: process.platform,
    hostname: os.hostname(),
    cpu_model: cpus.length > 0 ? cpus[0].model : 'unknown',
    cpu_cores: cpus.length,
    total_ram_gb: totalRamGB,
    free_ram_gb: Math.round((os.freemem() / (1024 ** 3)) * 100) / 100,
    java_version: javaInfo,
    active_server: server ? { id: server.id, name: server.name, status: server.status } : null,
    minecraft_version: serverConfig?.version || '',
    server_software: serverConfig?.version_source || '',
    server_port: serverConfig?.port || 25565,
    min_ram: serverConfig?.minRam || '2G',
    max_ram: serverConfig?.maxRam || '8G',
    java_path: serverConfig?.javaPath || 'java',
    jar_file: serverConfig?.jarFile || 'server.jar',
    server_status: server?.status || 'unknown',
    server_online_mode: serverConfig?.onlineMode ? true : false,
    server_whitelist: serverConfig?.whitelistEnabled ? true : false,
    plugins: pluginsList,
    mods: modsList,
    plugin_count: pluginsList.length,
    mod_count: modsList.length,
    firewall_status: firewallStatus,
    network_mode: serverConfig?.network || 'local',
    uptime_hours: Math.round(os.uptime() / 3600),
    node_version: process.version,
    collected_at: new Date().toISOString(),
  };

  if (issueType === 'bug' || issueType === 'crash') {
    diagnostics.recent_console_logs = consoleLines;
    diagnostics.server_log_tail = serverLogTail;
    diagnostics.crash_reports = crashLogs;
    diagnostics.app_log_tail = appLogTail;
  }

  if (issueType === 'performance') {
    diagnostics.server_log_tail = serverLogTail;
    diagnostics.app_log_tail = appLogTail;
  }

  return diagnostics;
}

const SENSITIVE_PATTERNS = [
  /(token|password|secret|key|auth|credential|jwt|api[_-]?key|bot[_-]?token|discord[_-]?token|access[_-]?token|refresh[_-]?token|private[_-]?key|ssh[_-]?key|secret[_-]?key|signing[_-]?key)[=:][^\s&,;"']+/gi,
  /(-----BEGIN .*? KEY-----)[\s\S]*?(-----END .*? KEY-----)/gi,
  /[\w-]{36,}/g,
];

function sanitizeDiagnostics(data: Record<string, any>): Record<string, any> {
  const sensitiveKeys = ['token', 'password', 'secret', 'key', 'auth', 'credential', 'jwt', 'api_key', 'bot_token', 'private_key', 'ssh_key'];
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      let cleaned = value;
      for (const pattern of SENSITIVE_PATTERNS) {
        cleaned = cleaned.replace(pattern, (match) => {
          if (match.length > 40) return '[REDACTED-LONG-VALUE]';
          const eqIdx = match.indexOf('=');
          const colonIdx = match.indexOf(':');
          const sepIdx = eqIdx > -1 ? eqIdx : colonIdx;
          if (sepIdx > -1) {
            return match.substring(0, sepIdx + 1) + '[REDACTED]';
          }
          return '[REDACTED]';
        });
      }
      sanitized[key] = cleaned;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === 'string'
          ? item.replace(/[Tt][Oo][Kk][Ee][Nn]=[^\s]+/g, 'TOKEN=[REDACTED]')
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function addHistory(ticketId: string, field: string, oldValue: string, newValue: string, changedBy: string, note?: string) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO ticket_history (ticket_id, field, old_value, new_value, changed_by, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ticketId, field, oldValue, newValue, changedBy, note || '');
}

function saveAttachment(base64Data: string, fileName: string, ticketId: string): { id: string; filePath: string } {
  const id = uuidv4();
  const ext = path.extname(fileName) || '.png';
  const safeName = `${id}${ext}`;
  const attachDir = resolvePath('data', 'attachments');
  if (!fs.existsSync(attachDir)) {
    fs.mkdirSync(attachDir, { recursive: true });
  }
  const filePath = path.join(attachDir, safeName);
  const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  fs.writeFileSync(filePath, buffer);
  return { id, filePath };
}

function deleteAttachmentFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {}
}

function collectRelevantLogs(issueType: string): Record<string, string[]> {
  const mcDir = resolveMinecraftDir();
  const logs: Record<string, string[]> = {};

  try {
    const appLogPath = resolvePath('data', 'app.log');
    if (fs.existsSync(appLogPath)) {
      const content = fs.readFileSync(appLogPath, 'utf-8');
      logs.app_logs = content.split(/\r?\n/).filter(Boolean).slice(-200);
    }
  } catch {}

  try {
    const logsDir = path.join(mcDir, 'logs');
    if (fs.existsSync(logsDir)) {
      if (issueType === 'bug' || issueType === 'crash' || issueType === 'performance') {
        const serverLogFiles = fs.readdirSync(logsDir).filter(f => f.startsWith('server-') && f.endsWith('.log')).sort().reverse();
        if (serverLogFiles.length > 0) {
          const latest = fs.readFileSync(path.join(logsDir, serverLogFiles[0]), 'utf-8');
          logs.server_logs = latest.split(/\r?\n/).filter(Boolean).slice(-200);
        }
      }
      if (issueType === 'crash') {
        const crashFiles = fs.readdirSync(logsDir).filter(f => f.startsWith('crash-'));
        for (const cf of crashFiles.slice(-3)) {
          logs[`crash_${cf}`] = [fs.readFileSync(path.join(logsDir, cf), 'utf-8').slice(0, 5000)];
        }
      }
      if (issueType === 'bug') {
        const latestLog = fs.readdirSync(logsDir).filter(f => f === 'latest.log').sort().reverse();
        if (latestLog.length > 0) {
          const content = fs.readFileSync(path.join(logsDir, latestLog[0]), 'utf-8');
          logs.latest_log = content.split(/\r?\n/).filter(Boolean).slice(-100);
        }
      }
    }
  } catch {}

  return logs;
}

function getEffectiveGitHubConfig(serverId?: string): { repository: string; api_token: string } | null {
  const db = getDatabase();

  if (serverId) {
    const config = db.prepare('SELECT * FROM issue_tracker_config WHERE server_id = ? AND enabled = 1').get(serverId) as any;
    if (config && config.repository && config.api_token) {
      return { repository: config.repository, api_token: config.api_token };
    }
  }

  const ownerRow = db.prepare("SELECT value FROM server_config WHERE key = 'github_owner'").get() as any;
  const repoRow = db.prepare("SELECT value FROM server_config WHERE key = 'github_repo'").get() as any;
  const { getCredential } = require('./encryption');
  const token = getCredential('github_token');
  
  const owner = ownerRow?.value || 'Harsha240105';
  const repo = repoRow?.value || 'Mine-Control';

  if (token) {
    return { repository: `${owner}/${repo}`, api_token: token };
  }

  return null;
}

function checkConnectivity(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    try {
      const http = require('http');
      const req = http.get('http://clients3.google.com/generate_204', { timeout: 5000 }, (res: any) => {
        resolve(res.statusCode === 204);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    } catch {
      resolve(false);
    }
  });
}

export const feedbackService = {
  createTicket(data: {
    summary: string;
    description: string;
    issue_type: 'bug' | 'feature' | 'performance' | 'crash' | 'general';
    username: string;
    screenshots?: { data: string; name: string }[];
    attachments?: { data: string; name: string; type: string }[];
    priority?: 'low' | 'normal' | 'high' | 'critical';
    error_stack_trace?: string;
  }) {
    const db = getDatabase();
    const id = uuidv4();
    const ticketId = generateTicketId();
    const now = new Date().toISOString();
    const server = activeServer.current;
    const serverConfig = server ? db.prepare('SELECT * FROM servers WHERE id = ?').get(server.id) as any : null;

    const diagnostics = sanitizeDiagnostics(collectDiagnostics(data.issue_type));
    const logSnapshots = collectRelevantLogs(data.issue_type);

    let screenshotPaths: string[] = [];
    if (data.screenshots && data.screenshots.length > 0) {
      screenshotPaths = data.screenshots.map((s) => {
        const result = saveAttachment(s.data, s.name, id);
        return result.filePath;
      });
    }

    let attachmentPaths: { id: string; filePath: string; fileName: string; type: string }[] = [];
    if (data.attachments && data.attachments.length > 0) {
      attachmentPaths = data.attachments.map((a) => {
        const result = saveAttachment(a.data, a.name, id);
        return { id: result.id, filePath: result.filePath, fileName: a.name, type: a.type };
      });
    }

    let pluginsList: string[] = [];
    let modsList: string[] = [];
    try {
      pluginsList = (db.prepare('SELECT name, version FROM plugins').all() as any[]).map((p: any) => `${p.name}@${p.version}`);
    } catch {}
    try {
      modsList = (db.prepare('SELECT name, version FROM mods').all() as any[]).map((m: any) => `${m.name}@${m.version}`);
    } catch {}

    const onlineCount = db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'online'").get() as any;

    db.prepare(`
      INSERT INTO feedback_tickets (id, ticket_id, issue_type, summary, description, status, username,
        server_id, server_name, world_name, player_count, minecraft_version, server_software,
        connected_plugins, connected_mods, connection_mode, diagnostic_data, diagnostic_sanitized,
        screenshot_paths, attachment_paths, log_snapshots, error_stack_trace,
        sync_status, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, 1,
        ?, ?, ?, ?,
        'local', ?, ?, ?)
    `).run(
      id, ticketId, data.issue_type, data.summary, data.description, data.username,
      server?.id || null, server?.name || '', serverConfig?.seed ? 'world' : '', onlineCount?.c || 0,
      serverConfig?.version || '', serverConfig?.version_source || '',
      JSON.stringify(pluginsList), JSON.stringify(modsList), serverConfig?.network || 'local',
      JSON.stringify(diagnostics),
      JSON.stringify(screenshotPaths), JSON.stringify(attachmentPaths), JSON.stringify(logSnapshots),
      data.error_stack_trace || '',
      data.priority || 'normal', now, now,
    );

    addHistory(id, 'created', '', JSON.stringify({ issue_type: data.issue_type, priority: data.priority || 'normal' }), data.username, 'Ticket created');

    const ticket = this.getTicket(id);

    try {
      getIO().emit('feedback:created', ticket);
      getIO().emit('feedback:update');
    } catch {}

    return ticket;
  },

  getTickets(filters?: {
    type?: string;
    status?: string;
    search?: string;
    sort?: string;
    order?: string;
    sync_status?: string;
    priority?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
    offset?: number;
  }) {
    const db = getDatabase();
    let sql = 'SELECT * FROM feedback_tickets';
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.type) {
      conditions.push('issue_type = ?');
      params.push(filters.type);
    }
    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters?.sync_status) {
      conditions.push('sync_status = ?');
      params.push(filters.sync_status);
    }
    if (filters?.priority) {
      conditions.push('priority = ?');
      params.push(filters.priority);
    }
    if (filters?.search) {
      conditions.push('(ticket_id LIKE ? OR summary LIKE ? OR description LIKE ?)');
      const q = `%${filters.search}%`;
      params.push(q, q, q);
    }
    if (filters?.from_date) {
      conditions.push('created_at >= ?');
      params.push(filters.from_date);
    }
    if (filters?.to_date) {
      conditions.push('created_at <= ?');
      params.push(filters.to_date);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const sortField = filters?.sort || 'created_at';
    const sortOrder = filters?.order === 'asc' ? 'ASC' : 'DESC';
    const validSorts = ['created_at', 'updated_at', 'status', 'priority', 'issue_type'];
    const finalSort = validSorts.includes(sortField) ? sortField : 'created_at';
    sql += ` ORDER BY ${finalSort} ${sortOrder}`;

    if (filters?.limit) {
      sql += ` LIMIT ${Number(filters.limit)}`;
    }
    if (filters?.offset) {
      sql += ` OFFSET ${Number(filters.offset)}`;
    }

    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map((r) => this._formatRow(r));
  },

  getTicket(id: string) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM feedback_tickets WHERE id = ? OR ticket_id = ?').get(id, id) as any;
    return row ? this._formatRow(row) : null;
  },

  getTicketCounts() {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT issue_type, status, COUNT(*) as count FROM feedback_tickets GROUP BY issue_type, status
    `).all() as any[];
    const counts: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      if (!counts[row.issue_type]) counts[row.issue_type] = {};
      counts[row.issue_type][row.status] = row.count;
    }
    return counts;
  },

  getDashboardStats() {
    const db = getDatabase();
    const recent = db.prepare("SELECT * FROM feedback_tickets ORDER BY created_at DESC LIMIT 5").all() as any[];
    const pendingSync = db.prepare("SELECT COUNT(*) as c FROM feedback_tickets WHERE sync_status IN ('local','pending','failed')").get() as any;
    const resolved = db.prepare("SELECT COUNT(*) as c FROM feedback_tickets WHERE status IN ('resolved','closed')").get() as any;
    const crashes = db.prepare("SELECT COUNT(*) as c FROM feedback_tickets WHERE issue_type = 'crash'").get() as any;
    const total = db.prepare("SELECT COUNT(*) as c FROM feedback_tickets").get() as any;
    const byStatus = db.prepare("SELECT status, COUNT(*) as c FROM feedback_tickets GROUP BY status").all() as any[];

    return {
      recentTickets: recent.map((r: any) => this._formatRow(r)),
      pendingUploads: (pendingSync as any)?.c || 0,
      resolvedReports: (resolved as any)?.c || 0,
      crashReports: (crashes as any)?.c || 0,
      totalTickets: (total as any)?.c || 0,
      byStatus: Object.fromEntries((byStatus as any[]).map((r: any) => [r.status, r.c])),
    };
  },

  updateTicketStatus(id: string, status: string, username: string, note?: string) {
    const db = getDatabase();
    const valid = ['open', 'pending', 'in_review', 'resolved', 'closed', 'rejected'];
    if (!valid.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${valid.join(', ')}`);
    }

    const ticket = db.prepare('SELECT * FROM feedback_tickets WHERE id = ?').get(id) as any;
    if (!ticket) throw new Error('Ticket not found');

    const oldStatus = ticket.status;
    const now = new Date().toISOString();
    db.prepare('UPDATE feedback_tickets SET status = ?, last_status_change_by = ?, last_status_change_at = ?, updated_at = ? WHERE id = ?')
      .run(status, username, now, now, id);

    addHistory(id, 'status', oldStatus, status, username, note || `Status changed from ${oldStatus} to ${status}`);

    const updated = this.getTicket(id);
    try {
      getIO().emit('feedback:updated', updated);
      getIO().emit('feedback:update');
    } catch {}

    return updated;
  },

  updateDeveloperNotes(id: string, notes: string, username: string) {
    const db = getDatabase();
    const ticket = db.prepare('SELECT * FROM feedback_tickets WHERE id = ?').get(id) as any;
    if (!ticket) throw new Error('Ticket not found');

    const oldNotes = ticket.developer_notes || '';
    const now = new Date().toISOString();
    db.prepare('UPDATE feedback_tickets SET developer_notes = ?, updated_at = ? WHERE id = ?').run(notes, now, id);
    addHistory(id, 'developer_notes', oldNotes, notes, username);

    const updated = this.getTicket(id);
    try { getIO().emit('feedback:updated', updated); } catch {}
    return updated;
  },

  updatePriority(id: string, priority: string, username: string) {
    const db = getDatabase();
    const valid = ['low', 'normal', 'high', 'critical'];
    if (!valid.includes(priority)) throw new Error(`Invalid priority: ${priority}`);

    const ticket = db.prepare('SELECT * FROM feedback_tickets WHERE id = ?').get(id) as any;
    if (!ticket) throw new Error('Ticket not found');

    const oldPriority = ticket.priority;
    const now = new Date().toISOString();
    db.prepare('UPDATE feedback_tickets SET priority = ?, updated_at = ? WHERE id = ?').run(priority, now, id);
    addHistory(id, 'priority', oldPriority, priority, username);

    const updated = this.getTicket(id);
    try { getIO().emit('feedback:updated', updated); } catch {}
    return updated;
  },

  voteTicket(id: string) {
    const db = getDatabase();
    db.prepare("UPDATE feedback_tickets SET votes = votes + 1, updated_at = datetime('now') WHERE (id = ? OR ticket_id = ?)").run(id, id);
    return this.getTicket(id);
  },

  getTicketHistory(ticketId: string) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM ticket_history WHERE ticket_id = ? ORDER BY created_at DESC').all(ticketId) as any[];
  },

  getAttachments(ticketId: string) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM ticket_attachments WHERE ticket_id = ? ORDER BY uploaded_at DESC').all(ticketId) as any[];
  },

  deleteAttachment(attachmentId: string) {
    const db = getDatabase();
    const att = db.prepare('SELECT * FROM ticket_attachments WHERE id = ?').get(attachmentId) as any;
    if (att) {
      deleteAttachmentFile(att.file_path);
      db.prepare('DELETE FROM ticket_attachments WHERE id = ?').run(attachmentId);
    }
  },

  getPendingUploads() {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM feedback_tickets WHERE sync_status IN ('local','pending','failed') ORDER BY created_at ASC").all() as any[];
    return rows.map((r: any) => this._formatRow(r));
  },

  getSyncQueue() {
    const db = getDatabase();
    return db.prepare("SELECT * FROM sync_queue WHERE status IN ('pending','processing','failed') ORDER BY created_at ASC").all() as any[];
  },

  async processSyncQueue(): Promise<{ synced: number; failed: number; errors: string[] }> {
    const queue = this.getSyncQueue();
    const isOnline = await checkConnectivity();
    if (!isOnline) return { synced: 0, failed: 0, errors: ['No internet connection'] };

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of queue) {
      try {
        const db = getDatabase();
        db.prepare("UPDATE sync_queue SET status = 'processing', last_attempt = datetime('now') WHERE id = ?").run(item.id);

        const ticket = db.prepare('SELECT * FROM feedback_tickets WHERE id = ?').get(item.ticket_id) as any;
        if (!ticket) {
          db.prepare("UPDATE sync_queue SET status = 'failed', error = ? WHERE id = ?").run('Ticket not found', item.id);
          failed++;
          continue;
        }

        // Create GitHub issue using app's own repo (auto-configured)
        if (item.action === 'create' || item.action === 'sync') {
          const config = getEffectiveGitHubConfig(ticket.server_id || undefined);

          if (config) {
            await this._createGitHubIssue(ticket, config);
          } else {
            // Auto-configure from app package for MineControl repo
            const pkg = getAppVersion();
            const autoConfig = { repository: 'Harsha240105/Mine-Control', api_token: '' };
            const { getCredential } = require('./encryption');
            
            const token = getCredential('github_token');
            const webhookUrl = getCredential('discord_webhook_url') || process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK;
            if (token) {
              autoConfig.api_token = token;
              await this._createGitHubIssue(ticket, autoConfig);
            } else if (webhookUrl) {
              await this._sendToDiscordWebhook(ticket, webhookUrl);
            } else {
              // No token available — mark as failed with clear message
              const msg = 'GitHub token or Discord Webhook not configured. Set up a token/webhook in Settings to sync feedback.';
              db.prepare("UPDATE sync_queue SET status = 'failed', error = ? WHERE id = ?").run(msg, item.id);
              db.prepare("UPDATE feedback_tickets SET sync_status = 'failed', sync_error = ?, sync_retries = sync_retries + 1, updated_at = ? WHERE id = ?").run(msg, new Date().toISOString(), item.ticket_id);
              failed++;
              errors.push(msg);
              continue;
            }
          }
        }

        const now = new Date().toISOString();
        db.prepare("UPDATE feedback_tickets SET sync_status = 'synced', sync_last_attempt = ?, updated_at = ? WHERE id = ?").run(now, now, item.ticket_id);
        db.prepare("UPDATE sync_queue SET status = 'completed', completed_at = ? WHERE id = ?").run(now, item.id);
        synced++;

        try { getIO().emit('feedback:synced', { ticketId: item.ticket_id }); } catch {}
      } catch (err: any) {
        const db = getDatabase();
        const retries = (db.prepare('SELECT retries FROM sync_queue WHERE id = ?').get(item.id) as any)?.retries || 0;
        const maxRetries = item.max_retries || 10;
        if (retries >= maxRetries) {
          const now = new Date().toISOString();
          db.prepare("UPDATE sync_queue SET status = 'failed', error = ?, last_attempt = ? WHERE id = ?").run(err.message, now, item.id);
          db.prepare("UPDATE feedback_tickets SET sync_status = 'failed', sync_error = ?, sync_retries = sync_retries + 1, updated_at = ? WHERE id = ?").run(err.message, now, item.ticket_id);
        } else {
          db.prepare("UPDATE sync_queue SET retries = retries + 1, error = ?, last_attempt = datetime('now'), status = 'pending' WHERE id = ?").run(err.message, item.id);
        }
        failed++;
        errors.push(err.message);
      }
    }

    try { getIO().emit('feedback:update'); } catch {}
    return { synced, failed, errors };
  },

  _formatDiagnosticBody(ticket: any): string {
    const typeLabels: Record<string, string> = {
      bug: '🐛 Bug Report',
      feature: '✨ Feature Request',
      performance: '⚡ Performance Report',
      crash: '💥 Crash Report',
      general: '📝 General Feedback',
    };

    let body = `## ${typeLabels[ticket.issue_type] || 'Issue'}\n\n`;
    body += `**Ticket ID:** ${ticket.ticket_id}\n`;
    body += `**Reported by:** ${ticket.username}\n`;
    body += `**Priority:** ${ticket.priority}\n`;
    body += `**Date:** ${ticket.created_at}\n\n`;

    if (ticket.summary) {
      body += `### Summary\n${ticket.summary}\n\n`;
    }

    body += `### Description\n${ticket.description}\n\n`;

    if (ticket.minecraft_version || ticket.server_software) {
      body += `### Environment\n`;
      body += `| Field | Value |\n`;
      body += `|---|---|\n`;
      if (ticket.minecraft_version) body += `| Minecraft Version | ${ticket.minecraft_version} |\n`;
      if (ticket.server_software) body += `| Server Software | ${ticket.server_software} |\n`;
      if (ticket.server_name) body += `| Server Name | ${ticket.server_name} |\n`;
      if (ticket.connection_mode) body += `| Connection Mode | ${ticket.connection_mode} |\n`;
      if (ticket.player_count !== undefined) body += `| Player Count | ${ticket.player_count} |\n`;
      body += '\n';
    }

    if (ticket.error_stack_trace) {
      body += `### Error Stack Trace\n\`\`\`\n${ticket.error_stack_trace.slice(0, 5000)}\n\`\`\`\n\n`;
    }

    const diag = ticket.diagnostic_data ? (typeof ticket.diagnostic_data === 'string' ? JSON.parse(ticket.diagnostic_data) : ticket.diagnostic_data) : null;
    if (diag) {
      body += `### System Diagnostics\n`;
      body += `| Field | Value |\n`;
      body += `|---|---|\n`;
      const diagFields = ['app_version', 'os', 'os_arch', 'cpu_model', 'cpu_cores', 'total_ram_gb', 'free_ram_gb', 'java_version', 'minecraft_version', 'server_software', 'server_port', 'min_ram', 'max_ram', 'node_version', 'plugin_count', 'mod_count', 'firewall_status', 'network_mode', 'uptime_hours'];
      for (const field of diagFields) {
        if (diag[field] !== undefined && diag[field] !== null && diag[field] !== '') {
          body += `| ${field.replace(/_/g, ' ')} | ${diag[field]} |\n`;
        }
      }
      body += '\n';

      if (diag.recent_console_logs && Array.isArray(diag.recent_console_logs) && diag.recent_console_logs.length > 0) {
        body += `### Recent Console Logs\n\`\`\`\n${diag.recent_console_logs.slice(-50).join('\n')}\n\`\`\`\n\n`;
      }
      if (diag.crash_reports && Array.isArray(diag.crash_reports) && diag.crash_reports.length > 0) {
        body += `### Crash Reports\n\`\`\`\n${diag.crash_reports.slice(-2).join('\n---\n')}\n\`\`\`\n\n`;
      }
    }

    if (ticket.connected_plugins && ticket.connected_plugins.length > 0) {
      const plugins = typeof ticket.connected_plugins === 'string' ? JSON.parse(ticket.connected_plugins) : ticket.connected_plugins;
      body += `### Plugins (${plugins.length})\n`;
      body += plugins.map((p: string) => `- ${p}`).join('\n') + '\n\n';
    }

    if (ticket.connected_mods && ticket.connected_mods.length > 0) {
      const mods = typeof ticket.connected_mods === 'string' ? JSON.parse(ticket.connected_mods) : ticket.connected_mods;
      body += `### Mods (${mods.length})\n`;
      body += mods.map((m: string) => `- ${m}`).join('\n') + '\n\n';
    }

    body += `---\n*Created by MineControl OS Feedback Sync*\n`;
    return body;
  },

  
  _sendToDiscordWebhook(ticket: any, webhookUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const https = require('https');
      let url: URL;
      try {
        url = new URL(webhookUrl);
      } catch {
        return reject(new Error('Invalid Discord Webhook URL'));
      }
      
      const body = this._formatDiagnosticBody(ticket);
      const payload = JSON.stringify({
        content: `**New Feedback / Bug Report** from ${ticket.username}`,
        embeds: [{
           title: ticket.summary || 'Bug Report',
           description: body.substring(0, 4096),
           color: ticket.issue_type === 'bug' ? 0xff0000 : (ticket.issue_type === 'crash' ? 0x990000 : 0x00ff00)
        }]
      });

      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res: any) => {
         if (res.statusCode >= 200 && res.statusCode < 300) resolve();
         else reject(new Error(`Discord webhook failed: ${res.statusCode}`));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  },

  _checkForDuplicate(ticket: any, config: any): Promise<{ isDuplicate: boolean; existingIssue?: any }> {
    return new Promise((resolve, reject) => {
      const [owner, repo] = config.repository.split('/');
      if (!owner || !repo) {
        reject(new Error('Invalid GitHub repository format'));
        return;
      }

      const searchTitle = encodeURIComponent(ticket.summary?.slice(0, 80) || ticket.ticket_id);
      const searchDesc = encodeURIComponent(ticket.description?.slice(0, 80) || '');

      const req = https.request({
        hostname: 'api.github.com',
        path: `/search/issues?q=${searchTitle}+repo:${owner}/${repo}+is:issue&sort=created&order=desc`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.api_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'MineControl-OS-Feedback-Sync/1.0',
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.items && result.items.length > 0) {
              const match = result.items.find((i: any) =>
                i.title.toLowerCase().includes(ticket.summary?.toLowerCase().slice(0, 40) || ticket.ticket_id.toLowerCase())
              );
              if (match) {
                resolve({ isDuplicate: true, existingIssue: match });
                return;
              }
            }
            resolve({ isDuplicate: false });
          } catch (e: any) {
            reject(new Error(`Duplicate check failed: ${e.message}`));
          }
        });
      });

      req.on('error', (e) => reject(new Error(`Duplicate check request failed: ${e.message}`)));
      req.end();
    });
  },

  _createNotification(ticketId: string, ticketTitle: string, type: string, message: string) {
    try {
      const db = getDatabase();
      const nid = uuidv4();
      const activeId = getActiveServerId();
      db.prepare(`
        INSERT INTO notifications (id, server_id, title, message, type, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(nid, activeId, `Feedback: ${ticketTitle}`, message, type, new Date().toISOString());
      try {
        getIO().emit('notification:new', { id: nid, title: ticketTitle, message, type });
      } catch {}
    } catch {}
  },

  _storeGitHubMetadata(ticketId: string, issue: any) {
    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE feedback_tickets SET
        github_url = ?, issue_tracker_url = ?, issue_tracker_id = ?,
        github_state = ?, github_labels = ?, github_milestone = ?,
        github_assignee = ?, github_created_at = ?, github_updated_at = ?,
        last_synced_at = ?, sync_status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      issue.html_url, issue.html_url, String(issue.number),
      issue.state || 'open',
      JSON.stringify((issue.labels || []).map((l: any) => typeof l === 'string' ? l : l.name)),
      issue.milestone?.title || '',
      issue.assignee?.login || '',
      issue.created_at || now,
      issue.updated_at || now,
      now, 'synced', now,
      ticketId,
    );
  },

  _cacheGitHubComments(ticketId: string, comments: any[]) {
    if (!comments || comments.length === 0) return;
    const db = getDatabase();
    const insert = db.prepare(`
      INSERT OR REPLACE INTO github_comments (id, ticket_id, github_comment_id, author, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of comments) {
      insert.run(
        String(c.id), ticketId, c.id,
        c.user?.login || 'unknown',
        c.body || '',
        c.created_at || new Date().toISOString(),
        c.updated_at || '',
      );
    }
  },

  _createGitHubIssue(ticket: any, config: any): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const [owner, repo] = config.repository.split('/');
      if (!owner || !repo) {
        reject(new Error('Invalid GitHub repository format. Use "owner/repo".'));
        return;
      }

      // Duplicate check
      try {
        const dupCheck = await this._checkForDuplicate(ticket, config);
        if (dupCheck.isDuplicate && dupCheck.existingIssue) {
          const existing = dupCheck.existingIssue;
          const db = getDatabase();
          this._storeGitHubMetadata(ticket.id, existing);
          db.prepare('UPDATE feedback_tickets SET duplicate_of = ? WHERE id = ?')
            .run(existing.html_url, ticket.id);
          this._createNotification(ticket.id, ticket.summary || ticket.ticket_id, 'warning',
            `Duplicate detected — already tracked in GitHub issue #${existing.number}: ${existing.title}`);
          reject(new Error(`Duplicate issue found: #${existing.number} — ${existing.title}`));
          return;
        }
      } catch (e: any) {
        // Duplicate check failed, proceed anyway
      }

      const typeLabels: Record<string, string> = {
        bug: 'bug',
        feature: 'feature',
        performance: 'performance',
        crash: 'bug',
        general: 'question',
      };

      const title = ticket.summary || `[${ticket.issue_type.toUpperCase()}] ${ticket.ticket_id}`;
      const body = this._formatDiagnosticBody(ticket);
      const label = typeLabels[ticket.issue_type] || 'question';

      const issueData = JSON.stringify({
        title,
        body,
        labels: [label, 'feedback-sync'],
      });

      const req = https.request({
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/issues`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.api_token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'MineControl-OS-Feedback-Sync/1.0',
          'Content-Length': Buffer.byteLength(issueData),
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          // Log every API request
          const logEntry = `[GitHub API] POST /repos/${owner}/${repo}/issues → HTTP ${res.statusCode} | repo=${config.repository} | status=${res.statusCode} | body=${data.slice(0, 200)} | timestamp=${new Date().toISOString()}`;
          try { fs.appendFileSync(resolvePath('data', 'github-sync.log'), logEntry + '\n'); } catch {}

          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              const result = JSON.parse(data);
              this._storeGitHubMetadata(ticket.id, result);
              this._createNotification(ticket.id, ticket.summary || ticket.ticket_id, 'success',
                `GitHub issue created: #${result.number} — ${result.title}`);
              resolve();
            } else {
              let errMsg = `GitHub API error (${res.statusCode})`;
              try {
                const errData = JSON.parse(data);
                errMsg = errData.message || errMsg;
              } catch {}

              // Map specific status codes to user-friendly messages
              if (res.statusCode === 401) errMsg = 'Invalid GitHub token. Generate a new token at GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens with Issues: Read & Write permission.';
              else if (res.statusCode === 403) errMsg = 'Token does not have Issues: Write permission for this repository. Update your token permissions.';
              else if (res.statusCode === 404) errMsg = `Repository "${owner}/${repo}" not found. Check the owner and repository name.`;
              else if (res.statusCode === 422) errMsg = 'Invalid issue payload. The issue title or body may contain invalid characters or exceed size limits.';

              this._createNotification(ticket.id, ticket.summary || ticket.ticket_id, 'error',
                `Failed to create GitHub issue: ${errMsg}`);
              reject(new Error(errMsg));
            }
          } catch (e: any) {
            reject(new Error(`Failed to parse GitHub response: ${e.message}`));
          }
        });
      });

      req.on('error', (e) => {
        this._createNotification(ticket.id, ticket.summary || ticket.ticket_id, 'error',
          `GitHub request failed: ${e.message}`);
        reject(new Error(`GitHub request failed: ${e.message}`));
      });
      req.write(issueData);
      req.end();
    });
  },

  syncTicketFromGitHub(ticketId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const ticket = db.prepare('SELECT * FROM feedback_tickets WHERE id = ?').get(ticketId) as any;
      if (!ticket) { reject(new Error('Ticket not found')); return; }
      if (!ticket.issue_tracker_id) { reject(new Error('Ticket has no GitHub issue number')); return; }
      if (!ticket.github_url) { reject(new Error('Ticket has no GitHub URL')); return; }

      const config = getEffectiveGitHubConfig(ticket.server_id || undefined);
      if (!config) {
        reject(new Error('GitHub tracker not configured'));
        return;
      }

      const [owner, repo] = config.repository.split('/');
      if (!owner || !repo) { reject(new Error('Invalid repository')); return; }
      const issueNumber = ticket.issue_tracker_id;

      // Fetch issue details
      https.get({
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/issues/${issueNumber}`,
        headers: {
          'Authorization': `Bearer ${config.api_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'MineControl-OS-Feedback-Sync/1.0',
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try {
            if (!res.statusCode || res.statusCode >= 300) {
              const errData = JSON.parse(data);
              reject(new Error(errData.message || `GitHub API error ${res.statusCode}`));
              return;
            }
            const issue = JSON.parse(data);

            // Map GitHub state to local status
            const oldStatus = ticket.status;
            let newStatus = oldStatus;
            if (issue.state === 'closed') {
              newStatus = 'resolved';
            } else if (issue.state === 'open') {
              newStatus = 'open';
            }
            const now = new Date().toISOString();

            // Store all metadata
            this._storeGitHubMetadata(ticket.id, issue);

            // Update local status if changed
            if (newStatus !== oldStatus) {
              db.prepare('UPDATE feedback_tickets SET status = ?, last_status_change_by = ?, last_status_change_at = ? WHERE id = ?')
                .run(newStatus, 'github-sync', now, ticket.id);
              addHistory(ticket.id, 'status', oldStatus, newStatus, 'github-sync', `Auto-synced from GitHub: ${issue.state}`);
              this._createNotification(ticket.id, ticket.summary || ticket.ticket_id, 'info',
                `Issue status updated: ${oldStatus} → ${newStatus} (synced from GitHub)`);
            }

            // Update local status based on GitHub labels
            const ghLabels = (issue.labels || []).map((l: any) => typeof l === 'string' ? l : l.name);
            const localStatusLabels: Record<string, string> = {
              'status-accepted': 'in_review',
              'status-in-progress': 'in_review',
              'status-wontfix': 'rejected',
              'status-duplicate': 'closed',
              'status-needs-info': 'pending',
            };
            for (const [label, mappedStatus] of Object.entries(localStatusLabels)) {
              if (ghLabels.includes(label) && ticket.status !== mappedStatus) {
                const old = ticket.status;
                db.prepare('UPDATE feedback_tickets SET status = ?, last_status_change_by = ?, last_status_change_at = ? WHERE id = ?')
                  .run(mappedStatus, 'github-sync', now, ticket.id);
                addHistory(ticket.id, 'status', old, mappedStatus, 'github-sync', `Auto-synced from GitHub label: ${label}`);
                this._createNotification(ticket.id, ticket.summary || ticket.ticket_id, 'info',
                  `Issue status updated via GitHub label: ${mappedStatus}`);
                break;
              }
            }

            // Check for released milestone → resolved + notify
            if (issue.milestone) {
              const milestoneTitle = issue.milestone.title;
              db.prepare('UPDATE feedback_tickets SET github_milestone = ? WHERE id = ?').run(milestoneTitle, ticket.id);
              if (issue.state === 'closed' && milestoneTitle.startsWith('v')) {
                this._createNotification(ticket.id, ticket.summary || ticket.ticket_id, 'success',
                  `Issue fixed in ${milestoneTitle} ✓`);
              }
            }

            resolve(this.getTicket(ticket.id));
          } catch (e: any) {
            reject(new Error(`Failed to parse GitHub response: ${e.message}`));
          }
        });
      }).on('error', (e) => reject(new Error(`GitHub request failed: ${e.message}`)));
    });
  },

  syncAllFromGitHub(): Promise<{ synced: number; failed: number; errors: string[] }> {
    return new Promise(async (resolve) => {
      const db = getDatabase();
      const isOnline = await checkConnectivity();
      if (!isOnline) { resolve({ synced: 0, failed: 0, errors: ['No internet connection'] }); return; }

      const syncedTickets = db.prepare(
        "SELECT * FROM feedback_tickets WHERE sync_status = 'synced' AND github_url != '' AND issue_tracker_id != ''"
      ).all() as any[];

      let synced = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const ticket of syncedTickets) {
        try {
          await this.syncTicketFromGitHub(ticket.id);
          synced++;
        } catch (e: any) {
          failed++;
          errors.push(`Ticket ${ticket.ticket_id}: ${e.message}`);
        }
      }

      try { getIO().emit('feedback:update'); } catch {}
      resolve({ synced, failed, errors });
    });
  },

  getGitHubComments(ticketId: string) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM github_comments WHERE ticket_id = ? ORDER BY created_at ASC').all(ticketId) as any[];
  },

  syncGitHubComments(ticketId: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const ticket = db.prepare('SELECT * FROM feedback_tickets WHERE id = ?').get(ticketId) as any;
      if (!ticket || !ticket.issue_tracker_id || !ticket.github_url) {
        reject(new Error('Ticket has no GitHub issue'));
        return;
      }

      const config = getEffectiveGitHubConfig(ticket.server_id || undefined);
      if (!config) {
        reject(new Error('GitHub tracker not configured'));
        return;
      }

      const [owner, repo] = config.repository.split('/');
      if (!owner || !repo) { reject(new Error('Invalid repository')); return; }

      https.get({
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/issues/${ticket.issue_tracker_id}/comments`,
        headers: {
          'Authorization': `Bearer ${config.api_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'MineControl-OS-Feedback-Sync/1.0',
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try {
            if (!res.statusCode || res.statusCode >= 300) {
              reject(new Error(`GitHub API error ${res.statusCode}`));
              return;
            }
            const comments = JSON.parse(data);

            // Check for new developer replies (non-system comments)
            const existingComments = db.prepare('SELECT github_comment_id FROM github_comments WHERE ticket_id = ?').all(ticketId) as any[];
            const existingIds = new Set(existingComments.map((c: any) => c.github_comment_id));
            const newReplies = comments.filter((c: any) => !existingIds.has(c.id) && c.user?.type !== 'Bot');

            this._cacheGitHubComments(ticketId, comments);

            // Notify about new developer replies
            for (const reply of newReplies) {
              this._createNotification(ticket.id, ticket.summary || ticket.ticket_id, 'info',
                `Developer replied: "${reply.body?.slice(0, 100)}${(reply.body?.length || 0) > 100 ? '...' : ''}"`);
              try {
                getIO().emit('feedback:comment', {
                  ticketId: ticket.id,
                  comment: {
                    id: reply.id,
                    author: reply.user?.login || 'unknown',
                    body: reply.body || '',
                    created_at: reply.created_at,
                  },
                });
              } catch {}
            }

            resolve(comments);
          } catch (e: any) {
            reject(new Error(`Failed to parse comments: ${e.message}`));
          }
        });
      }).on('error', (e) => reject(new Error(`GitHub request failed: ${e.message}`)));
    });
  },

  addToSyncQueue(ticketId: string, action: string = 'create') {
    const db = getDatabase();
    const id = uuidv4();
    db.prepare(`
      INSERT INTO sync_queue (id, ticket_id, action, payload, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(id, ticketId, action, JSON.stringify({ ticketId, action }));
    return id;
  },

  markSynced(id: string, issueTrackerUrl: string, issueTrackerId: string) {
    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare('UPDATE feedback_tickets SET sync_status = ?, issue_tracker_url = ?, issue_tracker_id = ?, github_url = ?, updated_at = ? WHERE id = ?')
      .run('synced', issueTrackerUrl, issueTrackerId, issueTrackerUrl, now, id);
    return this.getTicket(id);
  },

  getIssueTrackerConfig(serverId: string) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM issue_tracker_config WHERE server_id = ?').get(serverId) as any || null;
  },

  saveIssueTrackerConfig(serverId: string, config: {
    provider: string;
    url: string;
    api_token?: string;
    repository?: string;
    project_key?: string;
    enabled?: boolean;
    auto_sync?: boolean;
  }) {
    const db = getDatabase();
    const existing = db.prepare('SELECT id FROM issue_tracker_config WHERE server_id = ?').get(serverId) as any;
    if (existing) {
      db.prepare(`
        UPDATE issue_tracker_config SET provider = ?, url = ?, api_token = ?, repository = ?,
          project_key = ?, enabled = ?, auto_sync = ?, updated_at = datetime('now')
        WHERE server_id = ?
      `).run(config.provider, config.url, config.api_token || '', config.repository || '',
        config.project_key || '', config.enabled ? 1 : 0, config.auto_sync ? 1 : 0, serverId);
    } else {
      db.prepare(`
        INSERT INTO issue_tracker_config (server_id, provider, url, api_token, repository, project_key, enabled, auto_sync)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(serverId, config.provider, config.url, config.api_token || '', config.repository || '',
        config.project_key || '', config.enabled ? 1 : 0, config.auto_sync ? 1 : 0);
    }
    return this.getIssueTrackerConfig(serverId);
  },

  getTotalCount() {
    const db = getDatabase();
    const row = db.prepare('SELECT COUNT(*) as c FROM feedback_tickets').get() as any;
    return row?.c || 0;
  },

  _formatRow(row: any) {
    return {
      ...row,
      diagnostic_data: row.diagnostic_data ? JSON.parse(row.diagnostic_data) : null,
      screenshot_paths: row.screenshot_paths ? JSON.parse(row.screenshot_paths) : [],
      attachment_paths: row.attachment_paths ? JSON.parse(row.attachment_paths) : [],
      log_snapshots: row.log_snapshots ? JSON.parse(row.log_snapshots) : {},
      connected_plugins: row.connected_plugins ? JSON.parse(row.connected_plugins) : [],
      connected_mods: row.connected_mods ? JSON.parse(row.connected_mods) : [],
      github_labels: row.github_labels ? JSON.parse(row.github_labels) : [],
      votes: row.votes ?? 0,
      sync_retries: row.sync_retries ?? 0,
    };
  },
};
