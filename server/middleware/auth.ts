import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../database';
import speakeasy from 'speakeasy';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const db = getDatabase();
  const lockRow = db.prepare('SELECT totp_enabled FROM app_lock WHERE id = 1').get() as any;

  if (!lockRow || !lockRow.totp_enabled) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'App is locked. Provide a valid TOTP code.' });
  }

  const token = authHeader.split(' ')[1];
  const lockData = db.prepare('SELECT totp_secret FROM app_lock WHERE id = 1').get() as any;

  if (!lockData || !lockData.totp_secret) {
    return next();
  }

  const valid = speakeasy.totp.verify({
    secret: lockData.totp_secret,
    encoding: 'base32',
    token,
    window: 1,
  });

  if (!valid) {
    return res.status(401).json({ error: 'Invalid TOTP code' });
  }

  next();
}

export function requirePermission(_permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const db = getDatabase();
    const lockRow = db.prepare('SELECT totp_enabled FROM app_lock WHERE id = 1').get() as any;

    if (!lockRow || !lockRow.totp_enabled) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'App is locked. Provide a valid TOTP code.' });
    }

    const token = authHeader.split(' ')[1];
    const lockData = db.prepare('SELECT totp_secret FROM app_lock WHERE id = 1').get() as any;

    if (!lockData || !lockData.totp_secret) {
      return next();
    }

    const valid = speakeasy.totp.verify({
      secret: lockData.totp_secret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!valid) {
      return res.status(401).json({ error: 'Invalid TOTP code' });
    }

    next();
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
