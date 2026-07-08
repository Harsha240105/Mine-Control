import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth';
import { connectionManager } from '../services/connectionManager';
import { firewallManager } from '../services/firewallManager';
import { getActiveServerId } from '../db/repository/serverConfigRepository';

const router = Router();

// ── Full Connection Status ──
router.get('/status', authMiddleware, async (_req: any, res) => {
  const status = await connectionManager.getFullStatus();
  res.json(status);
});

// ── Playit Tunnel Lifecycle ──

router.get('/playit/status', authMiddleware, async (_req: any, res) => {
  const status = connectionManager.getPlayitStatus();
  const full = await connectionManager.getFullStatus();
  res.json({ ...status, tunnelActive: full.playitActive });
});

router.post('/playit/start', authMiddleware, requirePermission('server.manage'), async (req: any, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Playit token is required. Get one from https://playit.gg/account' });
  const result = await connectionManager.startPlayitAgent(token);
  res.json(result);
});

router.post('/playit/stop', authMiddleware, requirePermission('server.manage'), async (_req: any, res) => {
  const result = connectionManager.stopPlayitAgent();
  res.json(result);
});

// ── Ngrok Tunnel Lifecycle ──

router.get('/ngrok/status', authMiddleware, async (_req: any, res) => {
  const status = connectionManager.getNgrokStatus();
  res.json(status);
});

router.post('/ngrok/start', authMiddleware, requirePermission('server.manage'), async (req: any, res) => {
  const { authtoken } = req.body;
  const config = await import('../services/minecraftServer').then(m => m.minecraftServer.getConfig());
  const port = config?.port || 25565;
  const result = await connectionManager.startNgrok(port, authtoken);
  res.json(result);
});

router.post('/ngrok/stop', authMiddleware, requirePermission('server.manage'), async (_req: any, res) => {
  const result = connectionManager.stopNgrok();
  res.json(result);
});

// ── Firewall ──

router.get('/firewall', authMiddleware, async (_req: any, res) => {
  const serverId = getActiveServerId();
  const status = firewallManager.checkRule(serverId || undefined);
  res.json({
    ...status,
    isAdmin: firewallManager.isAdmin(),
  });
});

router.post('/firewall/add', authMiddleware, requirePermission('server.manage'), async (req: any, res) => {
  const serverId = getActiveServerId();
  const port = req.body.port || 25565;
  const result = firewallManager.addRule(port, serverId || undefined);
  res.json(result);
});

router.post('/firewall/remove', authMiddleware, requirePermission('server.manage'), async (_req: any, res) => {
  const serverId = getActiveServerId();
  const result = firewallManager.removeRule(serverId || undefined);
  res.json(result);
});

router.post('/firewall/repair', authMiddleware, requirePermission('server.manage'), async (req: any, res) => {
  const serverId = getActiveServerId();
  const port = req.body.port || 25565;
  const result = firewallManager.repairRule(port, serverId || undefined);
  res.json(result);
});

// ── Diagnostics History ──

router.get('/diagnostics', authMiddleware, async (req: any, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const history = await connectionManager.getDiagnosticsHistory(limit);
  res.json(history);
});

// ── Preferred Mode ──

router.get('/preferred-mode', authMiddleware, async (_req: any, res) => {
  const mode = connectionManager.getPreferredMode();
  res.json({ mode });
});

router.post('/preferred-mode', authMiddleware, requirePermission('server.manage'), async (req: any, res) => {
  const { mode } = req.body;
  if (!['auto', 'localhost', 'lan', 'playit', 'ngrok'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Must be auto, localhost, lan, playit, or ngrok.' });
  }
  connectionManager.setPreferredMode(mode);
  res.json({ success: true, mode });
});

// ── Test Join ──

router.post('/test-join', authMiddleware, async (req: any, res) => {
  const { address } = req.body;
  const result = await connectionManager.testJoin(address);
  res.json(result);
});

// ── Update Socket.IO emission ──

router.post('/emit-update', authMiddleware, async (_req: any, res) => {
  await connectionManager.emitConnectionUpdate();
  res.json({ success: true });
});

export default router;
