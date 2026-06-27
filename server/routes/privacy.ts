import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getDatabase } from '../database';
import { resolveMinecraftDir } from '../paths';

const router = Router();

router.get('/data', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const db = getDatabase();

    const servers_count = (db.prepare('SELECT COUNT(*) as c FROM servers').get() as any)?.c || 0;
    const players_count = (db.prepare('SELECT COUNT(*) as c FROM players').get() as any)?.c || 0;
    const backups_count = (db.prepare('SELECT COUNT(*) as c FROM backups').get() as any)?.c || 0;
    const tickets_count = (db.prepare('SELECT COUNT(*) as c FROM feedback_tickets').get() as any)?.c || 0;
    const chat_logs_count = (db.prepare('SELECT COUNT(*) as c FROM chat_log').get() as any)?.c || 0;

    // Calculate server logs size
    let logs_size_bytes = 0;
    const logsDir = resolveMinecraftDir('logs');
    if (fs.existsSync(logsDir)) {
      const walkDir = (dir: string) => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walkDir(fullPath);
            } else if (entry.isFile()) {
              try {
                logs_size_bytes += fs.statSync(fullPath).size;
              } catch {
                // skip
              }
            }
          }
        } catch {
          // skip
        }
      };
      walkDir(logsDir);
    }

    res.json({
      servers_count,
      players_count,
      backups_count,
      tickets_count,
      chat_logs_count,
      logs_size_bytes,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/logs', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const db = getDatabase();

    // Truncate chat_log table
    db.prepare('DELETE FROM chat_log').run();

    // Delete server log files
    const logsDir = resolveMinecraftDir('logs');
    if (fs.existsSync(logsDir)) {
      const entries = fs.readdirSync(logsDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(logsDir, entry.name);
        try {
          if (entry.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullPath);
          }
        } catch {
          // skip individual file errors
        }
      }
    }

    res.json({ success: true, message: 'Console logs and chat logs cleared.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/backups', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const db = getDatabase();

    // Delete all backup files from disk
    const backups = db.prepare('SELECT path FROM backups').all() as any[];
    for (const backup of backups) {
      if (backup.path && fs.existsSync(backup.path)) {
        try {
          fs.unlinkSync(backup.path);
        } catch {
          // skip
        }
      }
    }

    // Delete backup directory contents
    const backupDir = resolveMinecraftDir('backups');
    if (fs.existsSync(backupDir)) {
      try {
        const entries = fs.readdirSync(backupDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(backupDir, entry.name);
          if (entry.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullPath);
          }
        }
      } catch {
        // skip
      }
    }

    // Clear all backup records
    db.prepare('DELETE FROM backups').run();

    res.json({ success: true, message: 'All backups deleted.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/export', authMiddleware, (req: AuthRequest, res) => {
  try {
    const db = getDatabase();

    const data: Record<string, any> = {
      exported_at: new Date().toISOString(),
      user: req.user ? { id: req.user.id, username: req.user.username, role: req.user.role } : null,
    };

    // Gather all data from relevant tables
    try {
      data.servers = db.prepare('SELECT * FROM servers').all();
    } catch { data.servers = []; }
    try {
      data.players = db.prepare('SELECT * FROM players').all();
    } catch { data.players = []; }
    try {
      data.backups = db.prepare('SELECT id, name, size, created_at, type, worlds, encrypted FROM backups').all();
    } catch { data.backups = []; }
    try {
      data.chat_logs = db.prepare('SELECT * FROM chat_log ORDER BY timestamp DESC LIMIT 1000').all();
    } catch { data.chat_logs = []; }
    try {
      data.roles = db.prepare('SELECT * FROM roles').all();
    } catch { data.roles = []; }
    try {
      data.claims = db.prepare('SELECT * FROM claims').all();
    } catch { data.claims = []; }
    try {
      data.build_tags = db.prepare('SELECT * FROM build_tags').all();
    } catch { data.build_tags = []; }
    try {
      data.schedules = db.prepare('SELECT * FROM schedules').all();
    } catch { data.schedules = []; }
    try {
      data.notifications = db.prepare('SELECT * FROM notifications').all();
    } catch { data.notifications = []; }
    try {
      data.worlds = db.prepare('SELECT * FROM worlds').all();
    } catch { data.worlds = []; }
    try {
      data.plugins = db.prepare('SELECT * FROM plugins').all();
    } catch { data.plugins = []; }
    try {
      data.audit_log = db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 500').all();
    } catch { data.audit_log = []; }
    try {
      data.server_config = db.prepare('SELECT key, value FROM server_config').all();
    } catch { data.server_config = []; }

    // Count total records
    const countEntries = (obj: Record<string, any[]>) => {
      const counts: Record<string, number> = {};
      for (const [key, arr] of Object.entries(obj)) {
        if (Array.isArray(arr)) counts[key] = arr.length;
      }
      return counts;
    };
    data._recordCounts = countEntries(data);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="minecontrol-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
