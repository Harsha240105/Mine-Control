import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import dgram from 'dgram';
import https from 'https';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { getDatabase } from '../database';
import { minecraftServer } from '../services/minecraftServer';

const router = Router();

type JoinMode = 'java_only' | 'java_bedrock' | 'premium_only' | 'offline';
type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';
type ComponentKey = 'geyser' | 'floodgate' | 'viaversion' | 'viabackwards';
type ComponentPlatform = 'spigot' | 'velocity' | 'bungeecord' | 'paper';

interface ActiveServer {
  id: string;
  name: string;
  port: number;
  directory: string;
  version: string;
  version_source: string;
  javaPath: string;
  jarFile: string;
  onlineMode: number;
}

interface CompatibilityCheck {
  name: string;
  status: CheckStatus;
  message: string;
  fix?: string;
}

interface InstallResult {
  action: string;
  status: 'installed' | 'updated' | 'skipped' | 'configured' | 'enabled' | 'disabled' | 'warn' | 'failed' | 'restarted';
  detail: string;
}

const PAPER_LIKE = new Set(['paper', 'purpur', 'spigot', 'bukkit', 'folia', 'mohist', 'magma', 'arclight']);
const PROXY_LIKE = new Set(['velocity', 'waterfall', 'bungeecord']);
const MODDED = new Set(['fabric', 'forge', 'neoforge', 'quilt']);

const COMPONENT_LABELS: Record<ComponentKey, string> = {
  geyser: 'Geyser',
  floodgate: 'Floodgate',
  viaversion: 'ViaVersion',
  viabackwards: 'ViaBackwards',
};

