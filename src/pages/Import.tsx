import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, ArrowLeft, ArrowRight, FolderOpen, FileArchive, Check, CheckCircle,
  AlertCircle, Loader2, Play, HardDrive, Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

const STEPS = ['Select Source', 'Analysis', 'Configuration', 'Import'];

export default function Import() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [supportedFormats, setSupportedFormats] = useState<any[]>([]);

  // Import State
  const [sourceType, setSourceType] = useState<'zip' | 'folder' | null>(null);
  const [sourcePath, setSourcePath] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  
  // Config State
  const [serverName, setServerName] = useState('');
  
  // Execution State
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState('');
  const [importError, setImportError] = useState('');
  const [importedServer, setImportedServer] = useState<any>(null);

  useEffect(() => {
    api.getSupportedFormats().then(res => {
      if (res.formats) setSupportedFormats(res.formats);
    }).catch(() => {});
  }, []);

  const handleSelectSource = async (type: 'zip' | 'folder') => {
    setSourceType(type);
    try {
      if (!window.electronAPI) {
        toast.error('File selection is only available in the desktop app.');
        return;
      }
      
      let selectedPath = '';
      if (type === 'zip') {
        const result = await window.electronAPI.selectFile([
          { name: 'Archives', extensions: ['zip', 'rar', '7z', 'tar', 'gz'] }
        ]);
        if (result && result.length > 0) selectedPath = result[0];
      } else {
        const result = await window.electronAPI.selectDirectory();
        if (result && result.length > 0) selectedPath = result[0];
      }

      if (selectedPath) {
        setSourcePath(selectedPath);
        setStep(1); // Move to analysis
        analyzeSource(selectedPath);
      } else {
        setSourceType(null); // Cancelled
      }
    } catch (err: any) {
      toast.error('Failed to select source: ' + err.message);
      setSourceType(null);
    }
  };

  const analyzeSource = async (path: string) => {
    setAnalyzing(true);
    try {
      const res = await api.importAnalyze(path);
      setAnalysisResult(res.detection);
      setServerName(res.detection.name || 'Imported Server');
    } catch (err: any) {
      toast.error(err.message || 'Analysis failed');
      setStep(0); // Go back on error
    } finally {
      setAnalyzing(false);
    }
  };

  const executeImport = async () => {
    setImporting(true);
    setStep(3); // Import progress step
    
    // Simulate progress while waiting for API
    const progressInterval = setInterval(() => {
      setImportProgress(p => {
        if (p < 90) return p + Math.random() * 5;
        return p;
      });
    }, 500);

    setImportStatus('Extracting and analyzing files...');

    try {
      const result = await api.importExecute(sourcePath, { name: serverName });
      clearInterval(progressInterval);
      setImportProgress(100);
      setImportStatus('Import complete!');
      setImportedServer(result.server);
    } catch (err: any) {
      clearInterval(progressInterval);
      setImportError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const renderStepIndicators = () => (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((s, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${
                i === step
                  ? 'bg-minecraft-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.5)]'
                  : i < step
                  ? 'bg-minecraft-500/20 text-minecraft-400'
                  : 'bg-surface-800 text-gray-500'
              }`}
            >
              {i < step ? <Check size={20} /> : i + 1}
            </div>
            <span className={`text-xs mt-2 ${i === step ? 'text-gray-200' : 'text-gray-500'}`}>{s}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-16 h-1 mx-2 rounded-full ${i < step ? 'bg-minecraft-500/50' : 'bg-surface-800'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col relative overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-surface-800 bg-surface-900/50 flex items-center px-6 sticky top-0 z-10 backdrop-blur-md">
        <button
          onClick={() => navigate('/')}
          className="mr-4 p-2 rounded-lg hover:bg-surface-800 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-minecraft-600/20 flex items-center justify-center">
            <Download size={18} className="text-minecraft-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-100">Import Server</h1>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 pb-24 z-10">
        <div className="w-full max-w-3xl">
          {renderStepIndicators()}

          <div className="bg-surface-900/50 border border-surface-800 rounded-2xl p-8 backdrop-blur-md shadow-2xl relative overflow-hidden">
            
            {/* STEP 0: Select Source */}
            {step === 0 && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <h2 className="text-2xl font-bold mb-2">Choose Import Source</h2>
                <p className="text-gray-400 mb-8">Select where you want to import your Minecraft server from. We support ZIP archives and uncompressed folders.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => handleSelectSource('zip')}
                    className="flex flex-col items-center gap-4 p-8 rounded-xl bg-surface-800 border border-surface-700 hover:border-minecraft-500/50 hover:bg-surface-800/80 transition-all duration-200 group"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FileArchive size={32} className="text-blue-400" />
                    </div>
                    <div className="text-center">
                      <h3 className="font-bold text-lg mb-1">ZIP Archive</h3>
                      <p className="text-sm text-gray-400">Import from a .zip, .rar, or .7z file containing your server files.</p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleSelectSource('folder')}
                    className="flex flex-col items-center gap-4 p-8 rounded-xl bg-surface-800 border border-surface-700 hover:border-minecraft-500/50 hover:bg-surface-800/80 transition-all duration-200 group"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FolderOpen size={32} className="text-yellow-400" />
                    </div>
                    <div className="text-center">
                      <h3 className="font-bold text-lg mb-1">Server Folder</h3>
                      <p className="text-sm text-gray-400">Import from an uncompressed directory on your computer.</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 1: Analysis */}
            {step === 1 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 flex flex-col items-center justify-center py-12">
                {analyzing ? (
                  <>
                    <Loader2 size={48} className="text-minecraft-400 animate-spin mb-6" />
                    <h2 className="text-xl font-bold mb-2">Analyzing Server Files...</h2>
                    <p className="text-gray-400">Scanning {sourcePath} for configurations, plugins, and worlds.</p>
                  </>
                ) : analysisResult ? (
                  <div className="w-full">
                    <h2 className="text-xl font-bold mb-6 text-center">Analysis Complete</h2>
                    <div className="grid grid-cols-2 gap-4 mb-8">
                      <div className="bg-surface-800 rounded-lg p-4">
                        <p className="text-sm text-gray-400 mb-1">Software Detected</p>
                        <p className="font-semibold">{analysisResult.software || 'Unknown'}</p>
                      </div>
                      <div className="bg-surface-800 rounded-lg p-4">
                        <p className="text-sm text-gray-400 mb-1">Version</p>
                        <p className="font-semibold">{analysisResult.version || 'Unknown'}</p>
                      </div>
                      <div className="bg-surface-800 rounded-lg p-4">
                        <p className="text-sm text-gray-400 mb-1">Plugins Found</p>
                        <p className="font-semibold">{analysisResult.plugins?.length || 0}</p>
                      </div>
                      <div className="bg-surface-800 rounded-lg p-4">
                        <p className="text-sm text-gray-400 mb-1">Worlds Found</p>
                        <p className="font-semibold">{analysisResult.worlds?.length || 0}</p>
                      </div>
                    </div>
                    
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setStep(0)} className="px-6 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-white font-medium transition-colors">
                        Back
                      </button>
                      <button onClick={() => setStep(2)} className="px-6 py-2 rounded-lg bg-minecraft-600 hover:bg-minecraft-500 text-white font-medium transition-colors">
                        Continue
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* STEP 2: Configuration */}
            {step === 2 && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <h2 className="text-2xl font-bold mb-6">Server Configuration</h2>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Server Name</label>
                    <input
                      type="text"
                      value={serverName}
                      onChange={e => setServerName(e.target.value)}
                      className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 focus:outline-none focus:border-minecraft-500 transition-colors"
                      placeholder="My Imported Server"
                    />
                  </div>
                  
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
                    <AlertCircle className="text-blue-400 shrink-0 mt-0.5" size={20} />
                    <div className="text-sm text-blue-200">
                      <p className="font-medium mb-1">Import Information</p>
                      <p className="opacity-80">
                        The original files will not be modified. A copy will be made in the MineControl OS data directory. Make sure you have enough disk space.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex justify-between">
                  <button onClick={() => setStep(1)} className="px-6 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-white font-medium transition-colors">
                    Back
                  </button>
                  <button onClick={executeImport} className="px-6 py-2 rounded-lg bg-minecraft-600 hover:bg-minecraft-500 text-white font-medium flex items-center gap-2 transition-colors">
                    Start Import <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Import Progress / Complete */}
            {step === 3 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 flex flex-col items-center justify-center py-8 text-center">
                {importing && !importError && (
                  <>
                    <div className="relative w-24 h-24 mb-6">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="48" cy="48" r="44" className="stroke-surface-700 stroke-[8] fill-none" />
                        <circle
                          cx="48" cy="48" r="44"
                          className="stroke-minecraft-500 stroke-[8] fill-none transition-all duration-300"
                          strokeDasharray={276}
                          strokeDashoffset={276 - (276 * importProgress) / 100}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center text-lg font-bold">
                        {Math.round(importProgress)}%
                      </div>
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Importing Server...</h2>
                    <p className="text-gray-400">{importStatus}</p>
                  </>
                )}

                {!importing && !importError && (
                  <>
                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6 glow">
                      <CheckCircle size={40} className="text-green-400" />
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-3">Import Complete!</h2>
                    <p className="text-gray-400 mb-8">Your server "{serverName}" has been successfully imported and is ready to use.</p>
                    
                    <button
                      onClick={() => navigate('/dashboard')}
                      className="px-8 py-3 rounded-xl bg-minecraft-600 hover:bg-minecraft-500 text-white font-bold text-lg flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95"
                    >
                      <Play size={20} /> Go to Dashboard
                    </button>
                  </>
                )}

                {importError && (
                  <>
                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
                      <AlertCircle size={40} className="text-red-400" />
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-3">Import Failed</h2>
                    <p className="text-red-400 mb-8 max-w-md">{importError}</p>
                    
                    <button
                      onClick={() => {
                        setImportError('');
                        setStep(0);
                      }}
                      className="px-8 py-3 rounded-xl bg-surface-700 hover:bg-surface-600 text-white font-bold transition-colors"
                    >
                      Try Again
                    </button>
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
