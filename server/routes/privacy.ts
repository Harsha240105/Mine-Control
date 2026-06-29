import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getDatabase } from '../database';
import { resolveMinecraftDir, resolvePath, BASE_PATH } from '../paths';
import { privacyService } from '../services/privacy';

const router = Router();

// Existing endpoint — local data summary
router.get('/data', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const servers_count = (db.prepare('SELECT COUNT(*) as c FROM servers').get() as any)?.c || 0;
    const players_count = (db.prepare('SELECT COUNT(*) as c FROM players').get() as any)?.c || 0;
    const backups_count = (db.prepare('SELECT COUNT(*) as c FROM backups').get() as any)?.c || 0;
    const tickets_count = (db.prepare('SELECT COUNT(*) as c FROM feedback_tickets').get() as any)?.c || 0;
    const chat_logs_count = (db.prepare('SELECT COUNT(*) as c FROM chat_log').get() as any)?.c || 0;
    let logs_size_bytes = 0;
    const logsDir = resolveMinecraftDir('logs');
    if (fs.existsSync(logsDir)) {
      const walkDir = (dir: string) => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) walkDir(fullPath);
            else if (entry.isFile()) try { logs_size_bytes += fs.statSync(fullPath).size; } catch {}
          }
        } catch {}
      };
      walkDir(logsDir);
    }
    res.json({ servers_count, players_count, backups_count, tickets_count, chat_logs_count, logs_size_bytes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Existing — clear logs
router.delete('/logs', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM chat_log').run();
    const logsDir = resolveMinecraftDir('logs');
    if (fs.existsSync(logsDir)) {
      const entries = fs.readdirSync(logsDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(logsDir, entry.name);
        try {
          if (entry.isDirectory()) fs.rmSync(fullPath, { recursive: true, force: true });
          else fs.unlinkSync(fullPath);
        } catch {}
      }
    }
    res.json({ success: true, message: 'Console logs and chat logs cleared.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Existing — clear backups
router.delete('/backups', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const backups = db.prepare('SELECT path FROM backups').all() as any[];
    for (const backup of backups) {
      if (backup.path && fs.existsSync(backup.path)) try { fs.unlinkSync(backup.path); } catch {}
    }
    const backupDir = resolveMinecraftDir('backups');
    if (fs.existsSync(backupDir)) {
      try {
        const entries = fs.readdirSync(backupDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(backupDir, entry.name);
          if (entry.isDirectory()) fs.rmSync(fullPath, { recursive: true, force: true });
          else fs.unlinkSync(fullPath);
        }
      } catch {}
    }
    db.prepare('DELETE FROM backups').run();
    res.json({ success: true, message: 'All backups deleted.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Existing — export data
router.get('/export', authMiddleware, (req: AuthRequest, res) => {
  try {
    const includeSecrets = req.query.secrets === 'true';
    const data = privacyService.exportData(includeSecrets);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="minecontrol-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== NEW PHASE 10 ENDPOINTS =====

// Local data storage locations
router.get('/locations', authMiddleware, (_req, res) => {
  try {
    const locations = privacyService.getLocalDataInfo();
    res.json(locations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Open a folder path
router.post('/open-folder', authMiddleware, (req, res) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath) return res.status(400).json({ error: 'folderPath is required' });
    if (fs.existsSync(folderPath)) {
      const { execSync } = require('child_process');
      execSync(`explorer "${folderPath}"`, { timeout: 3000 });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Folder not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// External integrations
router.get('/integrations', authMiddleware, (_req, res) => {
  try {
    const integrations = privacyService.getExternalIntegrations();
    res.json(integrations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Permissions
router.get('/permissions', authMiddleware, (_req, res) => {
  try {
    const permissions = privacyService.getPermissions();
    res.json(permissions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/permissions/:featureKey', authMiddleware, (req, res) => {
  try {
    const { featureKey } = req.params;
    const { enabled } = req.body;
    if (enabled === undefined) return res.status(400).json({ error: 'enabled is required' });
    privacyService.setPermission(featureKey, !!enabled);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stored credentials
router.get('/credentials', authMiddleware, (_req, res) => {
  try {
    const credentials = privacyService.getStoredCredentials();
    res.json(credentials);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/credentials', authMiddleware, (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || !value) return res.status(400).json({ error: 'key and value are required' });
    privacyService.saveCredential(key, value);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/credentials/:key', authMiddleware, (req, res) => {
  try {
    const { key } = req.params;
    privacyService.deleteStoredCredential(key);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Security check
router.post('/security-check', authMiddleware, (_req, res) => {
  try {
    const result = privacyService.runSecurityCheck();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Security status
router.get('/security-status', authMiddleware, (_req, res) => {
  try {
    const status = privacyService.getSecurityStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Privacy preferences
router.get('/preferences', authMiddleware, (_req, res) => {
  try {
    const prefs = privacyService.getPreferences();
    res.json(prefs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/preferences', authMiddleware, (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) return res.status(400).json({ error: 'key and value are required' });
    privacyService.setPreference(key, String(value));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Audit log
router.get('/audit-log', authMiddleware, (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const log = privacyService.getAuditLog(limit);
    res.json(log);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard widget
router.get('/dashboard-widget', authMiddleware, (_req, res) => {
  try {
    const widget = privacyService.getDashboardWidget();
    res.json(widget);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Clear cache
router.post('/clear-cache', authMiddleware, (_req, res) => {
  try {
    const result = privacyService.clearCache();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Clear feedback queue
router.post('/clear-feedback', authMiddleware, (_req, res) => {
  try {
    const result = privacyService.clearFeedbackQueue();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Clear diagnostics
router.post('/clear-diagnostics', authMiddleware, (_req, res) => {
  try {
    const result = privacyService.clearDiagnostics();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete all user data
router.post('/delete-all', authMiddleware, (_req, res) => {
  try {
    const result = privacyService.deleteAllUserData();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