router.get('/status', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const active = getActiveServer();
    if (!active) return res.status(400).json({ error: 'No active server' });
    res.json(await buildStatus(active));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/check', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const active = getActiveServer();
    if (!active) return res.status(400).json({ error: 'No active server' });
    const savedMode = getStoredMode(active);
    const allowMultipleVersions = getStoredBoolean(active, 'allow_multiple_versions', false);
    res.json(await runCompatibilityCheck(active, savedMode, allowMultipleVersions));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/check', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const active = getActiveServer();
    if (!active) return res.status(400).json({ error: 'No active server' });
    const mode = normalizeMode(req.body?.mode, getStoredMode(active));
    const allowMultipleVersions = Boolean(req.body?.allowMultipleVersions);
    res.json(await runCompatibilityCheck(active, mode, allowMultipleVersions));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/configure', authMiddleware, requirePermission('server.start'), async (req: AuthRequest, res) => {
  try {
    const active = getActiveServer();
    if (!active) return res.status(400).json({ error: 'No active server' });

    const mode = normalizeMode(req.body?.mode, 'java_only');
    const allowMultipleVersions = Boolean(req.body?.allowMultipleVersions);
    const originalMode = getStoredMode(active);
    const originalOnlineMode = Boolean(active.onlineMode);
    const check = await runCompatibilityCheck(active, mode, allowMultipleVersions);
    const blocking = check.checks.filter((item) => item.status === 'fail');

    if (blocking.length > 0) {
      return res.status(400).json({
        error: 'Compatibility checks failed. Fix the blocking issues before applying changes.',
        checks: check.checks,
        overall: check.overall,
      });
    }

    const results: InstallResult[] = [];
    const onlineMode = mode !== 'offline';
    updateOnlineMode(active, onlineMode);
    storeSetting(active, 'mode', mode);
    storeSetting(active, 'allow_multiple_versions', allowMultipleVersions ? 'true' : 'false');
    results.push({
      action: 'authentication',
      status: onlineMode ? 'enabled' : 'disabled',
      detail: onlineMode
        ? 'Premium authentication is enabled for Java accounts.'
        : 'Offline mode is enabled. Only use this on a private server with players you trust.',
    });

    const software = detectServerSoftware(active);
    const plan = getComponentPlan(software.key, mode, allowMultipleVersions);
    if (mode !== 'java_bedrock') {
      results.push(...setComponentsEnabled(active, ['geyser', 'floodgate'], false));
    }
    if (!allowMultipleVersions) {
      results.push(...setComponentsEnabled(active, ['viaversion', 'viabackwards'], false));
    }
    for (const component of plan.components) {
      const result = await ensureComponent(active, component, plan.platform);
      results.push(result);
    }

    if (mode === 'java_bedrock') {
      results.push(configureGeyser(active, plan.platform));
    }

    if (allowMultipleVersions) {
      results.push({
        action: 'version-range',
        status: 'configured',
        detail: 'Multiple-version support is enabled through ViaVersion. ViaBackwards is added so older clients can join where protocol translation allows it.',
      });
    }

    let restartRequired = plan.components.length > 0 || mode !== originalMode || onlineMode !== originalOnlineMode;
    let restarted = false;
    if (restartRequired && minecraftServer.isRunning) {
      await minecraftServer.stop();
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await minecraftServer.start();
      restarted = true;
      results.push({
        action: 'server-restart',
        status: 'restarted',
        detail: 'Server restarted so compatibility settings can take effect.',
      });
    }

    const refreshed = getActiveServer() || active;
    res.json({
      success: true,
      mode,
      allowMultipleVersions,
      restartRequired,
      restarted,
      results,
      status: await buildStatus(refreshed),
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

function getActiveServer(): ActiveServer | null {
  const db = getDatabase();
  const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
  if (!activeId) return null;
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(activeId) as ActiveServer | undefined;
  return server || null;
}

function compatKey(active: ActiveServer, key: string): string {
  return `compatibility:${active.id}:${key}`;
}

function storeSetting(active: ActiveServer, key: string, value: string) {
  const db = getDatabase();
  db.prepare('INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)').run(compatKey(active, key), value);
}

function getStoredString(active: ActiveServer, key: string, fallback: string): string {
  const db = getDatabase();
  return (db.prepare('SELECT value FROM server_config WHERE key = ?').get(compatKey(active, key)) as any)?.value || fallback;
}

function getStoredBoolean(active: ActiveServer, key: string, fallback: boolean): boolean {
  const raw = getStoredString(active, key, fallback ? 'true' : 'false');
  return raw === 'true';
}

function getStoredMode(active: ActiveServer): JoinMode {
  const stored = getStoredString(active, 'mode', '');
  if (isJoinMode(stored)) return stored;
  const components = scanComponents(active.directory);
  if (components.geyser.installed) return 'java_bedrock';
  if (active.onlineMode) return 'premium_only';
  return 'offline';
}

function isJoinMode(value: string): value is JoinMode {
  return ['java_only', 'java_bedrock', 'premium_only', 'offline'].includes(value);
}

function normalizeMode(value: unknown, fallback: JoinMode): JoinMode {
  return typeof value === 'string' && isJoinMode(value) ? value : fallback;
}

async function buildStatus(active: ActiveServer) {
  const software = detectServerSoftware(active);
  const components = scanComponents(active.directory);
  const mode = getStoredMode(active);
  const allowMultipleVersions = getStoredBoolean(active, 'allow_multiple_versions', components.viaversion.installed);
  const compatibilityTable = getCompatibilityTable(active, software.key, allowMultipleVersions);
  const check = await runCompatibilityCheck(active, mode, allowMultipleVersions);
  const connection = await getJoinInfo(active, components);
  const bedrockEnabled = components.geyser.installed;
  const floodgateEnabled = components.floodgate.installed;

  return {
    mode,
    allowMultipleVersions,
    serverSoftware: software.label,
    serverSoftwareKey: software.key,
    serverVersion: active.version || versionFromJar(active.jarFile) || 'Unknown',
    serverDirectory: active.directory,
    serverPort: active.port || 25565,
    recommendedClientVersions: compatibilityTable,
    compatibilityTable,
    components,
    bedrockEnabled,
    floodgateEnabled,
    offlineMode: !Boolean(active.onlineMode),
    premiumAuth: Boolean(active.onlineMode),
    compatibilityStatus: check.overall,
    statusMessage: statusMessage(check.overall),
    indicators: [
      { label: 'Server Software', status: software.key === 'custom' || software.key === 'unknown' ? 'yellow' : 'green' },
      { label: 'Server Version', status: active.version || versionFromJar(active.jarFile) ? 'green' : 'yellow' },
      { label: 'Bedrock Support', status: bedrockEnabled ? (floodgateEnabled ? 'green' : 'yellow') : 'gray' },
      { label: 'Multi-Version', status: allowMultipleVersions ? (components.viaversion.installed ? 'green' : 'yellow') : 'gray' },
      { label: 'Authentication', status: active.onlineMode ? 'green' : 'yellow' },
      { label: 'Health', status: check.overall === 'pass' ? 'green' : check.overall === 'fail' ? 'red' : 'yellow' },
    ],
    joinInfo: connection,
    trustedSources: [
      { name: 'GeyserMC Downloads API', url: 'https://download.geysermc.org' },
      { name: 'Hangar by PaperMC', url: 'https://hangar.papermc.io' },
      { name: 'ViaVersion releases', url: 'https://hangar.papermc.io/ViaVersion/ViaVersion' },
    ],
  };
}

async function runCompatibilityCheck(active: ActiveServer, mode: JoinMode, allowMultipleVersions: boolean) {
  const checks: CompatibilityCheck[] = [];
  const software = detectServerSoftware(active);
  const components = scanComponents(active.directory);
  const plan = getComponentPlan(software.key, mode, allowMultipleVersions);

  checks.push(checkJava(active.javaPath));

  if (software.key === 'unknown' || software.key === 'custom') {
    checks.push({
      name: 'Server Software',
      status: 'warn',
      message: 'MineControl could not identify this server jar. Java-only settings can still be applied, but automatic plugin selection may be limited.',
      fix: 'Use Paper, Purpur, Spigot, or Velocity for the smoothest compatibility setup.',
    });
  } else {
    checks.push({
      name: 'Server Software',
      status: 'pass',
      message: `${software.label} detected.`,
    });
  }

  if (mode === 'java_bedrock' && !plan.supported) {
    checks.push({
      name: 'Bedrock Compatibility',
      status: 'fail',
      message: plan.reason || `${software.label} cannot be configured automatically for Bedrock support.`,
      fix: 'Switch to Paper or Purpur, or configure a supported proxy manually.',
    });
  } else if (mode === 'java_bedrock') {
    checks.push({
      name: 'Bedrock Compatibility',
      status: components.geyser.installed && components.floodgate.installed ? 'pass' : 'warn',
      message: components.geyser.installed && components.floodgate.installed
        ? 'Geyser and Floodgate are installed.'
        : `MineControl will install ${plan.components.map((item) => COMPONENT_LABELS[item]).join(', ')} from trusted sources.`,
    });
  }

  if (allowMultipleVersions && !plan.supported) {
    checks.push({
      name: 'Multiple Versions',
      status: 'fail',
      message: plan.reason || 'Multi-version plugins are not available for this server software through automatic setup.',
      fix: 'Use Paper, Purpur, Spigot, or Velocity.',
    });
  } else if (allowMultipleVersions) {
    checks.push({
      name: 'Multiple Versions',
      status: components.viaversion.installed ? 'pass' : 'warn',
      message: components.viaversion.installed
        ? 'ViaVersion is installed.'
        : 'MineControl will install ViaVersion and ViaBackwards from Hangar.',
    });
  }

  checks.push(...checkPluginConflicts(components, mode, allowMultipleVersions));
  checks.push(await checkTcpPort(active.port || 25565, minecraftServer.isRunning));
  if (mode === 'java_bedrock') checks.push(await checkUdpPort(19132));

  const props = readServerProperties(active.directory);
  const serverIp = props['server-ip'] || '';
  if (serverIp === '127.0.0.1' || serverIp.toLowerCase() === 'localhost') {
    checks.push({
      name: 'Network Binding',
      status: 'warn',
      message: `server-ip is set to ${serverIp}, so friends outside this PC may not connect.`,
      fix: 'MineControl will set server-ip to empty when applying compatibility settings.',
    });
  } else {
    checks.push({
      name: 'Network Binding',
      status: 'pass',
      message: 'Server is configured to listen on all network interfaces.',
    });
  }

  const overall = checks.some((item) => item.status === 'fail')
    ? 'fail'
    : checks.some((item) => item.status === 'warn')
      ? 'warn'
      : 'pass';

  return {
    overall,
    checks,
    restrictions: getRestrictions(active, software.key, mode, allowMultipleVersions),
  };
}

function checkJava(javaPath: string): CompatibilityCheck {
  try {
    const output = execSync(`"${javaPath || 'java'}" -version 2>&1`, { encoding: 'utf-8', timeout: 5000 });
    const firstLine = output.split(/\r?\n/)[0] || 'Java found';
    const major = parseJavaMajor(output);
    if (major && major < 17) {
      return {
        name: 'Java Version',
        status: 'fail',
        message: `${firstLine}. Java 17 or newer is required by current compatibility components.`,
        fix: 'Install Java 21 or set a newer Java path in Settings.',
      };
    }
    if (major && major < 21) {
      return {
        name: 'Java Version',
        status: 'warn',
        message: `${firstLine}. Java 21+ is recommended for modern Minecraft servers.`,
        fix: 'Install Java 21 for the best compatibility.',
      };
    }
    return { name: 'Java Version', status: 'pass', message: firstLine };
  } catch {
    return {
      name: 'Java Version',
      status: 'fail',
      message: 'Java was not found.',
      fix: 'Install Java 21 or set a valid Java path in Settings.',
    };
  }
}

function parseJavaMajor(output: string): number | null {
  const quoted = output.match(/version "([^"]+)"/i)?.[1];
  if (!quoted) return null;
  if (quoted.startsWith('1.')) return parseInt(quoted.split('.')[1], 10) || null;
  return parseInt(quoted.split('.')[0], 10) || null;
}

function getComponentPlan(serverSoftware: string, mode: JoinMode, allowMultipleVersions: boolean) {
  const components: ComponentKey[] = [];
  const supportsPaperPlugins = PAPER_LIKE.has(serverSoftware) || serverSoftware === 'custom' || serverSoftware === 'unknown';
  const supportsProxyPlugins = PROXY_LIKE.has(serverSoftware);
  const modded = MODDED.has(serverSoftware);
  const platform: ComponentPlatform = supportsProxyPlugins
    ? serverSoftware === 'velocity' ? 'velocity' : 'bungeecord'
    : 'spigot';

  if (modded) {
    return {
      supported: mode !== 'java_bedrock' && !allowMultipleVersions,
      platform,
      components,
      reason: 'Fabric, Forge, NeoForge, and Quilt need mod-specific compatibility files. MineControl currently avoids automatic mod installation for safety.',
    };
  }

  if (!supportsPaperPlugins && !supportsProxyPlugins) {
    return {
      supported: mode !== 'java_bedrock' && !allowMultipleVersions,
      platform,
      components,
      reason: 'This server software does not expose a known plugin platform for automatic compatibility setup.',
    };
  }

  if (mode === 'java_bedrock') {
    components.push('geyser', 'floodgate');
  }
  if (allowMultipleVersions) {
    components.push('viaversion', 'viabackwards');
  }

  return { supported: true, platform, components: unique(components), reason: '' };
}

async function ensureComponent(active: ActiveServer, component: ComponentKey, platform: ComponentPlatform): Promise<InstallResult> {
  const pluginsDir = path.join(active.directory, 'plugins');
  fs.mkdirSync(pluginsDir, { recursive: true });
  const existing = findComponentJar(active.directory, component);
  if (existing?.enabled) {
    return {
      action: component,
      status: 'skipped',
      detail: `${COMPONENT_LABELS[component]} is already installed.`,
    };
  }
  if (existing?.installed && !existing.enabled) {
    const enabled = setComponentEnabled(active, component, true);
    if (enabled) {
      return {
        action: component,
        status: 'enabled',
        detail: `${COMPONENT_LABELS[component]} was already installed and has been enabled.`,
      };
    }
  }

  const target = await resolveComponentDownload(component, platform);
  if (!target) {
    return {
      action: component,
      status: 'warn',
      detail: `MineControl could not resolve a trusted download for ${COMPONENT_LABELS[component]} on ${platform}.`,
    };
  }

  const destPath = path.join(pluginsDir, target.fileName);
  await downloadFile(target.url, destPath, target.sha256);
  registerPlugin(COMPONENT_LABELS[component], target.version, target.fileName);

  return {
    action: component,
    status: existing ? 'updated' : 'installed',
    detail: `${COMPONENT_LABELS[component]} ${target.version} installed from ${target.source}.`,
  };
}

function setComponentsEnabled(active: ActiveServer, components: ComponentKey[], enabled: boolean): InstallResult[] {
  const results: InstallResult[] = [];
  for (const component of components) {
    const changed = setComponentEnabled(active, component, enabled);
    if (changed) {
      results.push({
        action: component,
        status: enabled ? 'enabled' : 'disabled',
        detail: `${COMPONENT_LABELS[component]} ${enabled ? 'enabled' : 'disabled'} for the selected compatibility mode.`,
      });
    }
  }
  return results;
}

function setComponentEnabled(active: ActiveServer, component: ComponentKey, enabled: boolean): boolean {
  const state = findComponentJar(active.directory, component);
  if (!state?.installed || !state.file) return false;
  if (state.enabled === enabled) return false;

  const pluginsDir = path.join(active.directory, 'plugins');
  const currentPath = path.join(pluginsDir, state.file);
  const targetPath = enabled
    ? path.join(pluginsDir, state.file.replace(/\.disabled$/i, ''))
    : `${currentPath}.disabled`;

  if (!fs.existsSync(currentPath)) return false;
  fs.renameSync(currentPath, targetPath);

  const db = getDatabase();
  const pluginName = path.basename(targetPath).replace(/\.jar(?:\.disabled)?$/i, '');
  db.prepare('UPDATE plugins SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, pluginName);
  return true;
}

async function resolveComponentDownload(component: ComponentKey, platform: ComponentPlatform) {
  if (component === 'geyser' || component === 'floodgate') {
    const geyserPlatform = getGeyserPlatform(component, platform);
    const project = component === 'geyser' ? 'geyser' : 'floodgate';
    const build = await httpsJson<any>(`https://download.geysermc.org/v2/projects/${project}/versions/latest/builds/latest`);
    const download = build.downloads?.[geyserPlatform];
    if (!download?.name) return null;
    return {
      url: `https://download.geysermc.org/v2/projects/${project}/versions/latest/builds/latest/downloads/${geyserPlatform}`,
      fileName: download.name,
      sha256: download.sha256 || '',
      version: `${build.version || 'latest'}+${build.build || 'latest'}`,
      source: 'GeyserMC',
    };
  }

  const slug = component === 'viaversion' ? 'ViaVersion' : 'ViaBackwards';
  const latest = await httpsText(`https://hangar.papermc.io/api/v1/projects/ViaVersion/${slug}/latestrelease`);
  const version = latest.replace(/^"|"$/g, '').trim();
  const versionInfo = await httpsJson<any>(`https://hangar.papermc.io/api/v1/projects/ViaVersion/${slug}/versions/${encodeURIComponent(version)}`);
  const hangarPlatform = platform === 'velocity' ? 'VELOCITY' : 'PAPER';
  const download = versionInfo.downloads?.[hangarPlatform] || versionInfo.downloads?.PAPER;
  if (!download?.downloadUrl || !download?.fileInfo?.name) return null;
  return {
    url: download.downloadUrl,
    fileName: download.fileInfo.name,
    sha256: download.fileInfo.sha256Hash || '',
    version: versionInfo.name || version,
    source: 'Hangar',
  };
}

function getGeyserPlatform(component: ComponentKey, platform: ComponentPlatform): string {
  if (platform === 'velocity') return 'velocity';
  if (platform === 'bungeecord') return component === 'floodgate' ? 'bungee' : 'bungeecord';
  return 'spigot';
}

function configureGeyser(active: ActiveServer, platform: ComponentPlatform): InstallResult {
  const geyserFolder = platform === 'velocity'
    ? 'Geyser-Velocity'
    : platform === 'bungeecord'
      ? 'Geyser-BungeeCord'
      : 'Geyser-Spigot';
  const configDir = path.join(active.directory, 'plugins', geyserFolder);
  const configPath = path.join(configDir, 'config.yml');
  fs.mkdirSync(configDir, { recursive: true });

  const base = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, 'utf-8')
    : [
      'bedrock:',
      '  address: 0.0.0.0',
      '  port: 19132',
      'remote:',
      '  address: 127.0.0.1',
      `  port: ${active.port || 25565}`,
      '  auth-type: floodgate',
      '',
    ].join('\n');

  const updated = updateYamlValue(
    updateYamlValue(
      updateYamlValue(
        updateYamlValue(base, 'bedrock', 'address', '0.0.0.0'),
        'bedrock',
        'port',
        '19132',
      ),
      'remote',
      'port',
      String(active.port || 25565),
    ),
    'remote',
    'auth-type',
    'floodgate',
  );

  fs.writeFileSync(configPath, updated.endsWith('\n') ? updated : `${updated}\n`, 'utf-8');
  return {
    action: 'geyser-config',
    status: 'configured',
    detail: `Geyser configured for Bedrock UDP 19132 and Java localhost:${active.port || 25565}.`,
  };
}

function updateYamlValue(content: string, section: string, key: string, value: string): string {
  const lines = content.split(/\r?\n/);
  let sectionIndex = lines.findIndex((line) => line.trim() === `${section}:`);
  if (sectionIndex === -1) {
    lines.push(`${section}:`);
    sectionIndex = lines.length - 1;
  }

  let insertAt = sectionIndex + 1;
  for (let i = sectionIndex + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i]) && lines[i].trim().endsWith(':')) break;
    insertAt = i + 1;
    const match = lines[i].match(/^\s*([^:#]+):/);
    if (match && match[1].trim() === key) {
      lines[i] = `  ${key}: ${value}`;
      return lines.join('\n');
    }
  }

  lines.splice(insertAt, 0, `  ${key}: ${value}`);
  return lines.join('\n');
}

function updateOnlineMode(active: ActiveServer, enabled: boolean) {
  const db = getDatabase();
  db.prepare("UPDATE servers SET onlineMode = ?, updated_at = datetime('now') WHERE id = ?").run(enabled ? 1 : 0, active.id);
  writeServerProperties(active.directory, {
    'online-mode': enabled ? 'true' : 'false',
    'server-port': String(active.port || 25565),
    'server-ip': '',
  });
}

function writeServerProperties(serverDir: string, updates: Record<string, string>) {
  const propsPath = path.join(serverDir, 'server.properties');
  let content = fs.existsSync(propsPath) ? fs.readFileSync(propsPath, 'utf-8') : '';
  for (const [key, value] of Object.entries(updates)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `${content.endsWith('\n') || content.length === 0 ? '' : '\n'}${key}=${value}\n`;
    }
  }
  fs.writeFileSync(propsPath, content.endsWith('\n') ? content : `${content}\n`, 'utf-8');
}

function readServerProperties(serverDir: string): Record<string, string> {
  const propsPath = path.join(serverDir, 'server.properties');
  if (!fs.existsSync(propsPath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(propsPath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function scanComponents(serverDir: string) {
  const pluginsDir = path.join(serverDir, 'plugins');
  const files = fs.existsSync(pluginsDir) ? fs.readdirSync(pluginsDir) : [];
  return {
    geyser: componentState(files, 'geyser'),
    floodgate: componentState(files, 'floodgate'),
    viaversion: componentState(files, 'viaversion'),
    viabackwards: componentState(files, 'viabackwards'),
  };
}

function componentState(files: string[], key: ComponentKey) {
  const match = files.find((file) => file.toLowerCase().includes(key) && file.toLowerCase().includes('.jar'));
  return {
    installed: Boolean(match),
    enabled: Boolean(match && !match.toLowerCase().endsWith('.disabled')),
    file: match || '',
  };
}

function findComponentJar(serverDir: string, key: ComponentKey) {
  const state = scanComponents(serverDir)[key];
  return state.installed ? state : null;
}

function registerPlugin(name: string, version: string, fileName: string) {
  const db = getDatabase();
  const pluginName = fileName.replace(/\.jar$/i, '');
  db.prepare(
    'INSERT OR REPLACE INTO plugins (name, version, enabled, description, author, main_class) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(pluginName, version, 1, `${name} compatibility component`, name, '');
}

function detectServerSoftware(active: ActiveServer): { key: string; label: string } {
  const source = `${active.version_source || ''} ${active.jarFile || ''}`.toLowerCase();
  const pairs: Array<[string, string[]]> = [
    ['paper', ['papermc', 'paper-']],
    ['purpur', ['purpur']],
    ['fabric', ['fabric']],
    ['forge', ['forge']],
    ['neoforge', ['neoforge']],
    ['quilt', ['quilt']],
    ['spigot', ['spigot']],
    ['bukkit', ['bukkit']],
    ['velocity', ['velocity']],
    ['waterfall', ['waterfall']],
    ['folia', ['folia']],
    ['mohist', ['mohist']],
    ['magma', ['magma']],
    ['arclight', ['arclight']],
    ['vanilla', ['mojang', 'vanilla-']],
  ];
  for (const [key, needles] of pairs) {
    if (needles.some((needle) => source.includes(needle))) {
      return { key, label: labelForSoftware(key) };
    }
  }
  if (!active.jarFile) return { key: 'unknown', label: 'Unknown' };
  return { key: 'custom', label: 'Custom' };
}

function labelForSoftware(key: string): string {
  const labels: Record<string, string> = {
    paper: 'Paper',
    purpur: 'Purpur',
    fabric: 'Fabric',
    forge: 'Forge',
    neoforge: 'NeoForge',
    quilt: 'Quilt',
    spigot: 'Spigot',
    bukkit: 'Bukkit',
    velocity: 'Velocity',
    waterfall: 'Waterfall',
    bungeecord: 'BungeeCord',
    folia: 'Folia',
    mohist: 'Mohist',
    magma: 'Magma',
    arclight: 'Arclight',
    vanilla: 'Vanilla',
    custom: 'Custom',
    unknown: 'Unknown',
  };
  return labels[key] || 'Custom';
}

function getCompatibilityTable(active: ActiveServer, serverSoftware: string, allowMultipleVersions: boolean) {
  const version = active.version || versionFromJar(active.jarFile) || 'Unknown';
  const supportsVia = PAPER_LIKE.has(serverSoftware) || PROXY_LIKE.has(serverSoftware) || serverSoftware === 'custom' || serverSoftware === 'unknown';
  const versionMajor = getMajorMinor(version);

  if (!allowMultipleVersions) {
    return [
      {
        recommended: version,
        range: version === 'Unknown' ? 'Current server version only' : version,
        notes: 'Only clients matching the server protocol are expected to join.',
      },
    ];
  }

  if (!supportsVia) {
    return [
      {
        recommended: version,
        range: version === 'Unknown' ? 'Unknown' : version,
        notes: 'Automatic version translation is not available for this server software.',
      },
    ];
  }

  return [
    {
      recommended: version,
      range: versionMajor ? `${versionMajor}.x plus compatible newer/older clients through ViaVersion` : 'ViaVersion supported range',
      notes: 'ViaVersion supports newer clients; ViaBackwards extends support for older clients where protocol features can be translated.',
    },
    {
      recommended: 'Latest stable Paper/Purpur',
      range: 'Best results on modern Paper-compatible releases',
      notes: 'Some items, mobs, resource packs, and new mechanics may not translate perfectly across major versions.',
    },
  ];
}

function getRestrictions(active: ActiveServer, serverSoftware: string, mode: JoinMode, allowMultipleVersions: boolean): string[] {
  const restrictions: string[] = [];
  if (mode === 'offline') {
    restrictions.push('Offline mode disables Mojang/Microsoft Java account authentication. Use it only for a private server.');
  }
  if (mode === 'java_bedrock') {
    restrictions.push('Bedrock players must use the Bedrock address and UDP port 19132. Console players may need DNS or LAN helper setup depending on the owner network.');
    restrictions.push('Bedrock gameplay is translated through Geyser, so some Java-only mechanics, mods, resource packs, and plugin UI flows may behave differently.');
  }
  if (allowMultipleVersions) {
    restrictions.push('Protocol translation cannot add features that do not exist in an older client.');
  }
  if (MODDED.has(serverSoftware)) {
    restrictions.push('Modded server software needs mod-specific compatibility files and is not automatically configured by MineControl yet.');
  }
  if (!active.onlineMode && mode !== 'offline') {
    restrictions.push('Premium authentication will be enabled when settings are applied.');
  }
  return restrictions;
}

function checkPluginConflicts(components: ReturnType<typeof scanComponents>, mode: JoinMode, allowMultipleVersions: boolean): CompatibilityCheck[] {
  const checks: CompatibilityCheck[] = [];
  if (components.geyser.installed && !components.floodgate.installed && mode === 'java_bedrock') {
    checks.push({
      name: 'Geyser and Floodgate',
      status: 'warn',
      message: 'Geyser is installed without Floodgate. Bedrock players would need Java accounts unless Floodgate is installed.',
      fix: 'MineControl will install Floodgate.',
    });
  }
  if (components.floodgate.installed && !components.geyser.installed && mode === 'java_bedrock') {
    checks.push({
      name: 'Floodgate Dependency',
      status: 'warn',
      message: 'Floodgate is installed without Geyser. Bedrock players still need Geyser to connect.',
      fix: 'MineControl will install Geyser.',
    });
  }
  if (components.viabackwards.installed && !components.viaversion.installed && allowMultipleVersions) {
    checks.push({
      name: 'ViaBackwards Dependency',
      status: 'warn',
      message: 'ViaBackwards requires ViaVersion.',
      fix: 'MineControl will install ViaVersion.',
    });
  }
  if (!components.geyser.enabled && components.geyser.installed && mode === 'java_bedrock') {
    checks.push({
      name: 'Disabled Geyser',
      status: 'warn',
      message: 'A Geyser jar is present but appears disabled.',
      fix: 'Remove the .disabled suffix or reinstall through MineControl.',
    });
  }
  return checks;
}

async function checkTcpPort(port: number, serverRunning: boolean): Promise<CompatibilityCheck> {
  const inUse = await tcpPortInUse(port);
  if (inUse && !serverRunning) {
    return {
      name: `Java Port ${port}`,
      status: 'warn',
      message: `TCP port ${port} is already in use. If this is not your Minecraft server, friends may not connect.`,
      fix: 'Stop the other process or change the server port.',
    };
  }
  if (inUse && serverRunning) {
    return {
      name: `Java Port ${port}`,
      status: 'pass',
      message: `TCP port ${port} is in use by the running server.`,
    };
  }
  return {
    name: `Java Port ${port}`,
    status: 'pass',
    message: `TCP port ${port} is available.`,
  };
}

async function checkUdpPort(port: number): Promise<CompatibilityCheck> {
  const available = await udpPortAvailable(port);
  if (!available) {
    return {
      name: `Bedrock Port ${port}`,
      status: 'warn',
      message: `UDP port ${port} appears to be in use. Bedrock players use this port for Geyser.`,
      fix: 'Close the other service or change the Geyser Bedrock port after setup.',
    };
  }
  return {
    name: `Bedrock Port ${port}`,
    status: 'pass',
    message: `UDP port ${port} is available for Bedrock players.`,
  };
}

function tcpPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => server.close(() => resolve(false)));
    server.listen(port, '0.0.0.0');
  });
}

function udpPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', () => {
      socket.close();
      resolve(false);
    });
    socket.once('listening', () => {
      socket.close();
      resolve(true);
    });
    socket.bind(port, '0.0.0.0');
  });
}

