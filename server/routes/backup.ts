import { Router } from 'express';
import { backupService } from '../services/backup';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const backups = backupService.getBackups();
    res.json(backups);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/create', authMiddleware, requirePermission('backup.create'), async (req: AuthRequest, res) => {
  try {
    const { name, encrypted } = req.body;
    const backup = await backupService.createBackup(
      name || `Backup-${new Date().toISOString().slice(0, 10)}`,
      'manual',
      encrypted === true
    );
    res.json(backup);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/restore/:id', authMiddleware, requirePermission('backup.restore'), async (req: AuthRequest, res) => {
  try {
    await backupService.restoreBackup(req.params.id);
    res.json({ success: true, message: 'Backup restored. Restart the server for changes to take effect.' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authMiddleware, requirePermission('backup.create'), (req: AuthRequest, res) => {
  try {
    backupService.deleteBackup(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Backup settings
router.get('/settings', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const db = require('../database').getDatabase();
    const getVal = (key: string, def: any = null) => {
      const row = db.prepare("SELECT value FROM server_config WHERE key = ?").get(`backup_${key}`) as any;
      return row ? row.value : def;
    };
    res.json({
      customFolder: getVal('customFolder', ''),
      customFolderEnabled: getVal('customFolderEnabled') === 'true',
      saveToBoth: getVal('saveToBoth') === 'true',
      autoBackup: getVal('autoBackup') === 'true',
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/settings', authMiddleware, (req: AuthRequest, res) => {
  try {
    const db = require('../database').getDatabase();
    const { customFolder, customFolderEnabled, saveToBoth, autoBackup } = req.body;
    const upsert = (key: string, value: string) => {
      db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)").run(`backup_${key}`, value);
    };
    if (customFolder !== undefined) upsert('customFolder', customFolder);
    if (customFolderEnabled !== undefined) upsert('customFolderEnabled', String(customFolderEnabled));
    if (saveToBoth !== undefined) upsert('saveToBoth', String(saveToBoth));
    if (autoBackup !== undefined) upsert('autoBackup', String(autoBackup));
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
