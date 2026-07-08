import { db } from './baseRepository';
import type { ServerRow } from '../../core/types';
import { v4 as uuidv4 } from 'uuid';

export function getServerById(id: string): ServerRow | null {
  return db().prepare('SELECT * FROM servers WHERE id = ?').get(id) as any || null;
}

export function getServerBySlug(slug: string): ServerRow | null {
  return db().prepare('SELECT * FROM servers WHERE slug = ?').get(slug) as any || null;
}

export function getAllServers(): ServerRow[] {
  return db().prepare('SELECT * FROM servers ORDER BY created_at ASC').all() as any[];
}

export function createServer(data: Partial<ServerRow> & { name: string; slug: string; directory: string }): ServerRow {
  const id = data.id || uuidv4();
  db().prepare(`
    INSERT INTO servers (id, name, slug, port, directory, version, version_source, javaPath, jarFile, minRam, maxRam, motd, difficulty, gamemode, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped')
  `).run(
    id, data.name, data.slug,
    data.port || 25565,
    data.directory,
    data.version || '',
    data.version_source || '',
    data.javaPath || 'java',
    data.jarFile || 'server.jar',
    data.minRam || '2G',
    data.maxRam || '8G',
    data.motd || '',
    data.difficulty || 'normal',
    data.gamemode || 'survival',
  );
  return getServerById(id)!;
}

export function updateServer(id: string, data: Partial<ServerRow>): void {
  const fields: string[] = [];
  const values: any[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'id') continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db().prepare(`UPDATE servers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteServer(id: string): void {
  db().prepare('DELETE FROM servers WHERE id = ?').run(id);
}

export function updateServerStatus(id: string, status: string): void {
  db().prepare("UPDATE servers SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}
