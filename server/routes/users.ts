import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

// List all users
router.get('/', authMiddleware, requirePermission('permissions.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const users = db.prepare('SELECT id, username, role, totp_enabled, created_at, last_login FROM users ORDER BY created_at ASC').all();
  res.json(users);
});

// Create a new user
router.post('/', authMiddleware, requirePermission('permissions.manage'), (req: AuthRequest, res) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  const userRole = role || 'Member';

  // Validate role exists
  const roleExists = db.prepare('SELECT name FROM roles WHERE name = ?').get(userRole);
  if (!roleExists) {
    return res.status(400).json({ error: `Role '${userRole}' does not exist` });
  }

  db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(id, username, hash, userRole);

  const user = db.prepare('SELECT id, username, role, created_at, last_login FROM users WHERE id = ?').get(id);
  res.json({ success: true, user });
});

// Update user role
router.put('/:id', authMiddleware, requirePermission('permissions.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { role } = req.body;
  if (role) {
    const roleExists = db.prepare('SELECT name FROM roles WHERE name = ?').get(role);
    if (!roleExists) {
      return res.status(400).json({ error: `Role '${role}' does not exist` });
    }
    db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(role, req.params.id);
  }

  const updated = db.prepare('SELECT id, username, role, totp_enabled, created_at, last_login FROM users WHERE id = ?').get(req.params.id);
  res.json({ success: true, user: updated });
});

// Delete user
router.delete('/:id', authMiddleware, requirePermission('permissions.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.role === 'Owner') {
    const ownerCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'Owner'").get() as any;
    if (ownerCount.c <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last Owner account' });
    }
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
