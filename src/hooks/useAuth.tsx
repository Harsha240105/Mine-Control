import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface AuthContextType {
  lockEnabled: boolean;
  locked: boolean;
  loading: boolean;
  verifyLock: (code: string) => Promise<void>;
  verifyRecovery: (code: string) => Promise<void>;
  setupLock: () => Promise<{ secret: string; qrCodeDataUrl: string; recoveryCodes: string[] }>;
  enableLock: (token: string) => Promise<void>;
  disableLock: (token: string) => Promise<void>;
  getRecoveryCodes: () => Promise<string[]>;
  refreshLockStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [lockEnabled, setLockEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshLockStatus = useCallback(async () => {
    try {
      const status = await api.getLockStatus();
      setLockEnabled(status.enabled);
      if (status.enabled) {
        const token = localStorage.getItem('mc_lock_token');
        if (token) {
          try {
            await api.verifyAppLock(token);
            setLocked(false);
          } catch {
            localStorage.removeItem('mc_lock_token');
            setLocked(true);
          }
        } else {
          setLocked(true);
        }
      } else {
        setLocked(false);
        localStorage.removeItem('mc_lock_token');
      }
    } catch {
      setLocked(false);
    }
  }, []);

  useEffect(() => {
    refreshLockStatus().finally(() => setLoading(false));
  }, [refreshLockStatus]);

  const verifyLock = useCallback(async (code: string) => {
    await api.verifyAppLock(code);
    localStorage.setItem('mc_lock_token', code);
    setLocked(false);
  }, []);

  const verifyRecovery = useCallback(async (code: string) => {
    await api.verifyRecoveryCode(code);
    setLocked(false);
  }, []);

  const setupLock = useCallback(async () => {
    return await api.setupAppLock();
  }, []);

  const enableLock = useCallback(async (token: string) => {
    await api.enableAppLock(token);
    setLockEnabled(true);
  }, []);

  const disableLock = useCallback(async (token: string) => {
    await api.disableAppLock(token);
    setLockEnabled(false);
    localStorage.removeItem('mc_lock_token');
  }, []);

  const getRecoveryCodes = useCallback(async () => {
    const result = await api.getRecoveryCodes();
    return result.codes;
  }, []);

  return (
    <AuthContext.Provider value={{
      lockEnabled,
      locked,
      loading,
      verifyLock,
      verifyRecovery,
      setupLock,
      enableLock,
      disableLock,
      getRecoveryCodes,
      refreshLockStatus,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
