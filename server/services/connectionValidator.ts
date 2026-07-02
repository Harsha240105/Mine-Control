import net from 'net';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dns from 'dns';
import https from 'https';
import { mcPing } from './mcPing';
import { minecraftServer } from './minecraftServer';
import { getDatabase } from '../database';
import { resolveMinecraftDir } from '../paths';
import { firewallManager } from './firewallManager';

export interface ValidationResult {
  javaInstalled: { status: 'pass' | 'fail' | 'skip'; message: string };
  serverRunning: { status: 'pass' | 'fail' | 'skip'; message: string };
  doneMessage: { status: 'pass' | 'fail' | 'skip'; message: string };
  tcpPort: { status: 'pass' | 'fail' | 'skip'; message: string };
  mcPing: { status: 'pass' | 'fail' | 'skip'; message: string; data?: any };
  localhost: { status: 'pass' | 'fail' | 'skip'; message: string };
  lanAccessible: { status: 'pass' | 'fail' | 'skip'; message: string };
  firewall: { status: 'pass' | 'fail' | 'skip'; message: string };
  playit: { status: 'pass' | 'fail' | 'skip'; message: string };
  authMode: { status: 'pass' | 'fail' | 'skip'; message: string };
  portBinding: { status: 'pass' | 'fail' | 'skip'; message: string };
  serverProperties: { status: 'pass' | 'fail' | 'skip'; message: string };
}

