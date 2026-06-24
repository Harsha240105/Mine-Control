import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

export function useSocket() {
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const on = useCallback((event, handler) => {
    useEffect(() => {
      const socket = socketRef.current;
      if (!socket) return;
      socket.on(event, handler);
      return () => socket.off(event, handler);
    }, [event, handler]);
  }, []);

  const emit = useCallback((event, data) => {
    const socket = socketRef.current;
    if (socket) socket.emit(event, data);
  }, []);

  return { socketRef, on, emit };
}
