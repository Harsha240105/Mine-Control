import { Router } from 'express';
import { authMiddleware, AuthRequest, requirePermission } from '../middleware/auth';
import { getDatabase } from '../database';
import { getActiveServerId } from '../db/repository/serverConfigRepository';
import { getPresets, getPreset, autoTune, buildJvmArgs, generateYmlOptimizations } from '../services/performanceTuner';
import { emitToAll } from '../socketManager';

const router = Router();

// GET /api/performance/presets — list all presets
router.get('/presets', authMiddleware, (_req: AuthRequest, res) => {
  try {
    const presets = getPresets();
    const cpuCores = require('os').cpus().length;
    const ramGb = Math.round(require('os').totalmem() / 1024 / 1024 / 1024);
    res.json({ presets, system: { cpuCores, ramGb } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/performance/tune — get auto-tuned recommendations for a server
router.get('/tune', authMiddleware, (req: AuthRequest, res) => {
  try {
    const serverId = (req.query.server_id as string) || getActiveServerId();
    if (!serverId) return res.status(400).json({ error: 'No server selected' });
    const db = getDatabase();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const ramGb = parseInt(server.maxRam || '8');
    const result = autoTune(ramGb);
    const jvmFlags = buildJvmArgs({
      minRam: server.minRam || '2G',
      maxRam: server.maxRam || '8G',
      jvmFlags: server.jvm_flags || null,
    });

    res.json({
      ...result,
      current: {
        viewDistance: server.viewDistance || 10,
        simulationDistance: server.simulationDistance || 0,
        jvmFlags: server.jvm_flags || '',
        currentFlags: jvmFlags,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/performance/apply — apply a preset to a server
router.post('/apply', authMiddleware, requirePermission('server.start'), (req: AuthRequest, res) => {
  try {
    const serverId = (req.body.server_id as string) || getActiveServerId();
    if (!serverId) return res.status(400).json({ error: 'No server selected' });
    const db = getDatabase();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const { presetId } = req.body;
    const preset = getPreset(presetId);
    if (!preset) return res.status(400).json({ error: `Unknown preset: ${presetId}` });

    const flagsStr = preset.jvmFlags.join(' ');

    db.prepare(`UPDATE servers SET jvm_flags = ?, viewDistance = ?, simulationDistance = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(flagsStr, preset.viewDistance, preset.simulationDistance, serverId);

    const updated = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    emitToAll('server:updated', updated);
    res.json({ success: true, preset: presetId, server: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/performance/flags — set custom JVM flags
router.post('/flags', authMiddleware, requirePermission('server.start'), (req: AuthRequest, res) => {
  try {
    const serverId = (req.body.server_id as string) || getActiveServerId();
    if (!serverId) return res.status(400).json({ error: 'No server selected' });
    const db = getDatabase();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const { jvmFlags } = req.body;
    if (typeof jvmFlags !== 'string') return res.status(400).json({ error: 'jvmFlags must be a string' });

    db.prepare(`UPDATE servers SET jvm_flags = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(jvmFlags, serverId);

    const updated = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    emitToAll('server:updated', updated);
    res.json({ success: true, server: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/performance/yml — generate optimized server YML configuration files
router.post('/yml', authMiddleware, requirePermission('server.start'), (req: AuthRequest, res) => {
  try {
    const serverId = (req.body.server_id as string) || getActiveServerId();
    if (!serverId) return res.status(400).json({ error: 'No server selected' });
    const db = getDatabase();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const softwareType = (server.version_source || '').toLowerCase();
    const generated = generateYmlOptimizations(server.directory, softwareType, serverId);

    res.json({ success: true, generated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
