import { Router } from 'express';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { getActiveServerId } from '../db/repository/serverConfigRepository';
import { getWhitelist, addToWhitelist, removeFromWhitelist, isWhitelistEnabled, setWhitelistEnabled } from '../services/ipWhitelist';

const router = Router();

// GET /api/ip-whitelist — list entries
router.get('/', authMiddleware, requirePermission('server.start'), (req: AuthRequest, res) => {
  const serverId = (req.query.server_id as string) || getActiveServerId() || undefined;
  const entries = getWhitelist(serverId);
  res.json({ entries, enabled: isWhitelistEnabled() });
});

// POST /api/ip-whitelist — add entry
router.post('/', authMiddleware, requirePermission('server.start'), (req: AuthRequest, res) => {
  const serverId = (req.body.server_id as string) || getActiveServerId();
  if (!serverId) return res.status(400).json({ error: 'No server selected' });

  const db = getDatabase();
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { ipAddress, description } = req.body;
  if (!ipAddress) return res.status(400).json({ error: 'IP address required' });

  const entry = addToWhitelist(serverId, ipAddress, description || '', req.user?.username || '');
  res.json({ success: true, entry });
});

// DELETE /api/ip-whitelist/:id — remove entry
router.delete('/:id', authMiddleware, requirePermission('server.start'), (req: AuthRequest, res) => {
  const removed = removeFromWhitelist(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

// POST /api/ip-whitelist/toggle — enable/disable whitelist
router.post('/toggle', authMiddleware, requirePermission('server.start'), (req: AuthRequest, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be boolean' });
  setWhitelistEnabled(enabled);
  res.json({ success: true, enabled });
});

export default router;
