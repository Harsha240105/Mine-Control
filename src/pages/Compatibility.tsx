import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Cable,
  Check,
  CheckCircle,
  Copy,
  Gamepad2,
  Globe,
  HelpCircle,
  Info,
  Laptop,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Shield,
  ShieldAlert,
  Smartphone,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Wifi,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

type JoinMode = 'java_only' | 'java_bedrock' | 'premium_only' | 'offline';
type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

interface ComponentState {
  installed: boolean;
  enabled: boolean;
  file: string;
}

interface CompatibilityStatus {
  mode: JoinMode;
  allowMultipleVersions: boolean;
  serverSoftware: string;
  serverVersion: string;
  serverPort: number;
  compatibilityStatus: 'pass' | 'warn' | 'fail';
  statusMessage: string;
  bedrockEnabled: boolean;
  floodgateEnabled: boolean;
  offlineMode: boolean;
  premiumAuth: boolean;
  indicators: Array<{ label: string; status: string }>;
  compatibilityTable: Array<{ recommended: string; range: string; notes: string }>;
  components: {
    geyser: ComponentState;
    floodgate: ComponentState;
    viaversion: ComponentState;
    viabackwards: ComponentState;
  };
  joinInfo: {
    javaAddress: string;
    bedrockAddress: string;
    localAddress: string;
    lanAddress: string;
    tunnelAddress: string;
    dnsAddress: string;
    bedrockPort: number;
    instructions: Record<string, string>;
  };
}

interface CompatibilityCheck {
  name: string;
  status: CheckStatus;
  message: string;
  fix?: string;
}

interface CheckResult {
  overall: 'pass' | 'warn' | 'fail';
  checks: CompatibilityCheck[];
  restrictions: string[];
}

interface ApplyResult {
  success: boolean;
  restartRequired: boolean;
  restarted: boolean;
  results: Array<{ action: string; status: string; detail: string }>;
  status: CompatibilityStatus;
}

const joinModes: Array<{
  id: JoinMode;
  title: string;
  badge?: string;
  icon: LucideIcon;
  tone: string;
  description: string;
  details: string[];
  warning?: string;
  clients?: Array<{ name: string; supported: boolean; note?: string }>;
}> = [
  {
    id: 'java_only',
    title: 'Java Only',
    badge: 'Simple',
    icon: Laptop,
    tone: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    description: 'Only Minecraft Java Edition clients can join.',
    details: [
      'Works with official Minecraft Java and compatible Java launchers.',
      'Best when every player uses the same Minecraft version as the server.',
    ],
    clients: [
      { name: 'Official Minecraft Java', supported: true },
      { name: 'TLauncher / Offline', supported: false, note: 'Requires offline mode' },
    ],
  },
  {
    id: 'java_bedrock',
    title: 'Java + Bedrock',
    badge: 'Recommended',
    icon: Gamepad2,
    tone: 'text-green-400 bg-green-500/10 border-green-500/20',
    description: 'Allow Java and Bedrock players to join the same server.',
    details: [
      'Installs and configures Geyser and Floodgate when supported.',
      'Supports Android, iOS, Windows Bedrock, Xbox, PlayStation, and Switch where the network setup allows it.',
    ],
    clients: [
      { name: 'Official Minecraft Java', supported: true },
      { name: 'TLauncher / Offline', supported: false, note: 'Requires offline mode' },
      { name: 'Bedrock (Android/iOS/Win10)', supported: true },
      { name: 'Bedrock (Console)', supported: false, note: 'Network dependent' },
    ],
  },
  {
    id: 'premium_only',
    title: 'Premium Only',
    badge: 'Secure',
    icon: Shield,
    tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    description: 'Only authenticated official Java accounts can join.',
    details: [
      'Enables online-mode authentication (online-mode=true).',
      'Recommended for public or semi-public Java servers.',
      'Offline launchers such as TLauncher cannot join in this mode.',
    ],
    clients: [
      { name: 'Official Minecraft Java', supported: true },
      { name: 'TLauncher / Offline', supported: false, note: 'Blocked by online-mode' },
    ],
  },
  {
    id: 'offline',
    title: 'Offline / Non-Premium',
    badge: 'Private use',
    icon: ShieldAlert,
    tone: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    description: 'Allow offline-mode Java servers when you choose that tradeoff.',
    details: [
      'Useful only for private servers with trusted players.',
      'Names are not verified by Mojang/Microsoft in offline mode.',
    ],
    warning: 'Security warning: offline mode reduces account protection and can allow name spoofing.',
    clients: [
      { name: 'Official Minecraft Java', supported: true },
      { name: 'TLauncher / Offline', supported: true },
    ],
  },
];

