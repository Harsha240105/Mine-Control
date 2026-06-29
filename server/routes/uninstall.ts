import { Router, Request, Response } from 'express';
import { uninstallService } from '../services/uninstall';

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

router.get('/storage-analysis', wrap(() => uninstallService.getStorageAnalysis()));
router.get('/detect-existing', wrap(() => uninstallService.detectExistingInstallation()));
router.get('/restore-status', wrap(() => uninstallService.getRestoreStatus()));

router.post('/uninstall/keep-data', wrap(() => uninstallService.uninstallKeepData()));
router.post('/uninstall/delete-everything', wrap(() => uninstallService.uninstallDeleteEverything()));

router.post('/restore', wrap(() => uninstallService.restoreExistingInstallation()));
router.post('/start-fresh', wrap(() => uninstallService.startFresh()));
router.delete('/delete-existing-data', wrap(() => uninstallService.deleteExistingData()));

router.get('/history', wrap(() => uninstallService.getUninstallHistory()));
router.get('/dashboard-widget', wrap(() => uninstallService.getDashboardWidget()));

router.get('/delete-server-info/:id', wrap((req) => {
  const info = uninstallService.getDeleteServerInfo(req.params.id);
  if (!info) return { error: 'Server not found' };
  return info;
}));

export default router;
