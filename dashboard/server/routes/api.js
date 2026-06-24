import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { authenticateToken } from '../middleware/auth.js';

const execAsync = promisify(exec);
const router = Router();

const MC_DIR = process.env.MC_DIR || '/opt/minecraft/server';
const LOG_DIR = process.env.MC_LOG_DIR || '/opt/minecraft/logs';

router.use(authenticateToken);

router.get('/status', async (req, res) => {
  try {
    let isRunning = false;
    try {
      const { stdout } = await execAsync('systemctl is-active minecraft.service');
      isRunning = stdout.trim() === 'active';
    } catch {
      isRunning = false;
    }

    const cpus = os.cpus();
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = ((totalMem - freeMem) / totalMem) * 100;

    let tps = -1;
    let players = [];

    if (isRunning) {
      try {
        const { stdout: tpsOut } = await execAsync(
          "journalctl -u minecraft.service --since '1 minute ago' --no-pager --output=cat | grep -oP '\\d+\\.\\d+ tps' | tail -1"
        );
        tps = parseFloat(tpsOut) || -1;
      } catch {}

      const cacheFile = path.join(MC_DIR, 'usercache.json');
      if (fs.existsSync(cacheFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
          players = data.map(u => ({
            name: u.name,
            uuid: u.uuid,
            lastSeen: u.expiresOn
          }));
        } catch {}
      }
    }

    res.json({
      running: isRunning,
      tps,
      players,
      cpu: Math.round(cpuUsage * 100) / 100,
      memory: {
        used: Math.round((totalMem - freeMem) / 1024 / 1024),
        total: Math.round(totalMem / 1024 / 1024),
        percent: Math.round(memUsage * 100) / 100
      },
      uptime: Math.floor(os.uptime())
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/server/start', async (req, res) => {
  try {
    await execAsync('sudo systemctl start minecraft.service');
    const db = (await import('../db/database.js')).getDb();
    db.prepare(
      'INSERT INTO audit_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, 'server_start', 'Server start initiated', req.ip);
    res.json({ message: 'Server start initiated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/server/stop', async (req, res) => {
  try {
    await execAsync('sudo systemctl stop minecraft.service');
    const db = (await import('../db/database.js')).getDb();
    db.prepare(
      'INSERT INTO audit_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, 'server_stop', 'Server stop initiated', req.ip);
    res.json({ message: 'Server stop initiated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/server/restart', async (req, res) => {
  try {
    await execAsync('sudo systemctl restart minecraft.service');
    const db = (await import('../db/database.js')).getDb();
    db.prepare(
      'INSERT INTO audit_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, 'server_restart', 'Server restart initiated', req.ip);
    res.json({ message: 'Server restart initiated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/server/backup', async (req, res) => {
  try {
    const db = (await import('../db/database.js')).getDb();
    const job = db.prepare(
      'INSERT INTO backup_jobs (type, status, started_at) VALUES (?, ?, ?)'
    ).run('manual', 'running', new Date().toISOString());

    exec('sudo -u minecraft /opt/minecraft/scripts/backup.sh manual', (error, stdout, stderr) => {
      const completed = error === null;
      const size = error ? 0 : (() => {
        try {
          const files = fs.readdirSync('/opt/minecraft/backups').filter(f => f.startsWith('mc-manual-'));
          if (files.length === 0) return 0;
          return fs.statSync(path.join('/opt/minecraft/backups', files[files.length - 1])).size;
        } catch { return 0; }
      })();

      db.prepare(
        'UPDATE backup_jobs SET status = ?, file_size_bytes = ?, completed_at = ?, error_message = ? WHERE id = ?'
      ).run(
        completed ? 'completed' : 'failed',
        size,
        new Date().toISOString(),
        completed ? null : stderr,
        job.lastInsertRowid
      );
    });

    db.prepare(
      'INSERT INTO audit_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, 'backup_manual', 'Manual backup initiated', req.ip);

    res.json({ message: 'Backup initiated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 100;
    const { stdout } = await execAsync(
      `journalctl -u minecraft.service --no-pager -n ${lines} --output=cat`
    );
    const logLines = stdout.split('\n').filter(Boolean);
    res.json({ lines: logLines });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/logs/latest', async (req, res) => {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      const { stdout } = await execAsync(
        'journalctl -u minecraft.service -n 50 --no-pager --output=cat'
      );
      return res.json({ lines: stdout.split('\n').filter(Boolean) });
    }

    const logFiles = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith('server-') && f.endsWith('.log'))
      .sort()
      .reverse();

    if (logFiles.length === 0) {
      return res.json({ lines: [] });
    }

    const content = fs.readFileSync(path.join(LOG_DIR, logFiles[0]), 'utf8');
    const lines = content.split('\n').filter(Boolean).slice(-200);
    res.json({ lines });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/backups', async (req, res) => {
  try {
    const db = (await import('../db/database.js')).getDb();
    const jobs = db.prepare(
      'SELECT * FROM backup_jobs ORDER BY created_at DESC LIMIT 20'
    ).all();
    res.json({ backups: jobs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export { router as apiRouter };
