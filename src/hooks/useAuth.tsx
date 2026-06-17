import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface User {
  id: string;
  username: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isOwner: boolean;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('mc_token');
    if (token) {
      api.me()
        .then((data) => setUser(data))
        .catch(() => {
          localStorage.removeItem('mc_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.login(username, password);
    localStorage.setItem('mc_token', result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    api.logout().catch(() => {});
    localStorage.removeItem('mc_token');
    setUser(null);
  }, []);

  const isOwner = user?.role === 'Owner';

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      if (user.role === 'Owner') return true;
      return true; // Simplified: actual permission check would need role lookup
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isOwner, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
