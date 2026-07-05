import { Router, Request, Response } from 'express';
import { uninstallService } from '../services/uninstall';
import { authMiddleware, requirePermission } from '../middleware/auth';

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

router.get('/storage-analysis', authMiddleware, wrap(() => uninstallService.getStorageAnalysis()));
router.get('/detect-existing', authMiddleware, wrap(() => uninstallService.detectExistingInstallation()));
router.get('/restore-status', authMiddleware, wrap(() => uninstallService.getRestoreStatus()));

router.post('/uninstall/keep-data', authMiddleware, requirePermission('server.manage'), wrap(() => uninstallService.uninstallKeepData()));
router.post('/uninstall/delete-everything', authMiddleware, requirePermission('server.manage'), wrap(() => uninstallService.uninstallDeleteEverything()));

router.post('/restore', authMiddleware, requirePermission('server.manage'), wrap(() => uninstallService.restoreExistingInstallation()));
router.post('/start-fresh', authMiddleware, requirePermission('server.manage'), wrap(() => uninstallService.startFresh()));
router.delete('/delete-existing-data', authMiddleware, requirePermission('server.manage'), wrap(() => uninstallService.deleteExistingData()));

router.get('/history', authMiddleware, wrap(() => uninstallService.getUninstallHistory()));
router.get('/dashboard-widget', authMiddleware, wrap(() => uninstallService.getDashboardWidget()));

router.get('/delete-server-info/:id', authMiddleware, wrap((req) => {
  const info = uninstallService.getDeleteServerInfo(req.params.id);
  if (!info) return { error: 'Server not found' };
  return info;
}));

export default router;
