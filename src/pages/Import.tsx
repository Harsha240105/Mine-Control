import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, ArrowLeft, ArrowRight, FolderOpen, FileArchive, Check, CheckCircle,
  AlertCircle, AlertTriangle, Loader2, Play, HardDrive, Download, Globe,
  Users, Database, Layers, Map, Clock, Shield, BookOpen, Box,
  Grid3X3, Cpu, Wifi, Sword, ChevronRight, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

type StepName = 'select' | 'detect' | 'world' | 'players' | 'destination' | 'summary' | 'import';
type ImportType = 'full-server' | 'world' | 'mc-backup' | 'invalid';

interface WorldAnalysis {
  worldName: string;
  minecraftVersion: string;
  serverSoftware: string;
  seed: string;
  worldSize: number;
  worldSizeFormatted: string;
  regionCount: number;
  loadedChunks: number;
  dimensionCount: number;
  hasOverworld: boolean;
  hasNether: boolean;
  hasEnd: boolean;
  playerCount: number;
  playerNames: string[];
  lastPlayed: string | null;
  gameMode: string;
  difficulty: string;
  hardcore: boolean;
  onlineMode: boolean;
  datapacks: string[];
  mods: string[];
  plugins: string[];
}

interface PlayerAnalysis {
  username: string;
  uuid: string;
  inventory: any[];
  xpLevel: number;
  health: number;
  food: number;
  coordinates: { x: number; y: number; z: number };
  dimension: string;
  lastSeen: string | null;
  playTime: number;
  deaths: number;
  advancements: Record<string, any>;
  statistics: Record<string, any>;
}

interface ServerEntry {
  id: string;
  name: string;
  slug: string;
  version: string;
  software: string;
  status: string;
  worldName: string;
  port: number;
}

