import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { getDatabase } from '../database';

export interface TOTPSetupResult {
  secret: string;
  otpauth_url: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
}

const APP_NAME = 'MineControl OS';

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8));
  }
  return codes;
}

export function setupTOTP(userId: string, username: string): TOTPSetupResult {
  const secret = speakeasy.generateSecret({
    name: `${APP_NAME}:${username}`,
    issuer: APP_NAME,
  });

  const recoveryCodes = generateRecoveryCodes();

  const db = getDatabase();
  db.prepare('UPDATE users SET totp_secret = ?, totp_recovery_codes = ? WHERE id = ?')
    .run(secret.base32, JSON.stringify(recoveryCodes), userId);

  return {
    secret: secret.base32,
    otpauth_url: secret.otpauth_url || '',
    qrCodeDataUrl: '',
    recoveryCodes,
  };
}

export async function setupTOTPWithQR(userId: string, username: string): Promise<TOTPSetupResult> {
  const result = setupTOTP(userId, username);

  try {
    result.qrCodeDataUrl = await QRCode.toDataURL(result.otpauth_url);
  } catch {
    result.qrCodeDataUrl = '';
  }

  return result;
}

export function verifyTOTP(userId: string, token: string): boolean {
  const db = getDatabase();
  const user = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(userId) as any;
  if (!user || !user.totp_secret) return false;

  return speakeasy.totp.verify({
    secret: user.totp_secret,
    encoding: 'base32',
    token,
    window: 1,
  });
}

export function verifyRecoveryCode(userId: string, code: string): boolean {
  const db = getDatabase();
  const user = db.prepare('SELECT totp_recovery_codes FROM users WHERE id = ?').get(userId) as any;
  if (!user || !user.totp_recovery_codes) return false;

  const codes: string[] = JSON.parse(user.totp_recovery_codes || '[]');
  const idx = codes.indexOf(code.toUpperCase());
  if (idx === -1) return false;

  codes.splice(idx, 1);
  db.prepare('UPDATE users SET totp_recovery_codes = ? WHERE id = ?')
    .run(JSON.stringify(codes), userId);
  return true;
}

export function enableTOTP(userId: string): void {
  const db = getDatabase();
  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(userId);
}

export function disableTOTP(userId: string): void {
  const db = getDatabase();
  db.prepare("UPDATE users SET totp_secret = '', totp_enabled = 0, totp_recovery_codes = '' WHERE id = ?").run(userId);
}

export function isTOTPEnabled(userId: string): boolean {
  const db = getDatabase();
  const user = db.prepare('SELECT totp_enabled FROM users WHERE id = ?').get(userId) as any;
  return !!user?.totp_enabled;
}

export function getTOTPSecret(userId: string): string {
  const db = getDatabase();
  const user = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(userId) as any;
  return user?.totp_secret || '';
}
