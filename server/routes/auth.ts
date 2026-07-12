import { Router } from 'express';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { getDatabase } from '../database';

const router = Router();

function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8));
  }
  return codes;
}

router.get('/lock-status', (_req, res) => {
  const db = getDatabase();
  const row = db.prepare('SELECT totp_enabled FROM app_lock WHERE id = 1').get() as any;
  res.json({ enabled: !!row?.totp_enabled });
});

router.post('/lock/setup', async (_req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: 'MineControl OS',
      issuer: 'MineControl OS',
    });

    const recoveryCodes = generateRecoveryCodes();
    const db = getDatabase();
    db.prepare('INSERT OR REPLACE INTO app_lock (id, totp_secret, totp_enabled, totp_recovery_codes) VALUES (1, ?, 0, ?)')
      .run(secret.base32, JSON.stringify(recoveryCodes));

    let qrCodeDataUrl = '';
    try {
      qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url || '');
    } catch {}

    res.json({
      secret: secret.base32,
      qrCodeDataUrl,
      recoveryCodes,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/lock/verify', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const db = getDatabase();
  const row = db.prepare('SELECT totp_secret, totp_enabled FROM app_lock WHERE id = 1').get() as any;

  if (!row || !row.totp_enabled) {
    return res.json({ success: true, message: 'App lock is not enabled' });
  }

  const valid = speakeasy.totp.verify({
    secret: row.totp_secret,
    encoding: 'base32',
    token,
    window: 1,
  });

  if (!valid) {
    return res.status(401).json({ error: 'Invalid TOTP code' });
  }

  res.json({ success: true });
});

router.post('/lock/verify-recovery', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Recovery code required' });

  const db = getDatabase();
  const row = db.prepare('SELECT totp_recovery_codes, totp_enabled FROM app_lock WHERE id = 1').get() as any;

  if (!row || !row.totp_enabled) {
    return res.json({ success: true, message: 'App lock is not enabled' });
  }

  const codes: string[] = JSON.parse(row.totp_recovery_codes || '[]');
  const idx = codes.indexOf(code.toUpperCase());
  if (idx === -1) {
    return res.status(401).json({ error: 'Invalid recovery code' });
  }

  codes.splice(idx, 1);
  db.prepare('UPDATE app_lock SET totp_recovery_codes = ? WHERE id = 1')
    .run(JSON.stringify(codes));

  res.json({ success: true });
});

router.post('/lock/enable', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const db = getDatabase();
  const row = db.prepare('SELECT totp_secret FROM app_lock WHERE id = 1').get() as any;

  if (!row || !row.totp_secret) {
    return res.status(400).json({ error: 'Run /api/auth/lock/setup first' });
  }

  const valid = speakeasy.totp.verify({
    secret: row.totp_secret,
    encoding: 'base32',
    token,
    window: 1,
  });

  if (!valid) {
    return res.status(400).json({ error: 'Invalid TOTP code' });
  }

  db.prepare('UPDATE app_lock SET totp_enabled = 1 WHERE id = 1').run();
  res.json({ success: true });
});

router.post('/lock/disable', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const db = getDatabase();
  const row = db.prepare('SELECT totp_secret FROM app_lock WHERE id = 1').get() as any;

  if (!row || !row.totp_secret) {
    return res.status(400).json({ error: 'No app lock configured' });
  }

  const valid = speakeasy.totp.verify({
    secret: row.totp_secret,
    encoding: 'base32',
    token,
    window: 1,
  });

  if (!valid) {
    return res.status(400).json({ error: 'Invalid TOTP code' });
  }

  db.prepare("UPDATE app_lock SET totp_enabled = 0, totp_secret = '', totp_recovery_codes = '' WHERE id = 1").run();
  res.json({ success: true });
});

router.get('/lock/recovery-codes', (_req, res) => {
  const db = getDatabase();
  const row = db.prepare('SELECT totp_recovery_codes, totp_enabled FROM app_lock WHERE id = 1').get() as any;

  if (!row || !row.totp_enabled) {
    return res.json({ codes: [] });
  }

  const codes: string[] = JSON.parse(row.totp_recovery_codes || '[]');
  res.json({ codes });
});

export default router;
