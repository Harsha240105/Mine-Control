import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { importService } from '../services/importServer';
import { getDatabase } from '../database';

const router = Router();

function handleImportError(res: any, error: any, stage: string) {
  if (error instanceof Error && (error as any).stage) {
    return res.status(400).json({ error: (error as any).toJSON() });
  }
  return res.status(400).json({
    error: {
      stage,
      func: stage,
      file: 'server/routes/import.ts',
      message: error.message || 'An unexpected error occurred.',
      cause: error.message || 'Unknown',
      suggestedFix: 'Check the import source and try again. If the problem persists, check server logs.',
      stack: error.stack,
    },
  });
}

// Get supported formats
router.get('/supported-formats', authMiddleware, (_req: AuthRequest, res) => {
  res.json({
    formats: [
      { extension: '.zip', name: 'ZIP Archive', icon: 'FileArchive' },
      { extension: '.rar', name: 'RAR Archive', icon: 'FileArchive' },
      { extension: '.7z', name: '7-Zip Archive', icon: 'FileArchive' },
    ],
    software: [
      'Paper', 'Purpur', 'Pufferfish', 'Fabric', 'Forge', 'NeoForge', 'Quilt',
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
    handleImportError(res, error, 'analyze');
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
    handleImportError(res, error, 'analyze-players');
  }
});

// STEP 8: Validate import source
router.post('/validate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: { stage: 'validate', func: 'validate', file: 'server/routes/import.ts', message: 'File or folder not found.', cause: 'The specified path does not exist.', suggestedFix: 'Verify the file path and try again.' } });
    }

    const summary = await importService.getImportSummary(filePath);
    res.json({
      valid: summary.validation.valid,
      reason: summary.validation.reason,
      type: summary.type,
    });
  } catch (error: any) {
    handleImportError(res, error, 'validate');
  }
});

// STEP 9: Get full import summary
router.post('/summary', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: { stage: 'summary', func: 'getImportSummary', file: 'server/routes/import.ts', message: 'File or folder not found.', cause: 'The specified path does not exist.', suggestedFix: 'Verify the file path and try again.' } });
    }

    const summary = await importService.getImportSummary(filePath);
    res.json(summary);
  } catch (error: any) {
    handleImportError(res, error, 'summary');
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
      return res.status(400).json({ error: { stage: 'execute-input', func: 'import', file: 'server/routes/import.ts', message: 'Import source path is required.', cause: 'No filePath provided in request body.', suggestedFix: 'Select a file or folder to import.' } });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: { stage: 'execute-input', func: 'import', file: 'server/routes/import.ts', message: 'Import source not found.', cause: `File does not exist: ${filePath}`, suggestedFix: 'Verify the file path still exists and try again.' } });
    }
    if (!config || !config.name) {
      return res.status(400).json({ error: { stage: 'execute-input', func: 'import', file: 'server/routes/import.ts', message: 'Server name is required for import.', cause: 'No name provided in import config.', suggestedFix: 'Enter a name for the imported server.' } });
    }
    if (!config.destinationType) {
      return res.status(400).json({ error: { stage: 'execute-input', func: 'import', file: 'server/routes/import.ts', message: 'Import destination type is required.', cause: 'No destinationType provided.', suggestedFix: 'Select whether to create a new server or import to an existing one.' } });
    }
    if (config.destinationType === 'existing' && !config.destinationServerId) {
      return res.status(400).json({ error: { stage: 'execute-input', func: 'import', file: 'server/routes/import.ts', message: 'Destination server ID is required.', cause: 'No destinationServerId provided for existing server import.', suggestedFix: 'Select a destination server from the list.' } });
    }

    const result = await importService.import(filePath, config);
    if (!result.success) {
      return res.status(400).json({ error: { stage: 'execute', func: 'import', file: 'server/services/importServer.ts', message: result.errors.join(', '), cause: result.errors.join(', '), suggestedFix: 'Check the import source data and try again.' } });
    }

    res.json(result);
  } catch (error: any) {
    handleImportError(res, error, 'execute');
  }
});

export default router;
