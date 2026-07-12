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

export async function setupAppLockTOTP(): Promise<TOTPSetupResult> {
  const secret = speakeasy.generateSecret({
    name: APP_NAME,
    issuer: APP_NAME,
  });

  const recoveryCodes = generateRecoveryCodes();

  const db = getDatabase();
  db.prepare('INSERT OR REPLACE INTO app_lock (id, totp_secret, totp_enabled, totp_recovery_codes) VALUES (1, ?, 0, ?)')
    .run(secret.base32, JSON.stringify(recoveryCodes));

  let qrCodeDataUrl = '';
  try {
    qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url || '');
  } catch {}

  return {
    secret: secret.base32,
    otpauth_url: secret.otpauth_url || '',
    qrCodeDataUrl,
    recoveryCodes,
  };
}

export function verifyAppLockTOTP(token: string): boolean {
  const db = getDatabase();
  const row = db.prepare('SELECT totp_secret FROM app_lock WHERE id = 1').get() as any;
  if (!row || !row.totp_secret) return false;

  return speakeasy.totp.verify({
    secret: row.totp_secret,
    encoding: 'base32',
    token,
    window: 1,
  });
}

export function verifyAppLockRecoveryCode(code: string): boolean {
  const db = getDatabase();
  const row = db.prepare('SELECT totp_recovery_codes FROM app_lock WHERE id = 1').get() as any;
  if (!row || !row.totp_recovery_codes) return false;

  const codes: string[] = JSON.parse(row.totp_recovery_codes || '[]');
  const idx = codes.indexOf(code.toUpperCase());
  if (idx === -1) return false;

  codes.splice(idx, 1);
  db.prepare('UPDATE app_lock SET totp_recovery_codes = ? WHERE id = 1')
    .run(JSON.stringify(codes));
  return true;
}

export function isAppLockEnabled(): boolean {
  const db = getDatabase();
  const row = db.prepare('SELECT totp_enabled FROM app_lock WHERE id = 1').get() as any;
  return !!row?.totp_enabled;
}

export function enableAppLock(): void {
  const db = getDatabase();
  db.prepare('UPDATE app_lock SET totp_enabled = 1 WHERE id = 1').run();
}

export function disableAppLock(): void {
  const db = getDatabase();
  db.prepare("UPDATE app_lock SET totp_secret = '', totp_enabled = 0, totp_recovery_codes = '' WHERE id = 1").run();
}
