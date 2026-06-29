import { getDatabase } from './database';
import { EventEmitter } from 'events';

export interface ActiveServer {
  id: string;
  name: string;
  slug: string;
  port: number;
  directory: string;
  status: string;
}

class ActiveServerManager extends EventEmitter {
  private _current: ActiveServer | null = null;

  get current(): ActiveServer | null {
    return this._current;
  }

  load(): ActiveServer | null {
    const db = getDatabase();
    const row = db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any;
    if (!row?.value) {
      this._current = null;
      return null;
    }
    const server = db.prepare('SELECT id, name, slug, port, directory, status FROM servers WHERE id = ?').get(row.value) as any;
    if (!server) {
      this._current = null;
      return null;
    }
    this._current = { id: server.id, name: server.name, slug: server.slug, port: server.port, directory: server.directory, status: server.status };
    return this._current;
  }

  setActive(serverId: string): ActiveServer | null {
    const db = getDatabase();
    const server = db.prepare('SELECT id, name, slug, port, directory, status FROM servers WHERE id = ?').get(serverId) as any;
    if (!server) return null;
    db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('active_server_id', ?)").run(serverId);
    this._current = { id: server.id, name: server.name, slug: server.slug, port: server.port, directory: server.directory, status: server.status };
    this.emit('changed', this._current);
    return this._current;
  }

  clear() {
    const db = getDatabase();
    db.prepare("DELETE FROM server_config WHERE key = 'active_server_id'").run();
    this._current = null;
    this.emit('changed', null);
  }

  updateStatus(status: string) {
    if (this._current) {
      this._current.status = status;
      const db = getDatabase();
      db.prepare("UPDATE servers SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, this._current.id);
    }
  }

  getConfig() {
    if (!this._current) return null;
    const db = getDatabase();
    return db.prepare('SELECT * FROM servers WHERE id = ?').get(this._current.id) as any || null;
  }
}

export const activeServer = new ActiveServerManager();