export default function Compatibility() {
  const [status, setStatus] = useState<CompatibilityStatus | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [selectedMode, setSelectedMode] = useState<JoinMode>('java_bedrock');
  const [allowMultipleVersions, setAllowMultipleVersions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const selectedModeInfo = useMemo(
    () => joinModes.find((mode) => mode.id === selectedMode) || joinModes[0],
    [selectedMode],
  );

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await api.getCompatibilityStatus();
      setStatus(data);
      setSelectedMode(data.mode || 'java_bedrock');
      setAllowMultipleVersions(Boolean(data.allowMultipleVersions));
      await runCheck(data.mode || 'java_bedrock', Boolean(data.allowMultipleVersions), false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load compatibility status');
    }
    setLoading(false);
  };

  const runCheck = async (
    mode = selectedMode,
    multi = allowMultipleVersions,
    showToast = true,
  ) => {
    setChecking(true);
    try {
      const result = await api.checkCompatibility({ mode, allowMultipleVersions: multi });
      setCheck(result);
      if (showToast) {
        if (result.overall === 'pass') toast.success('Compatibility checks passed');
        else if (result.overall === 'fail') toast.error('Compatibility checks found blockers');
        else toast('Compatibility checks found warnings', { icon: '!' });
      }
      return result as CheckResult;
    } catch (err: any) {
      toast.error(err.message || 'Compatibility check failed');
      return null;
    } finally {
      setChecking(false);
    }
  };

  const applySettings = async () => {
    if (selectedMode === 'offline') {
      const confirmed = window.confirm(
        'Offline mode disables official Java account authentication. Only enable it for a private server with trusted players. Continue?',
      );
      if (!confirmed) return;
    }

    setSaving(true);
    setApplyResult(null);
    try {
      const latestCheck = await runCheck(selectedMode, allowMultipleVersions, false);
      if (latestCheck?.overall === 'fail') {
        toast.error('Fix the blocking compatibility issues before applying');
        setSaving(false);
        return;
      }
      const result = await api.configureCompatibility({ mode: selectedMode, allowMultipleVersions });
      setApplyResult(result);
      setStatus(result.status);
      setCheck(null);
      toast.success(result.restarted ? 'Compatibility applied and server restarted' : 'Compatibility applied');
      await runCheck(selectedMode, allowMultipleVersions, false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply compatibility settings');
    }
    setSaving(false);
  };

  const copyToClipboard = async (label: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      toast.success(`Copied ${label}`);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error('Failed to copy');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="card max-w-xl">
        <h2 className="text-lg font-semibold text-gray-100">Compatibility Manager</h2>
        <p className="text-sm text-gray-500 mt-1">No active server was found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <Cable size={22} className="text-minecraft-400" />
            Compatibility Manager
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure who can join and let MineControl install the right compatibility pieces.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadStatus()}
            className="btn-ghost flex items-center gap-2"
            title="Refresh compatibility status"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            onClick={() => runCheck()}
            disabled={checking}
            className="btn-secondary flex items-center gap-2"
          >
            {checking ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            Run Checker
          </button>
          <button
            onClick={applySettings}
            disabled={saving || checking}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Apply Settings
          </button>
        </div>
      </div>

      <Dashboard status={status} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">Universal Join Modes</h3>
            <p className="text-xs text-gray-500">Pick the joining style you want. MineControl handles the technical parts.</p>
          </div>
          <StatusBadge status={check?.overall || status.compatibilityStatus} />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-4 md:grid-cols-2 gap-4">
          {joinModes.map((mode) => (
            <ModeCard
              key={mode.id}
              mode={mode}
              selected={selectedMode === mode.id}
              onSelect={() => setSelectedMode(mode.id)}
            />
          ))}
        </div>
      </section>

      <LauncherCompatibility mode={selectedModeInfo} />

      {selectedModeInfo.warning && (
        <div className="card border border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-yellow-300">Security warning</h3>
              <p className="text-xs text-yellow-200/80 mt-1">{selectedModeInfo.warning}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <VersionCompatibility
            enabled={allowMultipleVersions}
            onToggle={() => setAllowMultipleVersions((value) => !value)}
            table={status.compatibilityTable}
          />
          <CompatibilityChecker check={check} checking={checking} />
          {applyResult && <ApplyResults result={applyResult} />}
        </div>

        <div className="space-y-6">
          <AutomaticSetup mode={selectedMode} allowMultipleVersions={allowMultipleVersions} status={status} />
          <JoinInformation
            status={status}
            copied={copied}
            onCopy={copyToClipboard}
          />
        </div>
      </div>
    </div>
  );
}

function Dashboard({ status }: { status: CompatibilityStatus }) {
  const items = [
    { label: 'Server Software', value: status.serverSoftware, icon: Server },
    { label: 'Server Version', value: status.serverVersion || 'Unknown', icon: Sparkles },
    { label: 'Bedrock Support', value: status.bedrockEnabled ? 'Enabled' : 'Disabled', icon: Gamepad2 },
    { label: 'Offline Mode', value: status.offlineMode ? 'Enabled' : 'Disabled', icon: ShieldAlert },
    { label: 'Premium Authentication', value: status.premiumAuth ? 'Enabled' : 'Disabled', icon: Shield },
    { label: 'Compatibility Status', value: status.statusMessage, icon: Wifi },
  ];

  return (
    <div className="card">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Compatibility Dashboard</h3>
          <p className="text-xs text-gray-500">Current active-server health and installed components.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status.indicators.map((indicator) => (
            <span key={indicator.label} className="inline-flex items-center gap-1.5 text-xs text-gray-400 bg-surface-800 border border-surface-700 px-2 py-1 rounded-lg">
              <span className={`w-2 h-2 rounded-full ${indicatorColor(indicator.status)}`} />
              {indicator.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-surface-700 bg-surface-800/40 p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              <item.icon size={14} className="text-minecraft-400" />
              {item.label}
            </div>
            <p className="text-sm text-gray-200 leading-relaxed">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LauncherCompatibility({ mode }: { mode: typeof joinModes[number] }) {
  if (!mode.clients || mode.clients.length === 0) return null;
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-200 mb-1">Launcher Compatibility</h3>
      <p className="text-xs text-gray-500 mb-4">Which launchers can connect in the selected mode.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {mode.clients.map((client) => (
          <div key={client.name} className={`rounded-lg border p-3 ${client.supported ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${client.supported ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={`text-xs font-medium ${client.supported ? 'text-green-300' : 'text-red-300'}`}>
                {client.supported ? 'Ready' : 'Not Ready'}
              </span>
            </div>
            <p className="text-sm text-gray-200">{client.name}</p>
            {client.note && <p className="text-xs text-gray-500 mt-1">{client.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ModeCard({
  mode,
  selected,
  onSelect,
}: {
  mode: (typeof joinModes)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      title={mode.description}
      className={`card-hover text-left border transition-all ${
        selected ? 'border-minecraft-500/60 bg-minecraft-500/10' : 'border-surface-700/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className={`p-3 rounded-lg border ${mode.tone}`}>
          <mode.icon size={22} />
        </div>
        <div className="flex items-center gap-2">
          {mode.badge && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              mode.badge === 'Recommended' ? 'bg-green-500/15 text-green-400 border border-green-500/20' : 'bg-surface-800 text-gray-400 border border-surface-700'
            }`}>
              {mode.badge}
            </span>
          )}
          <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
            selected ? 'bg-minecraft-500 border-minecraft-400' : 'border-surface-500'
          }`}>
            {selected && <Check size={11} className="text-white" />}
          </span>
        </div>
      </div>
      <h4 className="text-base font-semibold text-gray-100">{mode.title}</h4>
      <p className="text-sm text-gray-400 mt-1 leading-relaxed">{mode.description}</p>
      <div className="mt-3 space-y-2">
        {mode.details.map((detail) => (
          <div key={detail} className="flex items-start gap-2 text-xs text-gray-500">
            <Info size={12} className="text-gray-600 mt-0.5 shrink-0" />
            <span>{detail}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

function VersionCompatibility({
  enabled,
  onToggle,
  table,
}: {
  enabled: boolean;
  onToggle: () => void;
  table: CompatibilityStatus['compatibilityTable'];
}) {
  return (
    <div className="card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Version Compatibility</h3>
          <p className="text-xs text-gray-500 mt-1">
            Allow a compatible range of Minecraft client versions for the selected server software.
          </p>
        </div>
        <button
          onClick={onToggle}
          title="Install and configure ViaVersion components where supported"
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
            enabled
              ? 'border-green-500/30 bg-green-500/10 text-green-400'
              : 'border-surface-700 bg-surface-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          {enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
          Allow Multiple Minecraft Versions
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-surface-700">
              <th className="py-2 pr-3 font-medium">Recommended Server Version</th>
              <th className="py-2 pr-3 font-medium">Supported Client Range</th>
              <th className="py-2 font-medium">Known Limitations</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, index) => (
              <tr key={`${row.recommended}-${index}`} className="border-b border-surface-800 last:border-0">
                <td className="py-3 pr-3 text-gray-200 font-mono text-xs">{row.recommended}</td>
                <td className="py-3 pr-3 text-gray-300">{row.range}</td>
                <td className="py-3 text-gray-500">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompatibilityChecker({ check, checking }: { check: CheckResult | null; checking: boolean }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Compatibility Checker</h3>
          <p className="text-xs text-gray-500 mt-1">
            Verifies Java, server software, compatibility components, plugin conflicts, and ports before saving.
          </p>
        </div>
        {checking && <Loader2 size={18} className="text-minecraft-400 animate-spin" />}
      </div>

      {!check ? (
        <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-4 text-sm text-gray-500">
          Run the checker to preview restrictions and automatic fixes.
        </div>
      ) : (
        <div className="space-y-3">
          {check.restrictions.length > 0 && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
              <h4 className="text-xs font-semibold text-yellow-300 mb-2">Restrictions to know</h4>
              <div className="space-y-1.5">
                {check.restrictions.map((restriction) => (
                  <p key={restriction} className="text-xs text-yellow-100/75">{restriction}</p>
                ))}
              </div>
            </div>
          )}
          {check.checks.map((item) => (
            <CheckRow key={`${item.name}-${item.message}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckRow({ item }: { item: CompatibilityCheck }) {
  const icon = item.status === 'pass'
    ? <CheckCircle size={17} className="text-green-400" />
    : item.status === 'fail'
      ? <XCircle size={17} className="text-red-400" />
      : item.status === 'warn'
        ? <AlertTriangle size={17} className="text-yellow-400" />
        : <HelpCircle size={17} className="text-gray-400" />;

  const bg = item.status === 'pass'
    ? 'bg-green-500/5 border-green-500/20'
    : item.status === 'fail'
      ? 'bg-red-500/5 border-red-500/20'
      : item.status === 'warn'
        ? 'bg-yellow-500/5 border-yellow-500/20'
        : 'bg-surface-800 border-surface-700';

  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-200">{item.name}</span>
            <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${statusClass(item.status)}`}>
              {item.status}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">{item.message}</p>
          {item.fix && <p className="text-xs text-gray-500 mt-1">Auto fix: {item.fix}</p>}
        </div>
      </div>
    </div>
  );
}

function AutomaticSetup({
  mode,
  allowMultipleVersions,
  status,
}: {
  mode: JoinMode;
  allowMultipleVersions: boolean;
  status: CompatibilityStatus;
}) {
  const needed = [
    ...(mode === 'java_bedrock'
      ? [
        { name: 'Geyser', state: status.components.geyser, desc: 'Lets Bedrock clients connect to the Java server.' },
        { name: 'Floodgate', state: status.components.floodgate, desc: 'Lets Bedrock players join online-mode servers with Bedrock accounts.' },
      ]
      : []),
    ...(allowMultipleVersions
      ? [
        { name: 'ViaVersion', state: status.components.viaversion, desc: 'Allows newer clients to join older compatible servers.' },
        { name: 'ViaBackwards', state: status.components.viabackwards, desc: 'Allows older clients to join newer compatible servers.' },
      ]
      : []),
  ];

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-200 mb-1">Automatic Compatibility Setup</h3>
      <p className="text-xs text-gray-500 mb-4">
        MineControl recommends, downloads, and configures components from trusted sources.
      </p>

      {needed.length === 0 ? (
        <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-3 text-xs text-gray-500">
          This mode does not need extra compatibility components.
        </div>
      ) : (
        <div className="space-y-3">
          {needed.map((item) => (
            <div key={item.name} className="rounded-lg border border-surface-700 bg-surface-800/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-200">{item.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
                  {item.state.file && <p className="text-[11px] text-gray-600 mt-1 font-mono truncate">{item.state.file}</p>}
                </div>
                <span className={`text-[10px] rounded-full px-2 py-0.5 border ${
                  item.state.installed && item.state.enabled
                    ? 'text-green-400 bg-green-500/10 border-green-500/20'
                    : item.state.installed
                      ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                      : 'text-gray-400 bg-surface-700 border-surface-600'
                }`}>
                  {item.state.installed ? (item.state.enabled ? 'INSTALLED' : 'DISABLED') : 'WILL INSTALL'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JoinInformation({
  status,
  copied,
  onCopy,
}: {
  status: CompatibilityStatus;
  copied: string | null;
  onCopy: (label: string, value: string) => void;
}) {
  const entries = [
    { label: 'Java Address', value: status.joinInfo.javaAddress, icon: Laptop, show: true },
    { label: 'Bedrock Address', value: status.joinInfo.bedrockAddress, icon: Gamepad2, show: status.bedrockEnabled },
    { label: 'Local Address', value: status.joinInfo.localAddress, icon: Server, show: true },
    { label: 'LAN Address', value: status.joinInfo.lanAddress, icon: Wifi, show: true },
    { label: 'Tunnel or DNS Address', value: status.joinInfo.tunnelAddress || status.joinInfo.dnsAddress, icon: Globe, show: true },
  ];

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-200 mb-1">Join Information</h3>
      <p className="text-xs text-gray-500 mb-4">Copy the right address for each client type.</p>

      <div className="space-y-3">
        {entries.filter((entry) => entry.show).map((entry) => (
          <div key={entry.label} className="rounded-lg border border-surface-700 bg-surface-800/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <entry.icon size={14} className="text-minecraft-400" />
              <span className="text-xs font-medium text-gray-400">{entry.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-surface-900 px-2 py-1.5 text-xs text-minecraft-300">
                {entry.value || 'Not configured'}
              </code>
              <button
                onClick={() => onCopy(entry.label, entry.value)}
                disabled={!entry.value}
                className={`p-2 rounded-lg transition-colors ${
                  copied === entry.label ? 'bg-green-500/20 text-green-400' : 'bg-surface-700 text-gray-400 hover:text-gray-200 disabled:opacity-40'
                }`}
                title={`Copy ${entry.label}`}
              >
                {copied === entry.label ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-surface-700 bg-surface-800/40 p-3">
        <h4 className="text-xs font-semibold text-gray-300 mb-2">Platform instructions</h4>
        <div className="space-y-2 text-xs text-gray-500">
          <Instruction icon={Laptop} text={status.joinInfo.instructions.java} />
          <Instruction icon={Smartphone} text={status.joinInfo.instructions.bedrockMobile} />
          <Instruction icon={Gamepad2} text={status.joinInfo.instructions.xbox} />
          <Instruction icon={Gamepad2} text={status.joinInfo.instructions.playstation} />
          <Instruction icon={Gamepad2} text={status.joinInfo.instructions.switch} />
        </div>
      </div>
    </div>
  );
}

function Instruction({
  icon: Icon,
  text,
}: {
  icon: LucideIcon;
  text: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={13} className="text-gray-600 mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function ApplyResults({ result }: { result: ApplyResult }) {
  return (
    <div className="card border border-minecraft-500/20">
      <div className="flex items-center gap-2 mb-3">
        <RotateCcw size={16} className="text-minecraft-400" />
        <h3 className="text-sm font-semibold text-gray-200">Last Apply Result</h3>
        {result.restartRequired && (
          <span className={`text-[10px] rounded-full px-2 py-0.5 border ${
            result.restarted ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
          }`}>
            {result.restarted ? 'RESTARTED' : 'RESTART REQUIRED'}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {result.results.map((item) => (
          <div key={`${item.action}-${item.detail}`} className="rounded-lg border border-surface-700 bg-surface-800/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-200">{item.action}</span>
              <span className="text-[10px] uppercase text-gray-400 bg-surface-700 border border-surface-600 rounded-full px-2 py-0.5">
                {item.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'pass' | 'warn' | 'fail' }) {
  const label = status === 'pass' ? 'Healthy' : status === 'fail' ? 'Needs Fixes' : 'Warnings';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
      status === 'pass'
        ? 'bg-green-500/10 text-green-400 border-green-500/20'
        : status === 'fail'
          ? 'bg-red-500/10 text-red-400 border-red-500/20'
          : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    }`}>
      <span className={`w-2 h-2 rounded-full ${
        status === 'pass' ? 'bg-green-400' : status === 'fail' ? 'bg-red-400' : 'bg-yellow-400'
      }`} />
      {label}
    </span>
  );
}

function statusClass(status: CheckStatus): string {
  if (status === 'pass') return 'bg-green-500/10 text-green-400';
  if (status === 'fail') return 'bg-red-500/10 text-red-400';
  if (status === 'warn') return 'bg-yellow-500/10 text-yellow-400';
  return 'bg-gray-500/10 text-gray-400';
}

function indicatorColor(status: string): string {
  if (status === 'green') return 'bg-green-500 shadow-sm shadow-green-500/40';
  if (status === 'red') return 'bg-red-500 shadow-sm shadow-red-500/40';
  if (status === 'yellow') return 'bg-yellow-500 shadow-sm shadow-yellow-500/40';
  return 'bg-gray-500';
}
