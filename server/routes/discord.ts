import express from 'express';
import { AuthRequest, authMiddleware, requirePermission } from '../middleware/auth';
import { getDatabase } from '../database';
import { discordService } from '../services/discord';

const router = express.Router();

router.get('/', authMiddleware, requirePermission('settings.view'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const token = (db.prepare("SELECT value FROM server_config WHERE key = 'discordToken'").get() as any)?.value || '';
  const channel = (db.prepare("SELECT value FROM server_config WHERE key = 'discordChannel'").get() as any)?.value || '';
  
  res.json({ token, channelId: channel });
});

router.post('/', authMiddleware, requirePermission('settings.edit'), async (req: AuthRequest, res) => {
  const { token, channelId } = req.body;
  const db = getDatabase();

  if (token !== undefined) {
    db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('discordToken', ?)").run(token);
  }
  
  if (channelId !== undefined) {
    db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('discordChannel', ?)").run(channelId);
  }

  // Restart Discord service
  await discordService.restart();

  res.json({ success: true });
});

export default router;
