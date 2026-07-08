import crypto from 'crypto';
import { getDatabase } from '../database';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

const CURRENT_KEY_VERSION = 1;

function getMachineSeed(): string {
  try {
    const os = require('os');
    return `${os.hostname()}-${os.homedir()}-${os.platform()}`;
  } catch {
    return 'minecontrol-default-seed';
  }
}

function getMachineSalt(): string {
  const db = getDatabase();
  const row = db.prepare("SELECT value FROM server_config WHERE key = 'encryption_machine_salt'").get() as any;
  if (row?.value) return row.value;
  const salt = crypto.randomBytes(16).toString('hex');
  try {
    db.prepare("INSERT OR IGNORE INTO server_config (key, value) VALUES ('encryption_machine_salt', ?)").run(salt);
  } catch {}
  return salt;
}

function getPassphraseSaltKey(): string {
  return 'encryption_passphrase_salt';
}

function getPassphraseVerifierKey(): string {
  return 'encryption_passphrase_verifier';
}

function deriveMachineKey(): Buffer {
  return crypto.scryptSync(getMachineSeed(), getMachineSalt(), KEY_LENGTH);
}

function derivePassphraseKey(passphrase: string): Buffer {
  const db = getDatabase();
  const saltKey = getPassphraseSaltKey();
  const row = db.prepare("SELECT value FROM server_config WHERE key = ?").get(saltKey) as any;
  if (!row?.value) throw new Error('Passphrase salt not found. Set a passphrase first.');
  return crypto.scryptSync(passphrase, row.value, KEY_LENGTH);
}

function deriveCredentialKey(masterKey: Buffer, credentialSalt: string): Buffer {
  return crypto.createHmac('sha256', masterKey).update(credentialSalt + ':mc-v1').digest();
}

function getMasterKey(): Buffer {
  const db = getDatabase();
  const verifierKey = getPassphraseVerifierKey();
  const hasPassphrase = db.prepare("SELECT COUNT(*) as c FROM server_config WHERE key = ?").get(verifierKey) as any;
  if (hasPassphrase.c > 0) {
    const cached = (global as any).__mcPassphraseKey;
    if (cached) return Buffer.from(cached);
    if (process.env.MC_PASSPHRASE) {
      try {
        return derivePassphraseKey(process.env.MC_PASSPHRASE);
      } catch {}
    }
  }
  return deriveMachineKey();
}

export function setPassphraseInMemory(passphrase: string): boolean {
  if (!verifyPassphrase(passphrase)) return false;
  const db = getDatabase();
  const passphraseSalt = db.prepare("SELECT value FROM server_config WHERE key = ?").get(getPassphraseSaltKey()) as any;
  if (!passphraseSalt?.value) return false;
  (global as any).__mcPassphraseKey = derivePassphraseKey(passphrase);
  return true;
}

function getActiveMasterKey(): Buffer {
  const cached = (global as any).__mcPassphraseKey;
  if (cached) return Buffer.from(cached);
  return deriveMachineKey();
}

function deriveOldMachineKey(): Buffer {
  return crypto.scryptSync(getMachineSeed(), 'minecontrol-os-v1', KEY_LENGTH);
}

export function encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string; salt: string; keyVersion: number } {
  const masterKey = getActiveMasterKey();
  const salt = crypto.randomBytes(16).toString('hex');
  const key = deriveCredentialKey(masterKey, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), authTag, salt, keyVersion: CURRENT_KEY_VERSION };
}

