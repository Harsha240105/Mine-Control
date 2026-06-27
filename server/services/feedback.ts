import { getDatabase } from '../database';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function random5(): string {
  return String(Math.floor(10000 + Math.random() * 90000));
}

function generateTicketId(type: 'bug' | 'feature'): string {
  const prefix = type === 'bug' ? 'BUG' : 'MC';
  return `${prefix}-${random5()}`;
}

function collectDiagnostics(): Record<string, any> {
  const db = getDatabase();
  let consoleLines: string[] = [];
  try {
    const logPath = path.join(process.cwd(), 'server-out.log');
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split(/\r?\n/).filter(Boolean);
      consoleLines = lines.slice(-50);
    }
  } catch {}

  let pluginsList: string[] = [];
  try {
    const plugins = db.prepare('SELECT name, version FROM plugins').all() as any[];
    pluginsList = plugins.map((p) => `${p.name}@${p.version}`);
  } catch {}

  let minecraftVersion = '';
  try {
    const server = db.prepare('SELECT version FROM servers WHERE id = (SELECT value FROM server_config WHERE key = ?)').get('active_server_id') as any;
    if (server) minecraftVersion = server.version || '';
  } catch {}

  let playitStatus = '';
  try {
    const row = db.prepare("SELECT value FROM server_config WHERE key = 'playitAddress'").get() as any;
    if (row) playitStatus = row.value ? 'connected' : 'inactive';
  } catch {}

  const javaInfo = (() => {
    try {
      return execSync('java -version 2>&1', { encoding: 'utf-8', timeout: 3000 }).split(/\r?\n/)[0] || '';
    } catch {
      return '';
    }
  })();

  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown';

  return {
    app_version: process.env.npm_package_version || '1.0.44',
    os: `${os.type()} ${os.release()}`,
    cpu: cpuModel,
    cpu_cores: cpus.length,
    total_ram_gb: Math.round((os.totalmem() / (1024 ** 3)) * 100) / 100,
    free_ram_gb: Math.round((os.freemem() / (1024 ** 3)) * 100) / 100,
    java: javaInfo,
    minecraft_version: minecraftVersion,
    plugins: pluginsList,
    last_50_console_lines: consoleLines,
    socket_io_state: 'connected',
    network_state: 'active',
    playit_status: playitStatus,
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    uptime_hours: Math.round(os.uptime() / 3600),
  };
}

function sanitizeDiagnostics(data: Record<string, any>): Record<string, any> {
  const sensitiveKeys = ['token', 'password', 'secret', 'key', 'auth', 'credential', 'jwt'];
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && sensitiveKeys.some((sk) => value.toLowerCase().includes(sk))) {
      sanitized[key] = value.replace(/(token|password|secret|key|auth|credential|jwt)=[^\s&]+/gi, '$1=[REDACTED]');
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export const feedbackService = {
  createTicket(data: {
    title: string;
    description: string;
    type: 'bug' | 'feature';
    username: string;
    screenshots?: string[];
  }) {
    const db = getDatabase();
    const id = uuidv4();
    const ticketId = generateTicketId(data.type);
    const now = new Date().toISOString();

    let diagnosticData: Record<string, any> | null = null;
    if (data.type === 'bug') {
      diagnosticData = sanitizeDiagnostics(collectDiagnostics());
    }

    db.prepare(`
      INSERT INTO feedback_tickets (id, ticket_id, title, description, type, status, username, diagnostic_data, screenshot_paths, votes, github_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, 0, NULL, ?, ?)
    `).run(
      id,
      ticketId,
      data.title,
      data.description,
      data.type,
      data.username,
      diagnosticData ? JSON.stringify(diagnosticData) : null,
      data.screenshots ? JSON.stringify(data.screenshots) : '[]',
      now,
      now,
    );

    return this.getTicket(id);
  },

  getTickets(filters?: { type?: string; status?: string }) {
    const db = getDatabase();
    let sql = 'SELECT * FROM feedback_tickets';
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.type) {
      conditions.push('type = ?');
      params.push(filters.type);
    }
    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC';

    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(this._formatRow);
  },

  getTicket(id: string) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM feedback_tickets WHERE id = ? OR ticket_id = ?').get(id, id) as any;
    return row ? this._formatRow(row) : null;
  },

  updateTicketStatus(id: string, status: string, username: string) {
    const db = getDatabase();
    const valid = ['open', 'in_progress', 'resolved', 'closed'];
    if (!valid.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${valid.join(', ')}`);
    }

    const ticket = db.prepare('SELECT * FROM feedback_tickets WHERE id = ?').get(id) as any;
    if (!ticket) throw new Error('Ticket not found');
    if (ticket.username !== username) {
      const user = db.prepare('SELECT role FROM users WHERE username = ?').get(username) as any;
      if (!user || user.role !== 'Owner') {
        throw new Error('Only the ticket owner or an Owner can update status');
      }
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE feedback_tickets SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    return this.getTicket(id);
  },

  voteTicket(id: string) {
    const db = getDatabase();
    db.prepare('UPDATE feedback_tickets SET votes = votes + 1, updated_at = datetime(\'now\') WHERE (id = ? OR ticket_id = ?)').run(id, id);
    return this.getTicket(id);
  },

  getPendingUploads() {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM feedback_tickets WHERE github_url IS NULL OR github_url = '' ORDER BY created_at DESC").all() as any[];
    return rows.map(this._formatRow);
  },

  markUploaded(id: string, githubUrl: string) {
    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare('UPDATE feedback_tickets SET github_url = ?, updated_at = ? WHERE id = ?').run(githubUrl, now, id);
    return this.getTicket(id);
  },

  _formatRow(row: any) {
    return {
      ...row,
      diagnostic_data: row.diagnostic_data ? JSON.parse(row.diagnostic_data) : null,
      screenshot_paths: row.screenshot_paths ? JSON.parse(row.screenshot_paths) : [],
      votes: row.votes ?? 0,
    };
  },
};
