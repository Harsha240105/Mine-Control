import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../database';
import { authMiddleware, generateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDatabase();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken({ id: user.id, username: user.username, role: user.role });

  // Update last login and session
  db.prepare('UPDATE users SET last_login = ?, session_token = ? WHERE id = ?')
    .run(new Date().toISOString(), token, user.id);

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
  });
});

router.post('/logout', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  db.prepare('UPDATE users SET session_token = NULL WHERE id = ?').run(req.user?.id);
  return res.json({ success: true });
});

router.get('/me', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const user = db.prepare('SELECT id, username, role, created_at, last_login FROM users WHERE id = ?').get(req.user?.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json(user);
});

router.post('/change-password', authMiddleware, (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  const db = getDatabase();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user?.id) as any;

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user?.id);
  return res.json({ success: true });
});

export default router;
