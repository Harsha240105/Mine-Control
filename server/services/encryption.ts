import crypto from 'crypto';
import { getDatabase } from '../database';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT = 'minecontrol-os-v1';

function getMachineKey(): Buffer {
  let seed = 'minecontrol-default-seed';
  try {
    const os = require('os');
    const hostname = os.hostname();
    const homedir = os.homedir();
    const platform = os.platform();
    seed = `${hostname}-${homedir}-${platform}`;
  } catch {
    // fallback
  }
  return crypto.scryptSync(seed, SALT, KEY_LENGTH);
}

export function encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
  const key = getMachineKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), authTag };
}

export function decrypt(encrypted: string, ivHex: string, authTagHex: string): string {
  const key = getMachineKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let plaintext = decipher.update(encrypted, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

export function maskValue(value: string, visibleChars = 4): string {
  if (!value || value.length <= visibleChars) return '••••••••';
  const visible = value.slice(-visibleChars);
  return '••••••' + visible;
}

export function storeCredential(key: string, value: string): void {
  const db = getDatabase();
  const { encrypted, iv, authTag } = encrypt(value);
  db.prepare(`
    INSERT OR REPLACE INTO encrypted_credentials (credential_key, encrypted_data, iv, auth_tag, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(key, encrypted, iv, authTag);
  db.prepare(`
    UPDATE credential_metadata SET has_value = 1, last_updated = datetime('now'), source = 'manual'
    WHERE credential_key = ?
  `).run(key);
}

export function getCredential(key: string): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM encrypted_credentials WHERE credential_key = ?').get(key) as any;
  if (!row) return null;
  try {
    return decrypt(row.encrypted_data, row.iv, row.auth_tag);
  } catch {
    return null;
  }
}

export function deleteCredential(key: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM encrypted_credentials WHERE credential_key = ?').run(key);
  db.prepare(`
    UPDATE credential_metadata SET has_value = 0, last_updated = NULL, source = 'manual'
    WHERE credential_key = ?
  `).run(key);
}

export function hasCredential(key: string): boolean {
  const db = getDatabase();
  const row = db.prepare('SELECT has_value FROM credential_metadata WHERE credential_key = ?').get(key) as any;
  return row ? !!row.has_value : false;
}

export function getAllCredentialMetadata(): any[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM credential_metadata ORDER BY display_name').all();
}
