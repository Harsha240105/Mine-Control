import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

const ServerContext = createContext(null);
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function ServerProvider({ children }) {
  const [status, setStatus] = useState({
    running: false,
    tps: -1,
    players: [],
    cpu: 0,
    memory: { used: 0, total: 0, percent: 0 },
    uptime: 0
  });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('subscribe:server');
    });

    socket.on('server:status', (running) => {
      setStatus(prev => ({ ...prev, running }));
    });

    socket.on('server:metrics', (metrics) => {
      setStatus(prev => ({
        ...prev,
        ...metrics
      }));
    });

    socket.on('server:logs', (newLogs) => {
      setLogs(prev => {
        const combined = [...prev, ...newLogs];
        return combined.slice(-500);
      });
    });

    socket.on('server:logs:initial', (initialLogs) => {
      setLogs(initialLogs);
    });

    return () => socket.disconnect();
  }, []);

  const serverAction = useCallback(async (action) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/server/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Action failed');
      return await res.json();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  return (
    <ServerContext.Provider value={{
      status, logs, loading, error,
      setLogs, serverAction, refetch: fetchStatus
    }}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error('useServer must be used within ServerProvider');
  return ctx;
}
