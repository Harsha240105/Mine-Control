import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from './useSocket';
import toast from 'react-hot-toast';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { socket } = useSocket();
  const maxNotifications = 50;

  const addNotification = useCallback((n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const notif: Notification = {
      ...n,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      read: false,
    };
    setNotifications((prev) => [notif, ...prev].slice(0, maxNotifications));
    setUnreadCount((prev) => prev + 1);
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onPlayerJoin = (username: string) => {
      const n = { type: 'info' as const, title: 'Player Joined', message: `${username} joined the game` };
      toast.success(`${username} joined`, { duration: 3000 });
      addNotification(n);
    };

    const onPlayerLeave = (username: string) => {
      const n = { type: 'info' as const, title: 'Player Left', message: `${username} left the game` };
      toast(`${username} left`, { icon: '👋', duration: 3000 });
      addNotification(n);
    };

    const onPlayerChat = (username: string, message: string) => {
      if (message.startsWith('!') || message.startsWith('/')) return;
      addNotification({ type: 'info', title: `Chat: ${username}`, message: message.length > 60 ? message.slice(0, 60) + '...' : message });
    };

    const onServerStarted = () => {
      toast.success('Server started', { duration: 5000 });
      addNotification({ type: 'success', title: 'Server Started', message: 'Minecraft server is now online' });
    };

    const onServerStopped = (code: number | null) => {
      toast(`Server stopped (code: ${code})`, { icon: '⏹️', duration: 5000 });
      addNotification({ type: 'warning', title: 'Server Stopped', message: `Server stopped with code ${code}` });
    };

    const onServerCrashed = (error: string) => {
      toast.error('Server crashed!', { duration: 8000 });
      addNotification({ type: 'error', title: 'Server Crashed', message: error.slice(0, 100) });
    };

    const onServerError = (error: string) => {
      toast.error(error.length > 80 ? error.slice(0, 80) + '...' : error, { duration: 10000 });
      addNotification({ type: 'error', title: 'Server Error', message: error.slice(0, 200) });
    };

    socket.on('player:join', onPlayerJoin);
    socket.on('player:leave', onPlayerLeave);
    socket.on('player:chat', onPlayerChat);
    socket.on('server:started', onServerStarted);
    socket.on('server:stopped', onServerStopped);
    socket.on('server:crashed', onServerCrashed);
    socket.on('server:error', onServerError);

    return () => {
      socket.off('player:join', onPlayerJoin);
      socket.off('player:leave', onPlayerLeave);
      socket.off('player:chat', onPlayerChat);
      socket.off('server:started', onServerStarted);
      socket.off('server:stopped', onServerStopped);
      socket.off('server:crashed', onServerCrashed);
      socket.off('server:error', onServerError);
    };
  }, [socket, addNotification]);

  return { notifications, unreadCount, addNotification, markAllRead, markRead, clearAll };
}
