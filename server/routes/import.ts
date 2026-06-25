import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { importService } from '../services/importServer';

const router = Router();

router.post('/analyze', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'File or folder not found. Please check the path and try again.' });
    }

    const detection = await importService.analyze(filePath);
    res.json({ detection });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to analyze the import source.' });
  }
});

router.post('/execute', authMiddleware, requirePermission('server.start'), async (req: AuthRequest, res) => {
  try {
    const { filePath, config } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'Import source path is required.' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'Import source not found. The file may have been moved or deleted.' });
    }
    if (!config || !config.name) {
      return res.status(400).json({ error: 'Server name is required for import.' });
    }

    const result = await importService.import(filePath, config);
    if (!result.success) {
      return res.status(400).json({ error: result.errors.join(', ') });
    }

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Import failed. The original server has been preserved.' });
  }
});

router.get('/supported-formats', authMiddleware, (_req: AuthRequest, res) => {
  res.json({
    formats: [
      { extension: '.zip', name: 'ZIP Archive', icon: 'FileArchive' },
      { extension: '.rar', name: 'RAR Archive', icon: 'FileArchive' },
      { extension: '.7z', name: '7-Zip Archive', icon: 'FileArchive' },
    ],
    software: [
      'Paper', 'Purpur', 'Fabric', 'Forge', 'NeoForge', 'Quilt',
      'Vanilla', 'Bukkit', 'Spigot', 'Velocity', 'Waterfall',
      'Folia', 'Mohist', 'Magma', 'Arclight',
    ],
  });
});

export default router;
