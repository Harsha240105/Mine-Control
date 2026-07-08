import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../database';
import { authMiddleware, generateToken, AuthRequest, recordFailedLogin, clearFailedLogins, isAccountLocked } from '../middleware/auth';
import { setupTOTPWithQR, verifyTOTP, enableTOTP, disableTOTP, isTOTPEnabled, verifyRecoveryCode } from '../services/twoFactorAuth';

const router = Router();

router.post('/login', (req, res, next) => {
  try {
    const { username, password, totpToken } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      if (user) {
        const attempts = recordFailedLogin(user.id);
        if (attempts >= 5) {
          return res.status(423).json({
            error: 'Account is temporarily locked due to too many failed login attempts. Try again in 15 minutes.',
            code: 'ACCOUNT_LOCKED',
            retryAfter: 900,
          });
        }
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const lockStatus = isAccountLocked(user.id);
    if (lockStatus.locked) {
      return res.status(423).json({
        error: 'Account is temporarily locked due to too many failed login attempts',
        code: 'ACCOUNT_LOCKED',
        retryAfter: Math.ceil(lockStatus.remainingMs / 1000),
      });
    }

    // Check 2FA
    if (user.totp_enabled) {
      if (!totpToken) {
        return res.status(200).json({
          require2FA: true,
          userId: user.id,
          message: '2FA token required',
        });
      }

      const validTOTP = verifyTOTP(user.id, totpToken);
      const validRecovery = !validTOTP ? verifyRecoveryCode(user.id, totpToken) : false;
      if (!validTOTP && !validRecovery) {
        return res.status(401).json({ error: 'Invalid 2FA token' });
      }
    }

    clearFailedLogins(user.id);

    const token = generateToken({ id: user.id, username: user.username, role: user.role });

    db.prepare('UPDATE users SET last_login = ?, session_token = ? WHERE id = ?')
      .run(new Date().toISOString(), token, user.id);

    // Clean up old sessions for this user (keep only current)
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(user.id, token);

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  db.prepare('UPDATE users SET session_token = NULL WHERE id = ?').run(req.user?.id);
  return res.json({ success: true });
});

router.get('/me', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const user = db.prepare('SELECT id, username, role, totp_enabled, created_at, last_login FROM users WHERE id = ?').get(req.user?.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json(user);
});

router.post('/change-password', authMiddleware, (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const db = getDatabase();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user?.id) as any;

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    const attempts = recordFailedLogin(user.id);
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user?.id);
  return res.json({ success: true });
});

// 2FA setup
router.post('/setup-2fa', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const result = await setupTOTPWithQR(req.user.id, req.user.username);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Verify and enable 2FA
router.post('/verify-2fa', authMiddleware, (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  if (verifyTOTP(req.user.id, token)) {
    enableTOTP(req.user.id);
    return res.json({ success: true });
  }

  res.status(400).json({ error: 'Invalid token' });
});

// Disable 2FA
router.post('/disable-2fa', authMiddleware, (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { password } = req.body;

  const db = getDatabase();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as any;
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(400).json({ error: 'Password is incorrect' });
  }

  disableTOTP(req.user.id);
  res.json({ success: true });
});

// Get 2FA status
router.get('/2fa-status', authMiddleware, (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ enabled: isTOTPEnabled(req.user.id) });
});

// List active sessions
router.get('/sessions', authMiddleware, (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const db = getDatabase();
  const sessions = db.prepare(
    'SELECT id, ip, user_agent, created_at, expires_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);
  res.json(sessions);
});

// Revoke a session
router.post('/sessions/:id/revoke', authMiddleware, (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const db = getDatabase();
  db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

export default router;
