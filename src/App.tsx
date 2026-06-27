import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Welcome from './pages/Welcome';
import Wizard from './pages/Wizard';
import Software from './pages/Software';
import Dashboard from './pages/Dashboard';
import Players from './pages/Players';
import Console from './pages/Console';
import Worlds from './pages/Worlds';
import Plugins from './pages/Plugins';
import Settings from './pages/Settings';
import Backups from './pages/Backups';
import { Scheduler } from './pages/Scheduler';
import Connection from './pages/Connection';
import MapView from './pages/MapView';
import Diagnostics from './pages/Diagnostics';
import Guide from './pages/Guide';
import GitHub from './pages/GitHub';
import Servers from './pages/Servers';
import Compatibility from './pages/Compatibility';
import Import from './pages/Import';
import Discord from './pages/Discord';
import Feedback from './pages/Feedback';
import Privacy from './pages/Privacy';
import AutoUpdater from './components/AutoUpdater';

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
              borderRadius: '12px',
            },
          }}
        />
        <AutoUpdater />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/wizard"
            element={
              <ProtectedRoute>
                <Wizard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/import"
            element={
              <ProtectedRoute>
                <Import />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Servers />} />
            <Route path="servers" element={<Servers />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="software" element={<Software />} />
            <Route path="players" element={<Players />} />
            <Route path="console" element={<Console />} />
            <Route path="worlds" element={<Worlds />} />
            <Route path="plugins" element={<Plugins />} />
            <Route path="backups" element={<Backups />} />
            <Route path="scheduler" element={<Scheduler />} />
            <Route path="connection" element={<Connection />} />
            <Route path="compatibility" element={<Compatibility />} />
            <Route path="discord" element={<Discord />} />
            <Route path="feedback" element={<Feedback />} />
            <Route path="map" element={<MapView />} />
            <Route path="diagnostics" element={<Diagnostics />} />
            <Route path="guide" element={<Guide />} />
            <Route path="github" element={<GitHub />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

function WelcomeWrapper() {
  const wizardComplete = localStorage.getItem('mc_wizard_complete') === 'true';
  const hasServers = (() => {
    try {
      const s = localStorage.getItem('mc_servers');
      return s && JSON.parse(s).length > 0;
    } catch { return false; }
  })();

  if (wizardComplete || hasServers) {
    return <Navigate to="/servers" replace />;
  }
  return <Welcome />;
}
