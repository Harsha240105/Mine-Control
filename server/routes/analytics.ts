import { Router } from 'express';
import { authMiddleware, AuthRequest, requirePermission } from '../middleware/auth';
import { getDatabase } from '../database';
import { getActiveServerId } from '../db/repository/serverConfigRepository';
import { analyticsService } from '../services/analyticsService';

const router = Router();

router.get('/player/:uuid', authMiddleware, async (req: AuthRequest, res) => {
  const serverId = req.query.server_id as string || getActiveServerId();
  if (!serverId) return res.status(400).json({ error: 'No server selected' });
  const db = getDatabase();
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const result = await analyticsService.getPlayerData(
    server.directory,
    req.params.uuid,
    req.query.username as string
  );
  if (!result.success) return res.status(404).json({ error: result.error });
  res.json(result);
});

router.get('/player-trends', authMiddleware, async (req: AuthRequest, res) => {
  const serverId = req.query.server_id as string || getActiveServerId();
  if (!serverId) return res.status(400).json({ error: 'No server selected' });
  const days = parseInt(req.query.days as string) || 30;
  const trends = analyticsService.getPlayerTrends(serverId, days);
  res.json(trends);
});

router.get('/performance-trends', authMiddleware, async (req: AuthRequest, res) => {
  const serverId = req.query.server_id as string || getActiveServerId();
  if (!serverId) return res.status(400).json({ error: 'No server selected' });
  const minutes = parseInt(req.query.minutes as string) || 30;
  const trends = analyticsService.getPerformanceTrends(serverId, minutes);
  res.json(trends);
});

router.get('/metrics', authMiddleware, async (req: AuthRequest, res) => {
  const serverId = req.query.server_id as string || getActiveServerId();
  if (!serverId) return res.status(400).json({ error: 'No server selected' });
  const minutes = parseInt(req.query.minutes as string) || 30;
  const metrics = analyticsService.getServerMetrics(serverId, minutes);
  res.json(metrics);
});

router.get('/top-players', authMiddleware, async (req: AuthRequest, res) => {
  const serverId = req.query.server_id as string || getActiveServerId();
  if (!serverId) return res.status(400).json({ error: 'No server selected' });
  const limit = parseInt(req.query.limit as string) || 10;
  const top = analyticsService.getTopPlayers(serverId, limit);
  res.json(top);
});

router.get('/activity-summary', authMiddleware, async (req: AuthRequest, res) => {
  const serverId = req.query.server_id as string || getActiveServerId();
  if (!serverId) return res.status(400).json({ error: 'No server selected' });
  const summary = analyticsService.getPlayerActivitySummary(serverId);
  res.json(summary);
});

export default router;
