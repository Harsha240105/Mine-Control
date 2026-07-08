import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../database';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { isWhitelisted, isWhitelistEnabled } from '../services/ipWhitelist';

function getJWTSecret(): string {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret) return envSecret;

  const db = getDatabase();
  const row = db.prepare("SELECT value FROM server_config WHERE key = 'jwt_secret'").get() as any;
  if (row?.value) return row.value;

  const newSecret = crypto.randomBytes(48).toString('base64');
  db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('jwt_secret', ?)").run(newSecret);
  return newSecret;
}

let _jwtSecret: string | null = null;
function getJWTSecretCached(): string {
  if (!_jwtSecret) _jwtSecret = getJWTSecret();
  return _jwtSecret;
}

export const JWT_SECRET = 'USE_CACHED_FUNCTION';

export function getJwtSecret(): string {
  return getJWTSecretCached();
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
  file?: Express.Multer.File;
}

export function generateToken(user: { id: string; username: string; role: string }): string {
  return jwt.sign(user, getJwtSecret(), { expiresIn: '24h' });
}

export function verifyToken(token: string): any {
  return jwt.verify(token, getJwtSecret());
}

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export function isAccountLocked(userId: string): { locked: boolean; remainingMs: number } {
  const db = getDatabase();
  const user = db.prepare('SELECT locked_until, failed_login_attempts FROM users WHERE id = ?').get(userId) as any;
  if (!user) return { locked: false, remainingMs: 0 };

  if (user.locked_until) {
    const lockTime = new Date(user.locked_until).getTime();
    const remaining = lockTime - Date.now();
    if (remaining > 0) {
      return { locked: true, remainingMs: remaining };
    }
    db.prepare("UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = ?").run(userId);
  }

  return { locked: false, remainingMs: 0 };
}

export function recordFailedLogin(userId: string): number {
  const db = getDatabase();
  const user = db.prepare('SELECT failed_login_attempts FROM users WHERE id = ?').get(userId) as any;
  if (!user) return 0;

  const attempts = (user.failed_login_attempts || 0) + 1;
  if (attempts >= LOCKOUT_THRESHOLD) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
    db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?')
      .run(attempts, lockedUntil, userId);
  } else {
    db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(attempts, userId);
  }

  return attempts;
}

export function clearFailedLogins(userId: string): void {
  const db = getDatabase();
  db.prepare("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?").run(userId);
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);

    const db = getDatabase();
    const userDb = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id) as any;
    if (!userDb) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check account lockout
    const lockStatus = isAccountLocked(decoded.id);
    if (lockStatus.locked) {
      return res.status(423).json({
        error: 'Account is temporarily locked due to too many failed login attempts',
        retryAfter: Math.ceil(lockStatus.remainingMs / 1000),
        code: 'ACCOUNT_LOCKED',
      });
    }

    // Validate session token matches (prevents token reuse across sessions)
    if (userDb.session_token && userDb.session_token !== token) {
      return res.status(401).json({ error: 'Session has been replaced', code: 'SESSION_EXPIRED' });
    }

    // Check IP whitelist for this user's endpoint access
    const ip = req.ip || req.socket.remoteAddress || '0.0.0.0';
    if (isWhitelistEnabled() && !isWhitelisted(ip)) {
      return res.status(403).json({ error: 'Access denied from this IP address', code: 'IP_NOT_WHITELISTED' });
    }

    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: userDb.role || decoded.role,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requirePermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const db = getDatabase();
    const userDb = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id) as any;
    const effectiveRole = userDb?.role || req.user.role;

    if (effectiveRole === 'Owner') {
      return next();
    }

    const role = db.prepare('SELECT permissions FROM roles WHERE name = ?').get(effectiveRole) as any;

    if (!role) {
      return res.status(403).json({ error: 'Role not found' });
    }

    let permissions: string[];
    try {
      permissions = JSON.parse(role.permissions);
    } catch {
      permissions = [];
    }
    if (permissions.includes('*') || permissions.includes(permission)) {
      return next();
    }

    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

export function rateLimiter(windowMs = 60000, maxRequests = 100) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let data = requests.get(ip);
    if (!data || now > data.resetTime) {
      data = { count: 0, resetTime: now + windowMs };
      requests.set(ip, data);
    }

    data.count++;
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', (maxRequests - data.count).toString());

    if (data.count > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests, please try again later.',
        retryAfter: Math.ceil((data.resetTime - now) / 1000),
      });
    }

    next();
  };
}

export function auditLog(action: string, details?: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      try {
        const db = getDatabase();
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        db.prepare(
          'INSERT INTO audit_log (action, username, details, ip) VALUES (?, ?, ?, ?)'
        ).run(action, req.user?.username || 'anonymous', details || JSON.stringify({ method: req.method, path: req.path }), ip);
      } catch (e) {
        // ignore
      }
      return originalJson(body);
    };
    next();
  };
}
