import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../database';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'minecontrol-os-secret-key-2024';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
  file?: Express.Multer.File;
}

export function generateToken(user: { id: string; username: string; role: string }): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): any {
  return jwt.verify(token, JWT_SECRET);
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    // Refresh role from database to keep in sync
    const db = getDatabase();
    const userDb = db.prepare('SELECT role FROM users WHERE id = ?').get(decoded.id) as any;
    req.user = {
      ...decoded,
      role: userDb?.role || decoded.role,
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

    // Look up the user's actual role from the database (not from JWT)
    const db = getDatabase();
    const userDb = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id) as any;
    const effectiveRole = userDb?.role || req.user.role;

    // Owner has all permissions
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
