import React, { useState, useRef, useEffect } from 'react';
import { Bell, X, CheckCheck, Trash2, Info, AlertTriangle, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';
import { useNotifications, Notification } from '../hooks/useNotifications';

const iconMap = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
};

const colorMap = {
  info: 'text-blue-400 bg-blue-500/10',
  success: 'text-green-400 bg-green-500/10',
  warning: 'text-yellow-400 bg-yellow-500/10',
  error: 'text-red-400 bg-red-500/10',
};

const bgMap = {
  info: 'hover:bg-blue-500/5',
  success: 'hover:bg-green-500/5',
  warning: 'hover:bg-yellow-500/5',
  error: 'hover:bg-red-500/5',
};

export default function NotificationPanel() {
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 text-gray-400 hover:text-gray-200 hover:bg-surface-800 rounded-lg transition-colors relative"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-minecraft-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-surface-900 border border-surface-700 rounded-xl shadow-2xl shadow-black/50 z-50 animate-slide-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
            <h3 className="text-sm font-medium text-gray-200">Notifications</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="p-1 text-gray-400 hover:text-gray-200 hover:bg-surface-800 rounded text-xs flex items-center gap-1" title="Mark all read">
                  <CheckCheck size={14} /> All read
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearAll} className="p-1 text-gray-400 hover:text-red-400 hover:bg-surface-800 rounded" title="Clear all">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} onRead={markRead} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({ notification: n, onRead }: { notification: Notification; onRead: (id: string) => void }) {
  const Icon = iconMap[n.type];
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 border-b border-surface-800/50 cursor-pointer transition-colors ${bgMap[n.type]} ${n.read ? 'opacity-60' : ''}`}
      onClick={() => onRead(n.id)}
    >
      <div className={`p-1.5 rounded-lg mt-0.5 ${colorMap[n.type]}`}>
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-200">{n.title}</p>
        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
        <p className="text-[10px] text-gray-600 mt-1">
          {formatTimeAgo(n.timestamp)}
        </p>
      </div>
      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-minecraft-500 mt-2 flex-shrink-0" />}
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