async function getJoinInfo(active: ActiveServer, components: ReturnType<typeof scanComponents>) {
  const lan = getLanAddress(active.port || 25565);
  const publicIp = await getPublicIp();
  const db = getDatabase();
  const tunnelAddress = (db.prepare('SELECT value FROM server_config WHERE key = ?').get('playitAddress') as any)?.value || '';
  const javaAddress = tunnelAddress || (publicIp ? `${publicIp}:${active.port || 25565}` : `localhost:${active.port || 25565}`);
  const bedrockAddress = components.geyser.installed
    ? (tunnelAddress || (publicIp ? `${publicIp}:19132` : 'localhost:19132'))
    : '';

  return {
    javaAddress,
    bedrockAddress,
    localAddress: `localhost:${active.port || 25565}`,
    lanAddress: lan,
    tunnelAddress,
    dnsAddress: tunnelAddress,
    bedrockPort: 19132,
    instructions: {
      java: 'Java players use Multiplayer -> Direct Connection, then paste the Java address.',
      bedrockMobile: 'Bedrock mobile and Windows players use Play -> Servers -> Add Server, then enter the Bedrock address and port 19132.',
      xbox: 'Xbox players usually need a LAN helper or DNS method to add custom servers.',
      playstation: 'PlayStation players usually need a LAN helper or DNS method to add custom servers.',
      switch: 'Nintendo Switch support depends on the owner network and usually needs DNS or LAN helper setup.',
    },
  };
}

