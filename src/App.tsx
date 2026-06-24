import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Players from './pages/Players';
import Console from './pages/Console';
import Worlds from './pages/Worlds';
import Plugins from './pages/Plugins';
import Settings from './pages/Settings';
import Backups from './pages/Backups';
import Connection from './pages/Connection';
import MapView from './pages/MapView';
import Diagnostics from './pages/Diagnostics';
import Guide from './pages/Guide';
import GitHub from './pages/GitHub';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400 text-sm">Loading MineControl OS...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid #334155',
            },
          }}
        />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="players" element={<Players />} />
            <Route path="console" element={<Console />} />
            <Route path="worlds" element={<Worlds />} />
            <Route path="plugins" element={<Plugins />} />
            <Route path="backups" element={<Backups />} />
            <Route path="connection" element={<Connection />} />
            <Route path="map" element={<MapView />} />
            <Route path="diagnostics" element={<Diagnostics />} />
            <Route path="guide" element={<Guide />} />
            <Route path="github" element={<GitHub />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
