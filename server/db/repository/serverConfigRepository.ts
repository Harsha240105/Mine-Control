import { db } from './baseRepository';
import type { ActiveServer } from '../../core/types';

export function getActiveServerId(): string | null {
  const row = db().prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any;
  return row?.value || null;
}

export function setActiveServerId(serverId: string): void {
  db().prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('active_server_id', ?)").run(serverId);
}

export function clearActiveServerId(): void {
  db().prepare("DELETE FROM server_config WHERE key = 'active_server_id'").run();
}

export function getActiveServer(): ActiveServer | null {
  const id = getActiveServerId();
  if (!id) return null;
  const server = db().prepare('SELECT id, name, slug, port, directory, status FROM servers WHERE id = ?').get(id) as any;
  if (!server) return null;
  return { id: server.id, name: server.name, slug: server.slug, port: server.port, directory: server.directory, status: server.status };
}

export function getConfigValue(key: string): string | null {
  const row = db().prepare("SELECT value FROM server_config WHERE key = ?").get(key) as any;
  return row?.value || null;
}

export function setConfigValue(key: string, value: string): void {
  db().prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)").run(key, value);
}

export function deleteConfigValue(key: string): void {
  db().prepare("DELETE FROM server_config WHERE key = ?").run(key);
}

export function getConfigValues(keys: string[]): Record<string, string | null> {
  const placeholders = keys.map(() => '?').join(',');
  const rows = db().prepare(`SELECT key, value FROM server_config WHERE key IN (${placeholders})`).all(...keys) as any[];
  const result: Record<string, string | null> = {};
  for (const key of keys) result[key] = null;
  for (const row of rows) result[row.key] = row.value;
  return result;
}
