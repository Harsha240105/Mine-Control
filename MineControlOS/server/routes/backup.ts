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

export default router;
