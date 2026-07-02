import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { backupService } from '../services/backup';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { emitToAll } from '../socketManager';
import { resolveMinecraftDir } from '../paths';
import { getDatabase } from '../database';

const router = Router();
const TEMP_UPLOADS = resolveMinecraftDir('temp_uploads');
if (!fs.existsSync(TEMP_UPLOADS)) fs.mkdirSync(TEMP_UPLOADS, { recursive: true });
const upload = multer({ dest: TEMP_UPLOADS, limits: { fileSize: 10 * 1024 * 1024 * 1024 } });

// ── List backups with search/filter/sort ──
router.get('/', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { search, type, sort, order } = req.query as any;
    const backups = backupService.getBackups({ search, type, sort, order });
    res.json(backups);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Backup settings ──
router.get('/settings', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const getVal = (key: string, def: any = null) => {
      const row = db.prepare("SELECT value FROM server_config WHERE key = ?").get(`backup_${key}`) as any;
      return row ? row.value : def;
    };
    res.json({
      customFolder: getVal('customFolder', ''),
      customFolderEnabled: getVal('customFolderEnabled') === 'true',
      saveToBoth: getVal('saveToBoth') === 'true',
      autoBackup: getVal('autoBackup') === 'true',
      autoOnCreate: getVal('autoOnCreate') === 'true',
      autoOnMigration: getVal('autoOnMigration') === 'true',
      autoOnVersionChange: getVal('autoOnVersionChange') === 'true',
      autoOnWorldImport: getVal('autoOnWorldImport') === 'true',
      autoOnRestore: getVal('autoOnRestore') === 'true',
      autoOnWorldDelete: getVal('autoOnWorldDelete') === 'true',
      autoOnConfigChange: getVal('autoOnConfigChange') === 'true',
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/settings', authMiddleware, (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const upsert = (key: string, value: string) => {
      db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)").run(`backup_${key}`, value);
    };
    const allowed = ['customFolder', 'customFolderEnabled', 'saveToBoth', 'autoBackup',
      'autoOnCreate', 'autoOnMigration', 'autoOnVersionChange', 'autoOnWorldImport',
      'autoOnRestore', 'autoOnWorldDelete', 'autoOnConfigChange'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) upsert(key, String(req.body[key]));
    }
    emitToAll('backup:settings-updated');
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Backup schedule ──
router.get('/schedule', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const schedule = backupService.getSchedule();
    res.json(schedule || { frequency: 'daily', enabled: false, time_of_day: '03:00', day_of_week: 0, day_of_month: 1, max_backups: 0, max_storage_mb: 0, max_age_days: 0 });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/schedule', authMiddleware, requirePermission('backup.create'), (req: AuthRequest, res) => {
  try {
    const schedule = backupService.updateSchedule(req.body);
    res.json(schedule);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Backup stats for dashboard ──
router.get('/stats', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const stats = backupService.getStorageStats();
    const log = backupService.getBackupLog();
    res.json({ ...stats, recentBackups: log.slice(0, 5) });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Create backup ──
router.post('/create', authMiddleware, requirePermission('backup.create'), async (req: AuthRequest, res) => {
  try {
    const { name, reason, type, encrypted, includes, createdBy } = req.body;
    const backup = await backupService.createBackup({
      name: name || undefined,
      reason: reason || undefined,
      type: type || 'manual',
      encrypted: encrypted === true,
      includes: includes || undefined,
      createdBy: createdBy || req.user?.username || 'manual',
    });
    res.json(backup);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Import backup ZIP ──
router.post('/import', authMiddleware, requirePermission('backup.create'), upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await backupService.importBackup(req.file.path, {
      reason: req.body.reason || 'Imported backup',
      createdBy: req.user?.username || 'import',
    });
    // Clean up temp file if different from destination
    if (fs.existsSync(req.file.path) && req.file.path !== result.path) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.json(result);
  } catch (error: any) {
    // Cleanup temp file on error
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(400).json({ error: error.message });
  }
});

// ── Run cleanup ──
router.post('/cleanup', authMiddleware, requirePermission('backup.create'), async (req: AuthRequest, res) => {
  try {
    const { maxBackups, maxStorageMb, maxAgeDays } = req.body || {};
    const result = await backupService.runCleanup({ maxBackups, maxStorageMb, maxAgeDays });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Export backup as portable ZIP ──
router.post('/export/:id', authMiddleware, requirePermission('backup.create'), async (req: AuthRequest, res) => {
  try {
    const exportPath = await backupService.exportBackup(req.params.id);
    const fileName = path.basename(exportPath);
    res.json({ success: true, path: exportPath, fileName, message: 'Backup exported successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Download exported backup ──
router.get('/export/:id/download', authMiddleware, (req: AuthRequest, res) => {
  try {
    const backup = backupService.getBackup(req.params.id);
    if (!backup) return res.status(404).json({ error: 'Backup not found' });
    if (!fs.existsSync(backup.path)) return res.status(404).json({ error: 'Backup file not found on disk' });
    res.download(backup.path, `${backup.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Verify backup integrity ──
router.post('/verify/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const valid = await backupService.verifyIntegrity(req.params.id);
    res.json({ integrity: valid ? 'passed' : 'failed', id: req.params.id });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Restore backup (auto-creates safety backup) ──
router.post('/restore/:id', authMiddleware, requirePermission('backup.restore'), async (req: AuthRequest, res) => {
  try {
    const result = await backupService.restoreBackup(req.params.id);
    res.json({ success: true, safetyBackupId: result.safetyBackup.id, message: 'Backup restored. Restart the server for changes to take effect.' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Get single backup details ──
router.get('/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const backup = backupService.getBackup(req.params.id);
    if (!backup) return res.status(404).json({ error: 'Backup not found' });
    res.json(backup);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Delete backup ──
router.delete('/:id', authMiddleware, requirePermission('backup.create'), (req: AuthRequest, res) => {
  try {
    backupService.deleteBackup(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Backup settings ──
router.get('/settings', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const getVal = (key: string, def: any = null) => {
      const row = db.prepare("SELECT value FROM server_config WHERE key = ?").get(`backup_${key}`) as any;
      return row ? row.value : def;
    };
    res.json({
      customFolder: getVal('customFolder', ''),
      customFolderEnabled: getVal('customFolderEnabled') === 'true',
      saveToBoth: getVal('saveToBoth') === 'true',
      autoBackup: getVal('autoBackup') === 'true',
      autoOnCreate: getVal('autoOnCreate') === 'true',
      autoOnMigration: getVal('autoOnMigration') === 'true',
      autoOnVersionChange: getVal('autoOnVersionChange') === 'true',
      autoOnWorldImport: getVal('autoOnWorldImport') === 'true',
      autoOnRestore: getVal('autoOnRestore') === 'true',
      autoOnWorldDelete: getVal('autoOnWorldDelete') === 'true',
      autoOnConfigChange: getVal('autoOnConfigChange') === 'true',
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/settings', authMiddleware, (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const upsert = (key: string, value: string) => {
      db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)").run(`backup_${key}`, value);
    };
    const allowed = ['customFolder', 'customFolderEnabled', 'saveToBoth', 'autoBackup',
      'autoOnCreate', 'autoOnMigration', 'autoOnVersionChange', 'autoOnWorldImport',
      'autoOnRestore', 'autoOnWorldDelete', 'autoOnConfigChange'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) upsert(key, String(req.body[key]));
    }
    emitToAll('backup:settings-updated');
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Backup schedule ──
router.get('/schedule', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const schedule = backupService.getSchedule();
    res.json(schedule || { frequency: 'daily', enabled: false, time_of_day: '03:00', day_of_week: 0, day_of_month: 1, max_backups: 0, max_storage_mb: 0, max_age_days: 0 });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/schedule', authMiddleware, requirePermission('backup.create'), (req: AuthRequest, res) => {
  try {
    const schedule = backupService.updateSchedule(req.body);
    res.json(schedule);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Backup stats for dashboard ──
router.get('/stats', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const stats = backupService.getStorageStats();
    const log = backupService.getBackupLog();
    res.json({ ...stats, recentBackups: log.slice(0, 5) });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
