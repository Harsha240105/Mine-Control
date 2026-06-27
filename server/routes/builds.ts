import { Router } from 'express';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const builds = db.prepare('SELECT * FROM build_tags ORDER BY created_at DESC').all();
  res.json(builds);
});

router.post('/', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  const { name, type, world, x, y, z, owner } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const db = getDatabase();
  const tag = {
    id: uuidv4(),
    name,
    type: type || 'base',
    world: world || 'world',
    x: x || 0,
    y: y || 0,
    z: z || 0,
    owner: owner || req.user?.username || 'unknown',
    created_at: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO build_tags (id, name, type, world, x, y, z, owner, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(...Object.values(tag));
  res.json(tag);
});

router.delete('/:id', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM build_tags WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Build tag not found' });
  }
  res.json({ success: true });
});

export default router;
