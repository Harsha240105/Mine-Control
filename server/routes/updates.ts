import { Router, Request, Response } from 'express';
import { updaterService } from '../services/updater';

const router = Router();

function wrap(fn: (req: Request, res: Response) => any) {
  return (req: Request, res: Response) => {
    try {
      const result = fn(req, res);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal error' });
    }
  };
}

router.get('/status', wrap((_req) => updaterService.getStatus()));
router.post('/check', wrap(() => updaterService.checkForUpdates()));
router.post('/download', wrap(() => updaterService.downloadUpdate()));
router.post('/install', wrap(() => updaterService.installUpdate()));

router.get('/release-notes', wrap((req) => {
  const version = req.query.version as string | undefined;
  return updaterService.getReleaseNotes(version);
}));

router.get('/release-notes/:version', wrap((req) => {
  return updaterService.getReleaseNotes(req.params.version);
}));

router.get('/history', wrap(() => updaterService.getUpdateHistory()));
router.get('/migration-history', wrap(() => updaterService.getMigrationHistory()));

router.get('/preferences', wrap(() => updaterService.getUpdatePreferences()));
router.put('/preferences', wrap((req) => {
  const { key, value } = req.body;
  if (!key) return { error: 'Key is required' };
  return updaterService.setUpdatePreference(key, value);
}));

router.post('/pre-update-backup', wrap(() => updaterService.createPreUpdateBackup()));
router.post('/rollback', wrap(() => updaterService.rollback()));
router.post('/migrate', wrap(() => updaterService.runMigrations()));
router.get('/verify-preservation', wrap(() => updaterService.verifyPreservation()));
router.get('/dashboard-widget', wrap(() => updaterService.getDashboardWidget()));
router.get('/checklist', wrap(() => updaterService.getChecklist()));

export default router;