function checkTcpPort(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => { sock.destroy(); resolve(false); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

export async function validateServer(port?: number): Promise<ValidationResult> {
  const config = minecraftServer.getConfig();
  const targetPort = port || config?.port || 25565;
  const mcDir = resolveMinecraftDir();
  const serverRunning = minecraftServer.isRunning;
  const serverState = minecraftServer.state;

  const result: ValidationResult = {
    javaInstalled: { status: 'skip', message: 'Not checked' },
    serverRunning: { status: 'skip', message: 'Not checked' },
    doneMessage: { status: 'skip', message: 'Not checked' },
    tcpPort: { status: 'skip', message: 'Not checked' },
    mcPing: { status: 'skip', message: 'Not checked' },
    localhost: { status: 'skip', message: 'Not checked' },
    lanAccessible: { status: 'skip', message: 'Not checked' },
    firewall: { status: 'skip', message: 'Not checked' },
    playit: { status: 'skip', message: 'Not checked' },
    authMode: { status: 'skip', message: 'Not checked' },
    portBinding: { status: 'skip', message: 'Not checked' },
    serverProperties: { status: 'skip', message: 'Not checked' },
  };

  // 1. Java Installed
  try {
    const out = execSync('java -version 2>&1', { encoding: 'utf-8', timeout: 5000 });
    const verMatch = out.match(/version "(\d+)/);
    if (verMatch) {
      const major = parseInt(verMatch[1], 10);
      result.javaInstalled = {
        status: major >= 17 ? 'pass' : 'fail',
        message: major >= 17 ? `Java ${major} is installed` : `Java ${major} is too old. Install Java 17+ from https://adoptium.net/`,
      };
    } else {
      result.javaInstalled = { status: 'fail', message: 'Java not found in PATH. Install Java from https://adoptium.net/' };
    }
  } catch {
    result.javaInstalled = { status: 'fail', message: 'Java is not installed or not in PATH. Install Java 17+ from https://adoptium.net/' };
  }

  // 2. Server Running
  result.serverRunning = {
    status: serverRunning ? 'pass' : 'fail',
    message: serverRunning ? 'Server process is running' :
             serverState === 'failed' ? 'Server has failed to start. Check the console for error details.' :
             serverState === 'starting' ? 'Server is still starting up. Wait for the "Done" message.' :
             'Server is not running. Click Start to launch the server.',
  };

  // 3. Done Message
  result.doneMessage = {
    status: serverRunning ? 'pass' : (serverState === 'failed' ? 'fail' : 'skip'),
    message: serverRunning ? 'Server reached "Done" and is accepting connections' :
             serverState === 'failed' ? 'Server did not reach "Done" — check console for errors (wrong Java version, corrupted jar, or port conflict)' :
             'Server not started yet',
  };

  // 4. TCP Port Check
  if (serverRunning) {
    const portOpen = await checkTcpPort('127.0.0.1', targetPort);
    if (portOpen) {
      result.tcpPort = { status: 'pass', message: `Port ${targetPort} is open and accepting TCP connections` };
    } else {
      // Check if something else is on that port
      let portInfo = '';
      try {
        const netstatOut = execSync(`netstat -ano | findstr :${targetPort}`, { encoding: 'utf-8', timeout: 5000 });
        portInfo = netstatOut.trim() || '';
      } catch {}
      if (portInfo) {
        result.tcpPort = { status: 'fail', message: `Port ${targetPort} is not responding to Minecraft but something is listening: ${portInfo.slice(0, 200)}` };
      } else {
        result.tcpPort = { status: 'fail', message: `Port ${targetPort} is not listening. The server may have crashed or is still starting.` };
      }
    }
  } else {
    result.tcpPort = { status: 'skip', message: 'Server must be running to check port' };
  }

  // 5. Minecraft Ping
  if (serverRunning) {
    const pingResult = await mcPing('127.0.0.1', targetPort, 4000);
    if (pingResult.online) {
      result.mcPing = {
        status: 'pass',
        message: `Minecraft server responded (${pingResult.latency}ms)`,
        data: { latency: pingResult.latency, version: pingResult.version, players: pingResult.players, motd: pingResult.description },
      };
    } else {
      const pingOnline = await checkTcpPort('127.0.0.1', targetPort, 2000);
      if (pingOnline) {
        result.mcPing = { status: 'fail', message: `Port ${targetPort} is open but not responding to Minecraft protocol ping. The server may still be initializing or is running a non-standard version. Error: ${pingResult.error || 'unknown'}` };
      } else {
        result.mcPing = { status: 'fail', message: `Cannot ping Minecraft server — port ${targetPort} is not reachable. ${pingResult.error || ''}` };
      }
    }
  } else {
    result.mcPing = { status: 'skip', message: 'Server must be running to ping' };
  }

  // 6. Localhost Connection
  if (serverRunning) {
    const localOk = await checkTcpPort('localhost', targetPort);
    const localIpOk = await checkTcpPort('127.0.0.1', targetPort);
    if (localOk && localIpOk) {
      result.localhost = { status: 'pass', message: `localhost:${targetPort} and 127.0.0.1:${targetPort} both reachable` };
    } else if (localOk) {
      result.localhost = { status: 'pass', message: `localhost:${targetPort} reachable (127.0.0.1 binding may be restricted)` };
    } else if (localIpOk) {
      result.localhost = { status: 'pass', message: `127.0.0.1:${targetPort} reachable (localhost name resolution may be an issue)` };
    } else {
      result.localhost = { status: 'fail', message: `Neither localhost nor 127.0.0.1 respond on port ${targetPort}. The server is not listening inside this machine.` };
    }
  } else {
    result.localhost = { status: 'skip', message: 'Start the server to test localhost connection' };
  }

  // 7. LAN Accessibility
  if (serverRunning) {
    const ifaces = os.networkInterfaces();
    let lanFound = false;
    for (const addrs of Object.values(ifaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('127.')) {
          lanFound = true;
          const reachable = await checkTcpPort(addr.address, targetPort);
          if (reachable) {
            result.lanAccessible = { status: 'pass', message: `LAN reachable via ${addr.address}:${targetPort}` };
          } else {
            // Check if firewall might be blocking
            if (firewallManager.isAdmin()) {
              const rule = firewallManager.checkRule();
              if (!rule.exists) {
                result.lanAccessible = { status: 'fail', message: `LAN unreachable on ${addr.address}:${targetPort}. Windows Firewall may be blocking — add a firewall rule for TCP port ${targetPort}.` };
              } else if (!rule.enabled) {
                result.lanAccessible = { status: 'fail', message: `LAN unreachable on ${addr.address}:${targetPort}. Firewall rule exists but is disabled.` };
              } else if (rule.port && rule.port !== String(targetPort)) {
                result.lanAccessible = { status: 'fail', message: `LAN unreachable. Firewall rule exists for port ${rule.port} but server is on port ${targetPort}.` };
              } else {
                result.lanAccessible = { status: 'fail', message: `LAN unreachable on ${addr.address}:${targetPort}. Check router settings or antivirus firewall.` };
              }
            } else {
              result.lanAccessible = { status: 'fail', message: `LAN unreachable on ${addr.address}:${targetPort}. Run as Administrator to check firewall status.` };
            }
          }
          break;
        }
      }
      if (result.lanAccessible.status !== 'skip') break;
    }
    if (!lanFound) {
      result.lanAccessible = { status: 'fail', message: 'No LAN network adapter detected. Check your network connection.' };
    }
  } else {
    result.lanAccessible = { status: 'skip', message: 'Start the server to test LAN accessibility' };
  }

  // 8. Firewall
  try {
    if (!firewallManager.isWindows()) {
      result.firewall = { status: 'skip', message: 'Firewall check is Windows-only' };
    } else if (!firewallManager.isAdmin()) {
      result.firewall = { status: 'skip', message: 'Cannot check firewall without Administrator privileges. Run MineControl OS as Administrator.' };
    } else {
      const rule = firewallManager.checkRule();
      if (rule.exists && rule.enabled) {
        const portOk = !rule.port || rule.port === String(targetPort);
        if (portOk) {
          result.firewall = { status: 'pass', message: `Windows Firewall rule "MineControl OS Minecraft" exists and is active for TCP port ${targetPort}` };
        } else {
          result.firewall = { status: 'fail', message: `Firewall rule exists for port ${rule.port} but server uses port ${targetPort}. Use Repai to update the rule.` };
        }
      } else if (rule.exists && !rule.enabled) {
        result.firewall = { status: 'fail', message: 'Firewall rule exists but is disabled. Enable it in Windows Firewall or use the Firewall tab.' };
      } else {
        result.firewall = { status: 'fail', message: `No Windows Firewall rule found for TCP port ${targetPort}. Add a rule to allow Minecraft connections.` };
      }
    }
  } catch (e: any) {
    result.firewall = { status: 'skip', message: `Firewall check error: ${e.message}` };
  }

  // 9. Playit Tunnel
  try {
    const db = getDatabase();
    const playitAddress = (db.prepare("SELECT value FROM server_config WHERE key = 'playitAddress'").get() as any)?.value || '';
    if (!playitAddress) {
      result.playit = { status: 'skip', message: 'Playit.gg not configured. Set up a tunnel in the Connection page for internet access.' };
    } else if (!playitAddress.includes('.')) {
      result.playit = { status: 'fail', message: `Playit.gg address "${playitAddress}" appears invalid. Enter a valid tunnel address (e.g., your-server.playit.gg).` };
    } else {
      const host = playitAddress.replace(/:.*$/, '');
      const lookupOk = await new Promise<boolean>((resolve) => {
        dns.resolve(host, (err) => resolve(!err));
      });
      if (!lookupOk) {
        result.playit = { status: 'fail', message: `Playit.gg domain ${host} does not resolve. Check that the tunnel is running in the Playit.gg agent.` };
      } else if (serverRunning) {
        const pingPort = parseInt(playitAddress.split(':')[1] || String(targetPort));
        const ping = await mcPing(host, pingPort, 5000);
        if (ping.online) {
          result.playit = { status: 'pass', message: `Playit.gg tunnel active (${ping.latency}ms) at ${playitAddress}` };
        } else {
          result.playit = { status: 'fail', message: `Playit.gg tunnel resolves but Minecraft is not responding through it. Check that the tunnel points to localhost:${targetPort} in the Playit.gg dashboard.` };
        }
      } else {
        result.playit = { status: 'skip', message: 'Playit.gg configured but server must be running to test tunnel' };
      }
    }
  } catch (e: any) {
    result.playit = { status: 'skip', message: `Playit check error: ${e.message}` };
  }

  // 10. Authentication Mode
  try {
    const propsPath = path.join(mcDir, 'server.properties');
    if (fs.existsSync(propsPath)) {
      const propsContent = fs.readFileSync(propsPath, 'utf-8');
      const omMatch = propsContent.match(/^online-mode=(.*)$/m);
      const espMatch = propsContent.match(/^enforce-secure-profile=(.*)$/m);
      const onlineMode = omMatch ? omMatch[1].trim() !== 'false' : true;
      const enforceSecureProfile = espMatch ? espMatch[1].trim() !== 'false' : true;
      const configOnlineMode = config?.onlineMode !== false;

      if (onlineMode !== configOnlineMode) {
        result.authMode = { status: 'fail', message: `Config says online-mode=${configOnlineMode} but server.properties has online-mode=${onlineMode}. Restart the server to sync.` };
      } else if (!onlineMode && enforceSecureProfile) {
        result.authMode = { status: 'fail', message: 'MISMATCH: online-mode=false but enforce-secure-profile=true. This blocks cracked clients. Set both to false for offline mode.' };
      } else if (onlineMode && !enforceSecureProfile) {
        result.authMode = { status: 'warn' as any, message: 'online-mode=true but enforce-secure-profile=false. Secure profiles are disabled — some premium features may not work.' } as any;
      } else {
        result.authMode = { status: 'pass', message: `Authentication mode: ${onlineMode ? 'Premium (online-mode=true)' : 'Offline (online-mode=false)'} with enforce-secure-profile=${enforceSecureProfile}` };
      }
    } else {
      result.authMode = { status: 'skip', message: 'server.properties not found yet' };
    }
  } catch (e: any) {
    result.authMode = { status: 'skip', message: `Auth check error: ${e.message}` };
  }

  // 11. Port Binding
  try {
    const propsPath = path.join(mcDir, 'server.properties');
    if (fs.existsSync(propsPath)) {
      const propsContent = fs.readFileSync(propsPath, 'utf-8');
      const ipMatch = propsContent.match(/^server-ip=(.*)$/m);
      const portMatch = propsContent.match(/^server-port=(.*)$/m);
      const boundIp = ipMatch ? ipMatch[1].trim() : '';
      const serverPort = portMatch ? portMatch[1].trim() : String(targetPort);

      if (boundIp === '127.0.0.1' || boundIp === 'localhost') {
        result.portBinding = { status: 'fail', message: `server-ip is set to ${boundIp}. External (LAN/internet) connections cannot reach the server. Set server-ip to empty in server.properties.` };
      } else if (boundIp) {
        result.portBinding = { status: 'warn' as any, message: `server-ip is set to "${boundIp}". Make sure this is the correct network interface IP.` } as any;
      } else if (serverPort !== String(targetPort)) {
        result.portBinding = { status: 'fail', message: `server.properties has server-port=${serverPort} but config uses port ${targetPort}. These must match.` };
      } else {
        result.portBinding = { status: 'pass', message: `Server bound to all interfaces (0.0.0.0) on port ${targetPort}` };
      }
    } else {
      result.portBinding = { status: 'skip', message: 'server.properties not found' };
    }
  } catch (e: any) {
    result.portBinding = { status: 'skip', message: `Port binding check error: ${e.message}` };
  }

  // 12. Server Properties Consistency
  try {
    const propsPath = path.join(mcDir, 'server.properties');
    if (!fs.existsSync(propsPath)) {
      result.serverProperties = { status: 'skip', message: 'server.properties not yet generated' };
    } else {
      const content = fs.readFileSync(propsPath, 'utf-8');
      const issues: string[] = [];
      const portMatch = content.match(/^server-port=(\d+)/m);
      if (portMatch && parseInt(portMatch[1]) !== targetPort) {
        issues.push(`server-port=${portMatch[1]} should be ${targetPort}`);
      }
      const ipMatch = content.match(/^server-ip=(.*)$/m);
      if (ipMatch && (ipMatch[1].trim() === '127.0.0.1' || ipMatch[1].trim() === 'localhost')) {
        issues.push('server-ip is bound to localhost');
      }
      if (issues.length === 0) {
        result.serverProperties = { status: 'pass', message: 'server.properties is consistent with current config' };
      } else {
        result.serverProperties = { status: 'fail', message: `server.properties issues: ${issues.join('; ')}` };
      }
    }
  } catch (e: any) {
    result.serverProperties = { status: 'skip', message: `Properties check error: ${e.message}` };
  }

  return result;
}

export interface ConnectionWizardData {
  localAddress: string;
  lanAddress: string;
  lanReachable: boolean;
  publicIp: string;
  port: number;
  onlineMode: boolean;
  serverRunning: boolean;
  serverVersion: string;
  playitAddress: string;
  playitEnabled: boolean;
  playitActive: boolean;
  playitLatency: number | null;
  firewallActive: boolean;
  firewallRuleExists: boolean;
  recommendedMethod: 'localhost' | 'lan' | 'playit' | 'public';
  allMethods: {
    localhost: { available: boolean; address: string; status: 'ready' | 'blocked' | 'offline' };
    lan: { available: boolean; address: string; status: 'reachable' | 'blocked' | 'offline' | 'unknown' };
    playit: { available: boolean; address: string; status: 'online' | 'offline' | 'not_configured' };
    public: { available: boolean; address: string; status: 'reachable' | 'blocked' | 'offline' | 'unknown' };
  };
  validation: ValidationResult | null;
}

export async function getConnectionWizardData(): Promise<ConnectionWizardData> {
  const config = minecraftServer.getConfig();
  const port = config?.port || 25565;
  const mcDir = resolveMinecraftDir();
  const propsPath = path.join(mcDir, 'server.properties');
  const db = getDatabase();
  const playitAddress = (db.prepare("SELECT value FROM server_config WHERE key = 'playitAddress'").get() as any)?.value || '';

  let onlineMode = true;
  try {
    if (fs.existsSync(propsPath)) {
      const props = fs.readFileSync(propsPath, 'utf-8');
      const match = props.match(/^online-mode=(.*)$/m);
      if (match) onlineMode = match[1].trim() !== 'false';
    }
  } catch {}

  let publicIp = '';
  try {
    publicIp = await new Promise((resolve) => {
      https.get('https://api.ipify.org?format=json', (resp: any) => {
        let data = '';
        resp.on('data', (chunk: string) => data += chunk);
        resp.on('end', () => { try { resolve(JSON.parse(data).ip); } catch { resolve(''); } });
      }).on('error', () => resolve(''));
    });
  } catch {}

  const ifaces = os.networkInterfaces();
  let lanAddress = '';
  for (const addrs of Object.values(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('127.')) {
        lanAddress = `${addr.address}:${port}`;
        break;
      }
    }
    if (lanAddress) break;
  }

  let firewallActive = false;
  let firewallRuleExists = false;
  try {
    if (firewallManager.isAdmin()) {
      const rule = firewallManager.checkRule();
      firewallRuleExists = rule.exists;
      firewallActive = rule.exists && rule.enabled;
    }
  } catch {}

  let playitActive = false;
  let playitLatency: number | null = null;
  if (playitAddress && playitAddress.includes('.')) {
    try {
      const lookup = await new Promise<boolean>((resolve) => {
        dns.resolve(playitAddress.replace(/:.*$/, ''), (err: any) => resolve(!err));
      });
      playitActive = lookup;
      if (lookup && minecraftServer.isRunning) {
        const ping = await mcPing(playitAddress.replace(/:.*$/, ''), parseInt(playitAddress.split(':')[1] || String(port)), 3000);
        if (ping.online) playitLatency = ping.latency || null;
      }
    } catch {}
  }

  const serverRunning = minecraftServer.isRunning;

  let lanReachable = false;
  if (lanAddress && serverRunning) {
    const lanHost = lanAddress.split(':')[0];
    try {
      await new Promise<void>((resolve, reject) => {
        const sock = new net.Socket();
        sock.setTimeout(2000);
        sock.on('connect', () => { sock.destroy(); resolve(); });
        sock.on('error', () => { sock.destroy(); reject(); });
        sock.on('timeout', () => { sock.destroy(); reject(); });
        sock.connect(port, lanHost);
      });
      lanReachable = true;
    } catch {}
  }

  let recommendedMethod: 'localhost' | 'lan' | 'playit' | 'public' = 'localhost';
  if (!serverRunning) {
    recommendedMethod = 'localhost';
  } else if (playitActive) {
    recommendedMethod = 'playit';
  } else if (lanReachable) {
    recommendedMethod = 'lan';
  }

  let validation: ValidationResult | null = null;
  if (serverRunning) {
    validation = await validateServer(port);
  }

  return {
    localAddress: `localhost:${port}`,
    lanAddress,
    lanReachable,
    publicIp,
    port,
    onlineMode,
    serverRunning,
    serverVersion: config?.jarFile?.replace(/\.jar$/, '') || 'Unknown',
    playitAddress,
    playitEnabled: !!playitAddress,
    playitActive,
    playitLatency,
    firewallActive,
    firewallRuleExists,
    recommendedMethod,
    allMethods: {
      localhost: {
        available: true,
        address: `localhost:${port}`,
        status: serverRunning ? 'ready' : 'offline',
      },
      lan: {
        available: !!lanAddress,
        address: lanAddress || `unknown:${port}`,
        status: !serverRunning ? 'offline' : lanReachable ? 'reachable' : 'blocked',
      },
      playit: {
        available: !!playitAddress,
        address: playitAddress || '',
        status: !playitAddress ? 'not_configured' : playitActive ? 'online' : 'offline',
      },
      public: {
        available: !!publicIp,
        address: publicIp ? `${publicIp}:${port}` : '',
        status: !serverRunning ? 'offline' : 'unknown',
      },
    },
    validation,
  };
}