function getLanAddress(port: number): string {
  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('127.')) {
        return `${addr.address}:${port}`;
      }
    }
  }
  return '';
}

async function getPublicIp(): Promise<string> {
  try {
    const body = await httpsText('https://api.ipify.org?format=json');
    return JSON.parse(body).ip || '';
  } catch {
    return '';
  }
}

function versionFromJar(jarFile: string): string {
  return (jarFile || '')
    .replace(/^(paper|purpur|vanilla|spigot|bukkit|fabric|forge|neoforge|quilt|folia|velocity|waterfall)-/i, '')
    .replace(/\.jar$/i, '');
}

function getMajorMinor(version: string): string {
  const match = version.match(/^(\d+\.\d+)/);
  return match ? match[1] : '';
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function statusMessage(status: string): string {
  if (status === 'pass') return 'Compatibility setup looks healthy.';
  if (status === 'fail') return 'Compatibility setup needs attention before changes can be applied.';
  return 'Compatibility setup is usable, with warnings to review.';
}

function httpsText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'MineControl-OS/1.0.18' } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        httpsText(new URL(response.headers.location, url).toString()).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      let data = '';
      response.setEncoding('utf-8');
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function httpsJson<T>(url: string): Promise<T> {
  return JSON.parse(await httpsText(url)) as T;
}