export default function Import() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<StepName>('select');
  const [sourceType, setSourceType] = useState<'zip' | 'folder' | null>(null);
  const [sourcePath, setSourcePath] = useState('');

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [importType, setImportType] = useState<ImportType | null>(null);
  const [worldAnalysis, setWorldAnalysis] = useState<WorldAnalysis | null>(null);
  const [detectionError, setDetectionError] = useState('');

  // Player analysis
  const [players, setPlayers] = useState<PlayerAnalysis[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerAnalysis | null>(null);

  // Destination
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [destinationType, setDestinationType] = useState<'new' | 'existing' | null>(null);
  const [selectedServerId, setSelectedServerId] = useState('');
  const [importMode, setImportMode] = useState<'replace' | 'additional'>('replace');
  const [serverName, setServerName] = useState('');

  // Import execution
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState('');
  const [importError, setImportError] = useState('');
  const [importedServer, setImportedServer] = useState<any>(null);

  const steps: { key: StepName; label: string; icon: any }[] = [
    { key: 'select', label: 'Select Source', icon: FolderOpen },
    { key: 'detect', label: 'Detection', icon: Search },
    { key: 'world', label: 'World Analysis', icon: Globe },
    { key: 'players', label: 'Players', icon: Users },
    { key: 'destination', label: 'Destination', icon: Server },
    { key: 'summary', label: 'Summary', icon: ClipboardList },
    { key: 'import', label: 'Import', icon: Download },
  ];

  const stepIndex = steps.findIndex(s => s.key === currentStep);

  const goToStep = (step: StepName) => {
    if (importing) return;
    setCurrentStep(step);
  };

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
          { name: 'Archives', extensions: ['zip', 'rar', '7z', 'tar', 'gz'] },
        ]);
        if (result) selectedPath = result;
      } else {
        const result = await window.electronAPI.selectDirectory();
        if (result) selectedPath = result;
      }

      if (selectedPath) {
        setSourcePath(selectedPath);
        setServerName(path => path || selectedPath.split(/[\\/]/).pop()?.replace(/\.(zip|rar|7z)$/i, '') || 'Imported Server');
        setDetectionError('');
        setImportType(null);
        setWorldAnalysis(null);
        setPlayers([]);
        await analyzeSource(selectedPath);
      } else {
        setSourceType(null);
      }
    } catch (err: any) {
      toast.error('Failed to select source: ' + err.message);
      setSourceType(null);
    }
  };

  const analyzeSource = async (path: string) => {
    setAnalyzing(true);
    setCurrentStep('detect');
    try {
      const res = await api.importAnalyze(path);
      setImportType(res.type);
      setWorldAnalysis(res.world);

      if (res.type === 'invalid') {
        setDetectionError(res.detection?.error || 'This does not appear to be a valid Minecraft source.');
        goToStep('detect');
        return;
      }

      if (res.world) {
        setServerName(res.world.worldName || serverName);
        goToStep('world');
      } else {
        setDetectionError('No world data detected in the source.');
        goToStep('detect');
      }
    } catch (err: any) {
      setDetectionError(err.message || 'Analysis failed');
      setImportType('invalid');
      goToStep('detect');
    } finally {
      setAnalyzing(false);
    }
  };

  const loadPlayerAnalysis = async () => {
    if (!sourcePath) return;
    setLoadingPlayers(true);
    try {
      const res = await api.importAnalyzePlayers(sourcePath);
      setPlayers(res.players || []);
      if (res.players?.length > 0) {
        setSelectedPlayer(res.players[0]);
      }
    } catch {
      setPlayers([]);
    } finally {
      setLoadingPlayers(false);
    }
  };

  const loadServers = async () => {
    setLoadingServers(true);
    try {
      const res = await api.importGetServers();
      setServers(res.servers || []);
    } catch {
      setServers([]);
    } finally {
      setLoadingServers(false);
    }
  };

  const handlePlayersNext = () => {
    loadServers();
    goToStep('destination');
  };

  const handleDestinationNext = () => {
    goToStep('summary');
  };

  const executeImport = async () => {
    setImporting(true);
    setCurrentStep('import');

    const progressInterval = setInterval(() => {
      setImportProgress(p => {
        if (p < 90) return p + Math.random() * 3;
        return p;
      });
    }, 500);

    setImportStatus('Extracting and analyzing files...');

    try {
      const config: any = {
        name: serverName,
        destinationType,
        destinationServerId: destinationType === 'existing' ? selectedServerId : undefined,
        importMode: destinationType === 'existing' ? importMode : undefined,
      };

      const result = await api.importExecute(sourcePath, config);
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

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-6 overflow-x-auto py-2">
      {steps.map((s, i) => {
        const isActive = s.key === currentStep;
        const isPast = stepIndex > i;
        return (
          <React.Fragment key={s.key}>
            <button
              onClick={() => isPast && !importing ? goToStep(s.key) : undefined}
              className={`flex flex-col items-center transition-opacity ${isPast && !importing ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                isActive
                  ? 'bg-minecraft-500 text-white shadow-[0_0_12px_rgba(34,197,94,0.4)]'
                  : isPast
                  ? 'bg-minecraft-500/20 text-minecraft-400'
                  : 'bg-surface-800 text-gray-600'
              }`}>
                {isPast ? <Check size={16} /> : i + 1}
              </div>
              <span className={`text-[10px] mt-1 whitespace-nowrap ${isActive ? 'text-gray-200 font-medium' : 'text-gray-600'}`}>{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <div className={`w-8 h-0.5 mx-1 rounded-full ${isPast ? 'bg-minecraft-500/40' : 'bg-surface-800'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  const renderCard = (title: string, value: string, icon?: any) => (
    <div className="bg-surface-800/60 rounded-xl px-4 py-3 border border-surface-700/50">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-minecraft-400">{icon}</span>}
        <span className="text-xs text-gray-500 uppercase tracking-wider">{title}</span>
      </div>
      <p className="text-sm font-semibold text-gray-100 truncate">{value}</p>
    </div>
  );

  // ── STEP: Select Source ──
  const renderSelectSource = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-minecraft-600/10 flex items-center justify-center mx-auto mb-4">
          <Download size={32} className="text-minecraft-400" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Universal Import Wizard</h2>
        <p className="text-gray-400 max-w-lg mx-auto">
          Import any Minecraft content — full servers, worlds, backups, or Aternos exports.
          We auto-detect everything for you.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mx-auto">
        <button
          onClick={() => handleSelectSource('zip')}
          className="flex flex-col items-center gap-4 p-8 rounded-xl bg-surface-800 border border-surface-700 hover:border-minecraft-500/50 hover:bg-surface-800/80 transition-all duration-200 group"
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
            <FileArchive size={32} className="text-blue-400" />
          </div>
          <div className="text-center">
            <h3 className="font-bold text-lg mb-1">ZIP / Archive</h3>
            <p className="text-sm text-gray-400">Import from .zip, .rar, .7z, .tar, .gz</p>
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
            <p className="text-sm text-gray-400">Import from an uncompressed directory</p>
          </div>
        </button>
      </div>
    </div>
  );

  // ── STEP: Detection ──
  const renderDetection = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4">
      {analyzing ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="relative mb-8">
            <Loader2 size={56} className="text-minecraft-400 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Search size={20} className="text-minecraft-300" />
            </div>
          </div>
          <h2 className="text-xl font-bold mb-2">Analyzing Source...</h2>
          <p className="text-gray-400 text-sm">Scanning for world data, server software, and configurations</p>
        </div>
      ) : importType === 'invalid' ? (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle size={40} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold mb-2 text-red-400">Invalid Import Source</h2>
          <p className="text-gray-400 mb-6 max-w-md">{detectionError}</p>
          <button
            onClick={() => { setSourceType(null); setSourcePath(''); goToStep('select'); }}
            className="px-6 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-white font-medium transition-colors"
          >
            Choose Different Source
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 text-center">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
            <CheckCircle size={40} className="text-green-400" />
          </div>
          <h2 className="text-xl font-bold mb-1">Source Detected!</h2>
          <p className="text-gray-400 text-sm mb-2">
            {importType === 'full-server' ? 'Full Minecraft Server' : importType === 'world' ? 'Minecraft World' : importType === 'mc-backup' ? 'MineControl Backup' : 'Unknown'}
          </p>
          <p className="text-gray-500 text-xs mb-8 truncate max-w-full">{sourcePath}</p>

          {worldAnalysis && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-xl mb-8">
              {renderCard('World', worldAnalysis.worldName, <Globe size={14} />)}
              {renderCard('Software', worldAnalysis.serverSoftware, <Server size={14} />)}
              {renderCard('Version', worldAnalysis.minecraftVersion, <Info size={14} />)}
              {renderCard('Players', String(worldAnalysis.playerCount), <Users size={14} />)}
              {renderCard('Dimensions', String(worldAnalysis.dimensionCount), <Layers size={14} />)}
              {renderCard('Size', worldAnalysis.worldSizeFormatted, <HardDrive size={14} />)}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setSourceType(null); setSourcePath(''); goToStep('select'); }}
              className="px-6 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-white font-medium transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => { goToStep('world'); }}
              className="px-6 py-2 rounded-lg bg-minecraft-600 hover:bg-minecraft-500 text-white font-medium flex items-center gap-2 transition-colors"
            >
              View World Details <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── STEP: World Analysis ──
  const renderWorldAnalysis = () => {
    if (!worldAnalysis) return null;

    return (
      <div className="animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-center gap-3 mb-6">
          <Globe size={24} className="text-minecraft-400" />
          <div>
            <h2 className="text-xl font-bold">{worldAnalysis.worldName}</h2>
            <p className="text-sm text-gray-500">World Analysis</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {renderCard('Minecraft Version', worldAnalysis.minecraftVersion, <Info size={14} />)}
          {renderCard('Server Software', worldAnalysis.serverSoftware, <Server size={14} />)}
          {renderCard('Seed', worldAnalysis.seed || 'N/A', <Database size={14} />)}
          {renderCard('World Size', worldAnalysis.worldSizeFormatted, <HardDrive size={14} />)}
          {renderCard('Region Count', String(worldAnalysis.regionCount), <Grid3X3 size={14} />)}
          {renderCard('Loaded Chunks', String(worldAnalysis.loadedChunks), <Map size={14} />)}
          {renderCard('Dimension Count', String(worldAnalysis.dimensionCount), <Layers size={14} />)}
          {renderCard('Player Count', String(worldAnalysis.playerCount), <Users size={14} />)}
          {renderCard('Game Mode', worldAnalysis.gameMode, <Sword size={14} />)}
          {renderCard('Difficulty', worldAnalysis.difficulty, <Shield size={14} />)}
          {renderCard('Hardcore', worldAnalysis.hardcore ? 'Yes' : 'No', <AlertTriangle size={14} />)}
          {renderCard('Online Mode', worldAnalysis.onlineMode ? 'Enabled' : 'Offline', <Wifi size={14} />)}
          {renderCard('Last Played', worldAnalysis.lastPlayed ? new Date(worldAnalysis.lastPlayed).toLocaleDateString() : 'N/A', <Clock size={14} />)}
        </div>

        {/* Dimensions */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Dimensions</h3>
          <div className="flex gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              worldAnalysis.hasOverworld ? 'bg-green-500/10 text-green-400' : 'bg-surface-800 text-gray-600'
            }`}>
              <div className={`w-2 h-2 rounded-full ${worldAnalysis.hasOverworld ? 'bg-green-400' : 'bg-gray-600'}`} />
              Overworld
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              worldAnalysis.hasNether ? 'bg-red-500/10 text-red-400' : 'bg-surface-800 text-gray-600'
            }`}>
              <div className={`w-2 h-2 rounded-full ${worldAnalysis.hasNether ? 'bg-red-400' : 'bg-gray-600'}`} />
              Nether
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              worldAnalysis.hasEnd ? 'bg-purple-500/10 text-purple-400' : 'bg-surface-800 text-gray-600'
            }`}>
              <div className={`w-2 h-2 rounded-full ${worldAnalysis.hasEnd ? 'bg-purple-400' : 'bg-gray-600'}`} />
              End
            </div>
          </div>
        </div>

        {/* Datapacks */}
        {worldAnalysis.datapacks.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Datapacks ({worldAnalysis.datapacks.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {worldAnalysis.datapacks.map(dp => (
                <span key={dp} className="px-3 py-1 text-xs bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">
                  <BookOpen size={12} className="inline mr-1" />{dp}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Plugins */}
        {worldAnalysis.plugins.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Plugins ({worldAnalysis.plugins.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {worldAnalysis.plugins.map(p => (
                <span key={p} className="px-3 py-1 text-xs bg-orange-500/10 text-orange-400 rounded-full border border-orange-500/20">
                  <Box size={12} className="inline mr-1" />{p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Mods */}
        {worldAnalysis.mods.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Mods ({worldAnalysis.mods.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {worldAnalysis.mods.map(m => (
                <span key={m} className="px-3 py-1 text-xs bg-purple-500/10 text-purple-400 rounded-full border border-purple-500/20">
                  <Cpu size={12} className="inline mr-1" />{m}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <button onClick={() => goToStep('detect')} className="px-6 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-white font-medium transition-colors">
            Back
          </button>
          <button
            onClick={() => { loadPlayerAnalysis(); goToStep('players'); }}
            className="px-6 py-2 rounded-lg bg-minecraft-600 hover:bg-minecraft-500 text-white font-medium flex items-center gap-2 transition-colors"
          >
            View Players <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  };

  // ── STEP: Players ──
  const renderPlayers = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 mb-6">
        <Users size={24} className="text-minecraft-400" />
        <div>
          <h2 className="text-xl font-bold">Player Analysis</h2>
          <p className="text-sm text-gray-500">{players.length} player(s) found</p>
        </div>
      </div>

      {loadingPlayers ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={40} className="text-minecraft-400 animate-spin mb-4" />
          <p className="text-gray-400">Reading player data...</p>
        </div>
      ) : players.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Users size={40} className="text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Player Data Found</h3>
          <p className="text-gray-500 text-sm max-w-md">No playerdata files were detected in this world.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-2 max-h-80 overflow-y-auto">
            {players.map(p => (
              <button
                key={p.uuid}
                onClick={() => setSelectedPlayer(p)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                  selectedPlayer?.uuid === p.uuid
                    ? 'bg-minecraft-600/10 border-minecraft-500/40'
                    : 'bg-surface-800/60 border-surface-700/50 hover:border-surface-600'
                }`}
              >
                <p className="font-semibold text-sm">{p.username || p.uuid.slice(0, 8)}</p>
                <p className="text-xs text-gray-500">{p.uuid.slice(0, 8)}... | HP: {p.health} | Lvl: {p.xpLevel}</p>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2">
            {selectedPlayer && (
              <div className="bg-surface-800/60 rounded-xl border border-surface-700/50 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold">{selectedPlayer.username}</h3>
                    <p className="text-xs text-gray-500 font-mono">{selectedPlayer.uuid}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  {renderCard('Health', `${selectedPlayer.health.toFixed(1)} ❤️`)}
                  {renderCard('Food', `${selectedPlayer.food} 🍖`)}
                  {renderCard('XP Level', String(selectedPlayer.xpLevel))}
                  {renderCard('Deaths', String(selectedPlayer.deaths))}
                  {renderCard('Play Time', `${Math.floor(selectedPlayer.playTime / 3600)}h ${Math.floor((selectedPlayer.playTime % 3600) / 60)}m`)}
                  {renderCard('Dimension', selectedPlayer.dimension.replace('minecraft:', ''))}
                  {renderCard('Last Seen', selectedPlayer.lastSeen ? new Date(selectedPlayer.lastSeen).toLocaleDateString() : 'N/A')}
                  {renderCard('Coordinates', `[${Math.floor(selectedPlayer.coordinates.x)}, ${Math.floor(selectedPlayer.coordinates.y)}, ${Math.floor(selectedPlayer.coordinates.z)}]`)}
                </div>

                {selectedPlayer.advancements && Object.keys(selectedPlayer.advancements).length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Advancements ({Object.keys(selectedPlayer.advancements).length})
                    </h4>
                    <div className="text-xs text-gray-400 max-h-24 overflow-y-auto">
                      {Object.keys(selectedPlayer.advancements).slice(0, 20).map(a => (
                        <span key={a} className="block truncate">{a.split('/').pop()?.replace(/_/g, ' ')}</span>
                      ))}
                      {Object.keys(selectedPlayer.advancements).length > 20 && (
                        <span className="text-gray-600">+{Object.keys(selectedPlayer.advancements).length - 20} more</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button onClick={() => goToStep('world')} className="px-6 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-white font-medium transition-colors">
          Back
        </button>
        <button
          onClick={handlePlayersNext}
          className="px-6 py-2 rounded-lg bg-minecraft-600 hover:bg-minecraft-500 text-white font-medium flex items-center gap-2 transition-colors"
        >
          Choose Destination <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );

  // ── STEP: Destination ──
  const renderDestination = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 mb-6">
        <Server size={24} className="text-minecraft-400" />
        <div>
          <h2 className="text-xl font-bold">Import Destination</h2>
          <p className="text-sm text-gray-500">Where should we import this content?</p>
        </div>
      </div>

      {loadingServers ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={40} className="text-minecraft-400 animate-spin mb-4" />
          <p className="text-gray-400">Loading servers...</p>
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          {/* Option 1: Create New Server */}
          <button
            onClick={() => { setDestinationType('new'); setSelectedServerId(''); }}
            className={`w-full p-5 rounded-xl border-2 text-left transition-all ${
              destinationType === 'new'
                ? 'border-minecraft-500 bg-minecraft-600/10'
                : 'border-surface-700 bg-surface-800/60 hover:border-surface-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                destinationType === 'new' ? 'bg-minecraft-600/20 text-minecraft-400' : 'bg-surface-700 text-gray-400'
              }`}>
                <Server size={20} />
              </div>
              <div>
                <h3 className="font-bold">Create New Server</h3>
                <p className="text-sm text-gray-500">Import as a brand new server</p>
              </div>
              {destinationType === 'new' && <Check size={20} className="text-minecraft-400 ml-auto" />}
            </div>
          </button>

          {/* Option 2: Existing Server */}
          <div>
            <button
              onClick={() => { setDestinationType('existing'); }}
              className={`w-full p-5 rounded-xl border-2 text-left transition-all ${
                destinationType === 'existing'
                  ? 'border-minecraft-500 bg-minecraft-600/10'
                  : 'border-surface-700 bg-surface-800/60 hover:border-surface-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  destinationType === 'existing' ? 'bg-minecraft-600/20 text-minecraft-400' : 'bg-surface-700 text-gray-400'
                }`}>
                  <Database size={20} />
                </div>
                <div>
                  <h3 className="font-bold">Import into Existing Server</h3>
                  <p className="text-sm text-gray-500">Merge world data into an existing server</p>
                </div>
                {destinationType === 'existing' && <Check size={20} className="text-minecraft-400 ml-auto" />}
              </div>
            </button>

            {destinationType === 'existing' && (
              <div className="mt-3 space-y-2 pl-4 border-l-2 border-minecraft-500/30 ml-5">
                {servers.length === 0 ? (
                  <p className="text-sm text-gray-500 py-3">No existing servers found.</p>
                ) : (
                  servers.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedServerId(s.id)}
                      className={`w-full p-3 rounded-lg border text-left transition-all ${
                        selectedServerId === s.id
                          ? 'border-minecraft-500/50 bg-minecraft-600/10'
                          : 'border-surface-700 bg-surface-800/40 hover:border-surface-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{s.name}</p>
                          <p className="text-xs text-gray-500">{s.software} {s.version} • {s.worldName} • {s.status}</p>
                        </div>
                        {selectedServerId === s.id && <Check size={16} className="text-minecraft-400" />}
                      </div>
                    </button>
                  ))
                )}

                {selectedServerId && (
                  <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <h4 className="text-sm font-semibold text-amber-400 mb-3">Import Mode</h4>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/60 cursor-pointer hover:bg-surface-800">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'replace'}
                          onChange={() => setImportMode('replace')}
                          className="accent-minecraft-500"
                        />
                        <div>
                          <p className="text-sm font-medium">Replace current world</p>
                          <p className="text-xs text-gray-500">⚠ This will overwrite the existing world data</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/60 cursor-pointer hover:bg-surface-800">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'additional'}
                          onChange={() => setImportMode('additional')}
                          className="accent-minecraft-500"
                        />
                        <div>
                          <p className="text-sm font-medium">Import as additional world</p>
                          <p className="text-xs text-gray-500">The world will be added alongside the current one</p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={() => goToStep('players')} className="px-6 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-white font-medium transition-colors">
          Back
        </button>
        <button
          onClick={handleDestinationNext}
          disabled={!destinationType || (destinationType === 'existing' && !selectedServerId)}
          className="px-6 py-2 rounded-lg bg-minecraft-600 hover:bg-minecraft-500 text-white font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Review Summary <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );

  // ── STEP: Summary ──
  const renderSummary = () => {
    const destServer = destinationType === 'existing'
      ? servers.find(s => s.id === selectedServerId)
      : null;

    return (
      <div className="animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-center gap-3 mb-6">
          <ClipboardCheck size={24} className="text-minecraft-400" />
          <div>
            <h2 className="text-xl font-bold">Import Summary</h2>
            <p className="text-sm text-gray-500">Review before importing</p>
          </div>
        </div>

        <div className="bg-surface-800/60 rounded-xl border border-surface-700/50 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Source</h3>
          <div className="grid grid-cols-2 gap-3">
            {renderCard('World Name', worldAnalysis?.worldName || 'Unknown')}
            {renderCard('Software', worldAnalysis?.serverSoftware || 'Unknown')}
            {renderCard('Minecraft Version', worldAnalysis?.minecraftVersion || 'Unknown')}
            {renderCard('Seed', worldAnalysis?.seed || 'N/A')}
            {renderCard('Players', String(worldAnalysis?.playerCount || 0))}
            {renderCard('Dimensions', String(worldAnalysis?.dimensionCount || 0))}
            {renderCard('Size', worldAnalysis?.worldSizeFormatted || 'Unknown')}
            {renderCard('Source Type', importType === 'full-server' ? 'Full Server' : importType === 'world' ? 'World' : importType === 'mc-backup' ? 'Backup' : 'Unknown')}
          </div>
        </div>

        <div className="bg-surface-800/60 rounded-xl border border-surface-700/50 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Destination</h3>
          {destinationType === 'new' ? (
            <div>
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <Server size={16} />
                <span className="font-semibold">New Server: {serverName}</span>
              </div>
              <p className="text-sm text-gray-500">A new server will be created automatically</p>
            </div>
          ) : destServer ? (
            <div>
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <Database size={16} />
                <span className="font-semibold">Existing Server: {destServer.name}</span>
              </div>
              <p className="text-sm text-gray-500">
                Mode: {importMode === 'replace' ? 'Replace current world' : 'Import as additional world'}
              </p>
              {importMode === 'replace' && (
                <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 rounded-lg px-4 py-2">
                  <AlertTriangle size={14} />
                  Warning: This will overwrite the current world data
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex justify-between">
          <button onClick={() => goToStep('destination')} className="px-6 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-white font-medium transition-colors">
            Back
          </button>
          <button
            onClick={executeImport}
            className="px-8 py-3 rounded-xl bg-minecraft-600 hover:bg-minecraft-500 text-white font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
          >
            <Download size={18} /> Start Import
          </button>
        </div>
      </div>
    );
  };

  // ── STEP: Import Progress ──
  const renderImport = () => (
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
          <h2 className="text-2xl font-bold mb-2">Importing...</h2>
          <p className="text-gray-400">{importStatus}</p>
        </>
      )}

      {!importing && !importError && importedServer && (
        <>
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6 glow">
            <CheckCircle size={40} className="text-green-400" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Import Complete!</h2>
          <p className="text-gray-400 mb-2">Your content has been successfully imported.</p>
          <p className="text-green-400 font-semibold mb-8">No restart required — ready to play!</p>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-8 py-3 rounded-xl bg-minecraft-600 hover:bg-minecraft-500 text-white font-bold text-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
            >
              <Play size={20} /> Go to Dashboard
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 rounded-xl bg-surface-700 hover:bg-surface-600 text-white font-medium transition-colors"
            >
              Home
            </button>
          </div>
        </>
      )}

      {!importing && importError && (
        <>
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
            <AlertCircle size={40} className="text-red-400" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3">Import Failed</h2>
          <p className="text-red-400 mb-8 max-w-md">{importError}</p>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setImportError('');
                setImportProgress(0);
                goToStep('summary');
              }}
              className="px-8 py-3 rounded-xl bg-surface-700 hover:bg-surface-600 text-white font-bold transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => {
                setImportError('');
                setImportProgress(0);
                setSourceType(null);
                setSourcePath('');
                goToStep('select');
              }}
              className="px-6 py-3 rounded-xl bg-surface-800 hover:bg-surface-700 text-gray-400 transition-colors"
            >
              Start Over
            </button>
          </div>
        </>
      )}
    </div>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 'select': return renderSelectSource();
      case 'detect': return renderDetection();
      case 'world': return renderWorldAnalysis();
      case 'players': return renderPlayers();
      case 'destination': return renderDestination();
      case 'summary': return renderSummary();
      case 'import': return renderImport();
      default: return renderSelectSource();
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col relative overflow-hidden">
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
          <h1 className="text-xl font-bold text-gray-100">Universal Import</h1>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center p-6 pb-24 z-10">
        <div className="w-full max-w-4xl">
          {currentStep !== 'select' && currentStep !== 'import' && renderStepIndicator()}

          <div className="bg-surface-900/50 border border-surface-800 rounded-2xl p-6 md:p-8 backdrop-blur-md shadow-2xl">
            {renderStep()}
          </div>
        </div>
      </div>
    </div>
  );
}

function Search(props: any) { return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg> }
function ClipboardList(props: any) { return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg> }
function ClipboardCheck(props: any) { return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg> }
