import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Use current origin (Vite proxy in dev, Express in prod both handle /socket.io)

interface UseSocketReturn {
  socket: Socket | null;
  connected: boolean;
  error: string | null;
  emit: (event: string, data?: any) => void;
  on: <T = any>(event: string, handler: (data: T) => void) => () => void;
}

let globalSocket: Socket | null = null;
let globalInitPromise: Promise<void> | null = null;
let globalConnected = false;
let globalError: string | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(fn => fn());
}

function initSocket() {
  if (globalInitPromise) return globalInitPromise;
  const token = localStorage.getItem('mc_token');
  if (!token) return;

  globalInitPromise = new Promise<void>((resolve) => {
    const socket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    socket.on('connect', () => {
      globalConnected = true;
      globalError = null;
      socket.emit('authenticate', token);
      notifyListeners();
    });

    socket.on('disconnect', (reason) => {
      globalConnected = false;
      if (reason !== 'io client disconnect') {
        console.warn(`[Socket] Disconnected: ${reason}`);
      }
      notifyListeners();
    });

    socket.on('connect_error', (err) => {
      globalConnected = false;
      globalError = `Connection failed: ${err.message}`;
      console.error('[Socket] Connection error:', err.message);
      notifyListeners();
    });

    socket.on('authenticated', (data: { success: boolean }) => {
      if (!data.success) {
        console.warn('[Socket] Authentication failed');
      }
    });

    globalSocket = socket;
    resolve();
  });

  return globalInitPromise;
}

export function useSocket(): UseSocketReturn {
  const [, forceUpdate] = useState(0);
  const [connected, setConnected] = useState(globalConnected);
  const [error, setError] = useState<string | null>(globalError);

  useEffect(() => {
    initSocket();

    const onNotify = () => {
      setConnected(globalConnected);
      setError(globalError);
      forceUpdate(n => n + 1);
    };

    listeners.add(onNotify);
    return () => {
      listeners.delete(onNotify);
    };
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    globalSocket?.emit(event, data);
  }, []);

  const on = useCallback(<T = any>(event: string, handler: (data: T) => void): (() => void) => {
    globalSocket?.on(event, handler);
    return () => {
      globalSocket?.off(event, handler);
    };
  }, []);

  return { socket: globalSocket, connected, error, emit, on };
}
