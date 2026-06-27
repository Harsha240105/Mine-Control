import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Use current origin (Vite proxy in dev, Express in prod both handle /socket.io)

interface UseSocketReturn {
  socket: Socket | null;
  connected: boolean;
  error: string | null;
  emit: (event: string, data?: any) => void;
  on: <T = any>(event: string, handler: (data: T) => void) => () => void;
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('mc_token');
    if (!token) return;

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
      setConnected(true);
      setError(null);
      socket.emit('authenticate', token);
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      if (reason !== 'io client disconnect') {
        console.warn(`[Socket] Disconnected: ${reason}`);
      }
    });

    socket.on('connect_error', (err) => {
      setConnected(false);
      setError(`Connection failed: ${err.message}`);
      console.error('[Socket] Connection error:', err.message);
    });

    socket.on('authenticated', (data: { success: boolean }) => {
      if (!data.success) {
        console.warn('[Socket] Authentication failed');
      }
    });

    socketRef.current = socket;
    setSocketInstance(socket);

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
    };
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback(<T = any>(event: string, handler: (data: T) => void): (() => void) => {
    socketRef.current?.on(event, handler);
    return () => {
      socketRef.current?.off(event, handler);
    };
  }, []);

  return { socket: socketInstance, connected, error, emit, on };
}
