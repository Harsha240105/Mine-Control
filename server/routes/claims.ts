import { Router } from 'express';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const claims = db.prepare('SELECT * FROM claims ORDER BY created_at DESC').all();
  res.json(claims);
});

router.post('/', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  const { name, owner, world, x1, z1, x2, z2, color } = req.body;
  if (!name || !owner) {
    return res.status(400).json({ error: 'Name and owner are required' });
  }
  const db = getDatabase();
  const claim = {
    id: uuidv4(),
    name,
    owner,
    world: world || 'world',
    x1: x1 || 0,
    z1: z1 || 0,
    x2: x2 || 0,
    z2: z2 || 0,
    color: color || '#ff5555',
    created_at: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO claims (id, name, owner, world, x1, z1, x2, z2, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(...Object.values(claim));
  res.json(claim);
});

router.delete('/:id', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM claims WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Claim not found' });
  }
  res.json({ success: true });
});

export default router;
