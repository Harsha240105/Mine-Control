import { EventEmitter } from 'events';
import { getActiveServerId, setActiveServerId, clearActiveServerId, getActiveServer } from './db/repository/serverConfigRepository';
import { getServerById, updateServerStatus } from './db/repository/serverRepository';
import type { ActiveServer } from './core/types';

class ActiveServerManager extends EventEmitter {
  private _current: ActiveServer | null = null;

  get current(): ActiveServer | null {
    return this._current;
  }

  load(): ActiveServer | null {
    this._current = getActiveServer();
    return this._current;
  }

  setActive(serverId: string): ActiveServer | null {
    const server = getServerById(serverId);
    if (!server) return null;
    setActiveServerId(serverId);
    this._current = { id: server.id, name: server.name, slug: server.slug, port: server.port, directory: server.directory, status: server.status };
    this.emit('changed', this._current);
    return this._current;
  }

  clear() {
    clearActiveServerId();
    this._current = null;
    this.emit('changed', null);
  }

  updateStatus(status: string) {
    if (this._current) {
      this._current.status = status;
      updateServerStatus(this._current.id, status);
    }
  }

  getConfig() {
    if (!this._current) return null;
    return getServerById(this._current.id) || null;
  }

  getId(): string | null {
    return this._current?.id || getActiveServerId();
  }
}

export const activeServer = new ActiveServerManager();
