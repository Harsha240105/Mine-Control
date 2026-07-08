import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';

export interface IPWhitelistEntry {
  id: string;
  server_id: string;
  ip_address: string;
  description: string;
  created_by: string;
  created_at: string;
}

export function getWhitelist(serverId?: string): IPWhitelistEntry[] {
  const db = getDatabase();
  if (serverId) {
    return db.prepare('SELECT * FROM ip_whitelist WHERE server_id = ? ORDER BY created_at DESC').all(serverId) as IPWhitelistEntry[];
  }
  return db.prepare('SELECT * FROM ip_whitelist ORDER BY created_at DESC').all() as IPWhitelistEntry[];
}

export function addToWhitelist(serverId: string, ipAddress: string, description = '', createdBy = ''): IPWhitelistEntry {
  const db = getDatabase();

  const existing = db.prepare('SELECT * FROM ip_whitelist WHERE server_id = ? AND ip_address = ?').get(serverId, ipAddress) as IPWhitelistEntry;
  if (existing) {
    db.prepare('UPDATE ip_whitelist SET description = ?, created_by = ? WHERE id = ?')
      .run(description || existing.description, createdBy || existing.created_by, existing.id);
    return db.prepare('SELECT * FROM ip_whitelist WHERE id = ?').get(existing.id) as IPWhitelistEntry;
  }

  const id = uuidv4();
  db.prepare('INSERT INTO ip_whitelist (id, server_id, ip_address, description, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(id, serverId, ipAddress, description, createdBy);
  return db.prepare('SELECT * FROM ip_whitelist WHERE id = ?').get(id) as IPWhitelistEntry;
}

export function removeFromWhitelist(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM ip_whitelist WHERE id = ?').run(id);
  return result.changes > 0;
}

export function isWhitelisted(ipAddress: string, serverId?: string): boolean {
  const db = getDatabase();
  if (serverId) {
    const entry = db.prepare('SELECT id FROM ip_whitelist WHERE server_id = ? AND ip_address = ?').get(serverId, ipAddress);
    return !!entry;
  }
  const entry = db.prepare('SELECT id FROM ip_whitelist WHERE ip_address = ?').get(ipAddress);
  return !!entry;
}

export function isWhitelistEnabled(): boolean {
  const db = getDatabase();
  const row = db.prepare("SELECT value FROM server_config WHERE key = 'ip_whitelist_enabled'").get() as any;
  return row?.value === 'true';
}

export function setWhitelistEnabled(enabled: boolean): void {
  const db = getDatabase();
  db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('ip_whitelist_enabled', ?)").run(enabled ? 'true' : 'false');
}
