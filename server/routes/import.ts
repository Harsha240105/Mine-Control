import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { importService } from '../services/importServer';
import { getDatabase } from '../database';

const router = Router();

// Get supported formats
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

// STEP 1+2: Analyze source - auto-detect type and analyze world
router.post('/analyze', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'File or folder not found. Please check the path and try again.' });
    }

    const result = await importService.analyze(filePath);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to analyze the import source.' });
  }
});

// STEP 3: Analyze players from a world path
router.post('/analyze-players', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { worldPath } = req.body;
    if (!worldPath || !fs.existsSync(worldPath)) {
      return res.status(400).json({ error: 'World path not found.' });
    }

    const players = importService.analyzePlayers(worldPath);
    res.json({ players });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to analyze players.' });
  }
});

// STEP 8: Validate import source
router.post('/validate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'File or folder not found.' });
    }

    const summary = await importService.getImportSummary(filePath);
    res.json({
      valid: summary.validation.valid,
      reason: summary.validation.reason,
      type: summary.type,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// STEP 9: Get full import summary
router.post('/summary', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'File or folder not found.' });
    }

    const summary = await importService.getImportSummary(filePath);
    res.json(summary);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to generate import summary.' });
  }
});

// Get list of existing servers for import destination
router.get('/servers', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const servers = db.prepare('SELECT id, name, slug, version, version_source as software, status, directory, port FROM servers ORDER BY created_at ASC').all() as any[];

  const enriched = servers.map((s: any) => {
    let worldName = 'world';
    try {
      const propsPath = path.join(s.directory, 'server.properties');
      if (fs.existsSync(propsPath)) {
        const props = fs.readFileSync(propsPath, 'utf-8');
        const ln = props.match(/^level-name=(.*)$/m);
        if (ln) worldName = ln[1].trim();
      }
    } catch {}
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      version: s.version || '',
      software: s.software || '',
      status: s.status,
      worldName,
      port: s.port,
    };
  });

  res.json({ servers: enriched });
});

// STEP 6+10: Execute import
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
    if (!config.destinationType) {
      return res.status(400).json({ error: 'Import destination type is required (new or existing).' });
    }
    if (config.destinationType === 'existing' && !config.destinationServerId) {
      return res.status(400).json({ error: 'Destination server ID is required for existing server import.' });
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

export default router;