export function decrypt(encrypted: string, ivHex: string, authTagHex: string, salt?: string, keyVersion?: number): string {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  if (!keyVersion || keyVersion < 1) {
    const key = deriveOldMachineKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let plaintext = decipher.update(encrypted, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  }

  const credentialSalt = salt || '';
  // Try active master key first
  try {
    const masterKey = getActiveMasterKey();
    const key = deriveCredentialKey(masterKey, credentialSalt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let plaintext = decipher.update(encrypted, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  } catch {}
  // Fall back to machine key (covers passphrase-not-in-memory case)
  try {
    const key = deriveCredentialKey(deriveMachineKey(), credentialSalt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let plaintext = decipher.update(encrypted, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  } catch {
    throw new Error('Failed to decrypt credential: no matching key available');
  }
}

export function decryptWithPassphrase(encrypted: string, ivHex: string, authTagHex: string, passphrase: string, salt?: string, keyVersion?: number): string {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  let key: Buffer;

  if (!keyVersion || keyVersion < 1) {
    key = deriveOldMachineKey();
  } else {
    const passphraseKey = derivePassphraseKey(passphrase);
    const credentialSalt = salt || '';
    key = deriveCredentialKey(passphraseKey, credentialSalt);
  }

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
  const { encrypted, iv, authTag, salt, keyVersion } = encrypt(value);
  db.prepare(`
    INSERT OR REPLACE INTO encrypted_credentials (credential_key, encrypted_data, iv, auth_tag, salt, key_version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(key, encrypted, iv, authTag, salt, keyVersion);
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
    return decrypt(row.encrypted_data, row.iv, row.auth_tag, row.salt, row.key_version);
  } catch {
    return null;
  }
}

export function getCredentialWithPassphrase(key: string, passphrase: string): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM encrypted_credentials WHERE credential_key = ?').get(key) as any;
  if (!row) return null;
  try {
    return decryptWithPassphrase(row.encrypted_data, row.iv, row.auth_tag, passphrase, row.salt, row.key_version);
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

export function getPassphraseStatus(): { hasPassphrase: boolean } {
  const db = getDatabase();
  const verifierKey = getPassphraseVerifierKey();
  const row = db.prepare("SELECT COUNT(*) as c FROM server_config WHERE key = ?").get(verifierKey) as any;
  return { hasPassphrase: (row?.c || 0) > 0 };
}

export function setPassphrase(passphrase: string): void {
  const db = getDatabase();

  const passphraseSalt = crypto.randomBytes(16).toString('hex');
  const passphraseKey = crypto.scryptSync(passphrase, passphraseSalt, KEY_LENGTH);

  // Create verifier: encrypt a known token with the passphrase key
  const testToken = crypto.randomBytes(32).toString('hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, passphraseKey, iv);
  let encrypted = cipher.update(testToken, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  const verifier = JSON.stringify({ encrypted, iv: iv.toString('hex'), authTag, testToken });

  // Re-encrypt all existing v1 credentials with the new passphrase key
  const existing = db.prepare("SELECT credential_key, encrypted_data, iv, auth_tag, salt, key_version FROM encrypted_credentials WHERE key_version >= 1 AND salt != ''").all() as any[];
  const machineKey = deriveMachineKey();
  for (const cred of existing) {
    try {
      const oldMasterKey = deriveMachineKey();
      const oldCredKey = deriveCredentialKey(oldMasterKey, cred.salt);
      const oldIv = Buffer.from(cred.iv, 'hex');
      const oldAuthTag = Buffer.from(cred.auth_tag, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, oldCredKey, oldIv);
      decipher.setAuthTag(oldAuthTag);
      let plaintext = decipher.update(cred.encrypted_data, 'hex', 'utf8');
      plaintext += decipher.final('utf8');

      const newSalt = crypto.randomBytes(16).toString('hex');
      const newCredKey = deriveCredentialKey(passphraseKey, newSalt);
      const newIv = crypto.randomBytes(IV_LENGTH);
      const cipher2 = crypto.createCipheriv(ALGORITHM, newCredKey, newIv);
      let newEnc = cipher2.update(plaintext, 'utf8', 'hex');
      newEnc += cipher2.final('hex');
      const newTag = cipher2.getAuthTag().toString('hex');

      db.prepare("UPDATE encrypted_credentials SET encrypted_data = ?, iv = ?, auth_tag = ?, salt = ?, updated_at = datetime('now') WHERE credential_key = ?")
        .run(newEnc, newIv.toString('hex'), newTag, newSalt, cred.credential_key);
    } catch {}
  }

  db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)").run(getPassphraseSaltKey(), passphraseSalt);
  db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)").run(getPassphraseVerifierKey(), verifier);
}

export function clearPassphrase(oldPassphrase?: string): void {
  const db = getDatabase();

  // Re-encrypt all v1 credentials back to machine key
  const existing = db.prepare("SELECT credential_key, encrypted_data, iv, auth_tag, salt, key_version FROM encrypted_credentials WHERE key_version >= 1 AND salt != ''").all() as any[];
  const machineKey = deriveMachineKey();
  for (const cred of existing) {
    try {
      let plaintext: string;
      if (oldPassphrase) {
        const passphraseSalt = db.prepare("SELECT value FROM server_config WHERE key = ?").get(getPassphraseSaltKey()) as any;
        if (passphraseSalt?.value) {
          const oldKey = crypto.scryptSync(oldPassphrase, passphraseSalt.value, KEY_LENGTH);
          const oldCredKey = deriveCredentialKey(oldKey, cred.salt);
          const oldIv = Buffer.from(cred.iv, 'hex');
          const oldAuthTag = Buffer.from(cred.auth_tag, 'hex');
          const decipher = crypto.createDecipheriv(ALGORITHM, oldCredKey, oldIv);
          decipher.setAuthTag(oldAuthTag);
          plaintext = decipher.update(cred.encrypted_data, 'hex', 'utf8');
          plaintext += decipher.final('utf8');
        } else {
          plaintext = decrypt(cred.encrypted_data, cred.iv, cred.auth_tag, cred.salt, cred.key_version);
        }
      } else if ((global as any).__mcPassphraseKey) {
        plaintext = decrypt(cred.encrypted_data, cred.iv, cred.auth_tag, cred.salt, cred.key_version);
      } else {
        continue;
      }

      const newSalt = crypto.randomBytes(16).toString('hex');
      const newCredKey = deriveCredentialKey(machineKey, newSalt);
      const newIv = crypto.randomBytes(IV_LENGTH);
      const cipher2 = crypto.createCipheriv(ALGORITHM, newCredKey, newIv);
      let newEnc = cipher2.update(plaintext, 'utf8', 'hex');
      newEnc += cipher2.final('hex');
      const newTag = cipher2.getAuthTag().toString('hex');

      db.prepare("UPDATE encrypted_credentials SET encrypted_data = ?, iv = ?, auth_tag = ?, salt = ?, updated_at = datetime('now') WHERE credential_key = ?")
        .run(newEnc, newIv.toString('hex'), newTag, newSalt, cred.credential_key);
    } catch {}
  }

  db.prepare("DELETE FROM server_config WHERE key = ?").run(getPassphraseSaltKey());
  db.prepare("DELETE FROM server_config WHERE key = ?").run(getPassphraseVerifierKey());
  delete (global as any).__mcPassphraseKey;
}

export function verifyPassphrase(passphrase: string): boolean {
  const db = getDatabase();
  const verifierKey = getPassphraseVerifierKey();
  const row = db.prepare("SELECT value FROM server_config WHERE key = ?").get(verifierKey) as any;
  if (!row?.value) return false;

  try {
    const { encrypted, iv, authTag, testToken } = JSON.parse(row.value);
    const passphraseSalt = db.prepare("SELECT value FROM server_config WHERE key = ?").get(getPassphraseSaltKey()) as any;
    if (!passphraseSalt?.value) return false;

    const passphraseKey = crypto.scryptSync(passphrase, passphraseSalt.value, KEY_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, passphraseKey, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted === testToken;
  } catch {
    return false;
  }
}
