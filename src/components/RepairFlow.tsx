import React from 'react';
import { AlertTriangle, Wrench, Settings, RefreshCw, Download, FileArchive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface RepairFlowProps {
  error: string;
  onDismiss: () => void;
}

export default function RepairFlow({ error, onDismiss }: RepairFlowProps) {
  const navigate = useNavigate();

  const isJavaError = error.toLowerCase().includes('java');
  const isJarError = error.toLowerCase().includes('jar');
  const isPortError = error.toLowerCase().includes('port') && error.toLowerCase().includes('in use');
  const isEulaError = error.toLowerCase().includes('eula');

  return (
    <div className="flex-1 flex items-center justify-center p-6 animate-fade-in">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/10 mb-4">
            <AlertTriangle size={32} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-100 mb-2">Startup Validation Failed</h1>
          <p className="text-gray-400">
            MineControl prevented the server from starting because critical validation checks failed.
            Follow the steps below to repair the configuration.
          </p>
        </div>

        <div className="card border border-red-500/20 bg-gray-900/50 mb-8 p-6">
          <h2 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Wrench size={16} /> Diagnostic Report
          </h2>
          <div className="bg-black/50 rounded-lg p-4 font-mono text-sm text-red-300 whitespace-pre-wrap overflow-x-auto border border-red-500/10">
            {error}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isJavaError && (
            <div className="card hover-card cursor-pointer" onClick={() => navigate('/settings')}>
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
                  <Settings size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-200">Configure Java Path</h3>
                  <p className="text-sm text-gray-400 mt-1">Open Settings to set the correct path to your Java 21+ installation.</p>
                </div>
              </div>
            </div>
          )}

          {isJarError && (
            <div className="card hover-card cursor-pointer" onClick={() => navigate('/software')}>
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-orange-500/10 text-orange-400">
                  <Download size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-200">Download Server Software</h3>
                  <p className="text-sm text-gray-400 mt-1">Open the Software catalog to download a valid server.jar file.</p>
                </div>
              </div>
            </div>
          )}

          {isPortError && (
            <div className="card hover-card cursor-pointer" onClick={() => navigate('/settings')}>
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
                  <RefreshCw size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-200">Change Server Port</h3>
                  <p className="text-sm text-gray-400 mt-1">Another app is using your port. Open Settings to change it.</p>
                </div>
              </div>
            </div>
          )}

          {isEulaError && (
            <div className="card hover-card cursor-pointer" onClick={() => navigate('/console')}>
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-green-500/10 text-green-400">
                  <FileArchive size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-200">Accept EULA</h3>
                  <p className="text-sm text-gray-400 mt-1">Navigate to the console or files to accept the Minecraft EULA.</p>
                </div>
              </div>
            </div>
          )}

          <div className="card hover-card cursor-pointer md:col-span-2 flex items-center justify-center py-6 border-dashed border-gray-700 bg-transparent hover:bg-gray-800/50" onClick={onDismiss}>
            <span className="text-gray-400 font-medium hover:text-gray-200 transition-colors">Dismiss & Return to Dashboard</span>
          </div>
        </div>
      </div>
    </div>
  );
}
