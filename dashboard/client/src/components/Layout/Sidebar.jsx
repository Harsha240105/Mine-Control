import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Terminal,
  Settings, Server, LogOut,
  CuboidIcon as Cube
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/logs', icon: Terminal, label: 'Console' }
];

export default function Sidebar() {
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <aside className="w-64 bg-surface-950 border-r border-surface-800 flex flex-col">
      <div className="p-6 border-b border-surface-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-accent-600 rounded-lg flex items-center justify-center shadow-lg shadow-accent-600/20">
            <Cube className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">MCServer</h1>
            <p className="text-xs text-surface-400">Admin Panel</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-accent-600/10 text-accent-400 border border-accent-600/20'
                  : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
        <div className="pt-4 mt-4 border-t border-surface-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-surface-400 hover:text-red-400 hover:bg-surface-800/50 transition-all w-full"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </nav>
    </aside>
  );
}