function downloadFile(url: string, destination: string, expectedSha256?: string): Promise<void> {
  const tempPath = `${destination}.download`;
  return new Promise((resolve, reject) => {
    const start = (targetUrl: string) => {
      const file = fs.createWriteStream(tempPath);
      https.get(targetUrl, { headers: { 'User-Agent': 'MineControl-OS/1.0.27 (contact@minecontrol.dev)' } }, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          fs.rmSync(tempPath, { force: true });
          response.resume();
          start(new URL(response.headers.location, targetUrl).toString());
          return;
        }
        if (response.statusCode !== 200) {
          file.close();
          fs.rmSync(tempPath, { force: true });
          response.resume();
          reject(new Error(`Failed to download ${targetUrl}: HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            try {
              if (expectedSha256) {
                const hash = crypto.createHash('sha256').update(fs.readFileSync(tempPath)).digest('hex');
                if (hash.toLowerCase() !== expectedSha256.toLowerCase()) {
                  fs.rmSync(tempPath, { force: true });
                  reject(new Error('Downloaded file failed SHA-256 verification.'));
                  return;
                }
              }
              fs.renameSync(tempPath, destination);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
      }).on('error', (error) => {
        file.close();
        fs.rmSync(tempPath, { force: true });
        reject(error);
      });
    };
    start(url);
  });
}

export default router;
