import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export interface ActiveServer {
  id: string;
  name: string;
  slug: string;
  port: number;
  status: string;
  version?: string;
  version_source?: string;
  maxPlayers?: number;
  directory?: string;
  onlineMode?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface ActiveServerContextType {
  server: ActiveServer | null;
  servers: ActiveServer[];
  loading: boolean;
  refresh: () => Promise<void>;
  selectServer: (id: string) => Promise<void>;
}

const ActiveServerContext = createContext<ActiveServerContextType | null>(null);

export function ActiveServerProvider({ children }: { children: React.ReactNode }) {
  const [server, setServer] = useState<ActiveServer | null>(null);
  const [servers, setServers] = useState<ActiveServer[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getServers();
      setServers(data.servers || []);
      const active = (data.servers || []).find((s: any) => s.id === data.activeServerId);
      setServer(active || null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectServer = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await api.selectServer(id);
      window.location.reload();
    } catch {
      setLoading(false);
    }
  }, []);

  return (
    <ActiveServerContext.Provider value={{ server, servers, loading, refresh, selectServer }}>
      {children}
    </ActiveServerContext.Provider>
  );
}

export function useActiveServer() {
  const context = useContext(ActiveServerContext);
  if (!context) throw new Error('useActiveServer must be used within ActiveServerProvider');
  return context;
}
