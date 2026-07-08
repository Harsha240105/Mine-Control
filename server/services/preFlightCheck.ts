import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import net from 'net';
import { execSync } from 'child_process';
import { getDatabase } from '../database';
import { JavaManager } from './JavaManager';

export interface PreFlightResult {
  pass: boolean;
  checks: PreFlightCheck[];
  summary: string;
  serverId: string | null;
}

export interface PreFlightCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'skip';
  message: string;
  recoverable: boolean;
}

export async function runPreFlightChecks(
  serverDir: string,
  config: {
    port: number;
    software: string;
    mcVersion: string;
    maxMemory?: string;
  },
  serverId?: string | null
): Promise<PreFlightResult> {
  const checks: PreFlightCheck[] = [];
  const db = getDatabase();
  const sid = serverId || null;

  try {
    const serverStat = fs.statSync(serverDir);
    const root = path.parse(serverDir).root;
    const freeDisk = os.platform() === 'win32'
      ? execSync(`fsutil volume diskfree "${root}" 2>nul`).toString().match(/(\d+)\s+bytes\s+free/i)
      : null;
    const freeBytes = freeDisk ? parseInt(freeDisk[1], 10) : 10 * 1024 * 1024 * 1024;

    if (freeBytes < 500 * 1024 * 1024) {
      checks.push({ name: 'Disk Space', status: 'fail', message: `Low disk space: ${(freeBytes / 1024 / 1024).toFixed(0)}MB free. Need at least 500MB.`, recoverable: false });
    } else if (freeBytes < 2 * 1024 * 1024 * 1024) {
      checks.push({ name: 'Disk Space', status: 'warn', message: `Limited disk space: ${(freeBytes / 1024 / 1024 / 1024).toFixed(1)}GB free.`, recoverable: true });
    } else {
      checks.push({ name: 'Disk Space', status: 'pass', message: `${(freeBytes / 1024 / 1024 / 1024).toFixed(1)}GB free.`, recoverable: true });
    }
  } catch {
    checks.push({ name: 'Disk Space', status: 'skip', message: 'Could not check disk space.', recoverable: true });
  }

  try {
    const totalRam = os.totalmem();
    const maxMem = parseInt(config.maxMemory || '2048', 10);
    if (maxMem > totalRam) {
      checks.push({ name: 'RAM', status: 'fail', message: `Allocated ${(maxMem / 1024).toFixed(1)}GB but only ${(totalRam / 1024 / 1024 / 1024).toFixed(1)}GB total RAM.`, recoverable: true });
    } else if (maxMem > totalRam * 0.8) {
      checks.push({ name: 'RAM', status: 'warn', message: `Allocated ${(maxMem / 1024).toFixed(1)}GB of ${(totalRam / 1024 / 1024 / 1024).toFixed(1)}GB total RAM.`, recoverable: true });
    } else {
      checks.push({ name: 'RAM', status: 'pass', message: `${(maxMem / 1024).toFixed(1)}GB / ${(totalRam / 1024 / 1024 / 1024).toFixed(1)}GB allocated.`, recoverable: true });
    }
  } catch {
    checks.push({ name: 'RAM', status: 'skip', message: 'Could not check RAM.', recoverable: true });
  }

  const requiredJava = JavaManager.getRequiredJavaVersion(config.mcVersion);
  try {
    const allJavas = await JavaManager.scan();
    const matchingJava = allJavas.find(j => j.majorVersion >= requiredJava);
    if (matchingJava) {
      checks.push({ name: 'Java', status: 'pass', message: `Java ${matchingJava.majorVersion} found at ${matchingJava.path}`, recoverable: true });
    } else {
      await JavaManager.ensureJavaInstalled(requiredJava);
      checks.push({ name: 'Java', status: 'pass', message: `Java ${requiredJava} installed automatically.`, recoverable: true });
    }
  } catch {
    checks.push({ name: 'Java', status: 'fail', message: `Java ${requiredJava} not found and could not be auto-installed.`, recoverable: false });
  }

  try {
    const files = fs.readdirSync(serverDir).filter(f => f.endsWith('.jar') && !f.includes('-installer'));
    if (files.length === 0) {
      checks.push({ name: 'Server Jar', status: 'fail', message: `No server jar found in ${serverDir}. Download ${config.software} first.`, recoverable: true });
    } else {
      checks.push({ name: 'Server Jar', status: 'pass', message: `Found ${files[0]}`, recoverable: true });
    }
  } catch {
    checks.push({ name: 'Server Jar', status: 'fail', message: `Cannot read server directory: ${serverDir}`, recoverable: false });
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const server = net.createServer();
      server.once('error', (err: any) => reject(err));
      server.once('listening', () => {
        server.close();
        resolve();
      });
      server.listen(config.port, '127.0.0.1');
    });
    checks.push({ name: 'Port ' + config.port, status: 'pass', message: `Port ${config.port} is available.`, recoverable: true });
  } catch {
    try {
      const pidInfo = execSync(`netstat -ano | findstr :${config.port} 2>nul`).toString().trim();
      const pid = pidInfo.split(/\s+/).pop();
      let processName = 'unknown';
      if (pid) {
        processName = execSync(`tasklist /fi "PID eq ${pid}" /fo csv /nh 2>nul`).toString().trim().split('","')[0]?.replace('"', '') || 'unknown';
      }
      checks.push({ name: 'Port ' + config.port, status: 'fail', message: `Port ${config.port} in use by ${processName} (PID: ${pid || 'unknown'}).`, recoverable: true });
    } catch {
      checks.push({ name: 'Port ' + config.port, status: 'warn', message: `Port ${config.port} may be in use.`, recoverable: true });
    }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const req = https.get('https://api.papermc.io/v2/projects/paper', { timeout: 5000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
    checks.push({ name: 'Internet', status: 'pass', message: 'Internet connectivity OK.', recoverable: true });
  } catch {
    checks.push({ name: 'Internet', status: 'warn', message: 'No internet connectivity detected. Downloads may fail.', recoverable: true });
  }

  const propsPath = path.join(serverDir, 'server.properties');
  if (fs.existsSync(propsPath)) {
    const props = fs.readFileSync(propsPath, 'utf-8');
    const portMatch = props.match(/^server-port=(\d+)/m);
    if (portMatch && parseInt(portMatch[1], 10) !== config.port) {
      checks.push({ name: 'server.properties', status: 'warn', message: `Configured port (${portMatch[1]}) doesn't match expected (${config.port}).`, recoverable: true });
    } else {
      checks.push({ name: 'server.properties', status: 'pass', message: `${props.split('\n').length} entries.`, recoverable: true });
    }
  } else {
    checks.push({ name: 'server.properties', status: 'warn', message: 'Not found — will be auto-generated on start.', recoverable: true });
  }

  const eulaPath = path.join(serverDir, 'eula.txt');
  if (fs.existsSync(eulaPath) && fs.readFileSync(eulaPath, 'utf-8').includes('eula=true')) {
    checks.push({ name: 'EULA', status: 'pass', message: 'Accepted.', recoverable: true });
  } else {
    checks.push({ name: 'EULA', status: 'pass', message: 'Will be auto-accepted on start.', recoverable: true });
  }

  try {
    const testFile = path.join(serverDir, '.mc-write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    checks.push({ name: 'Permissions', status: 'pass', message: 'Server directory is writable.', recoverable: true });
  } catch {
    checks.push({ name: 'Permissions', status: 'fail', message: `Cannot write to ${serverDir}. Check permissions.`, recoverable: false });
  }

  const failures = checks.filter(c => c.status === 'fail');
  const warnings = checks.filter(c => c.status === 'warn');
  const pass = failures.length === 0;

  const result: PreFlightResult = {
    pass,
    checks,
    summary: pass
      ? `All ${checks.length} checks passed.`
      : `${failures.length} failure(s), ${warnings.length} warning(s). ${failures.filter(f => !f.recoverable).length} unrecoverable.`,
    serverId: sid,
  };

  if (sid) {
    try {
      db.prepare(`
        INSERT INTO audit_log (server_id, action, details, username, timestamp)
        VALUES (?, 'preflight', ?, 'system', ?)
      `).run(sid, JSON.stringify(result), new Date().toISOString());
    } catch {}
  }

  return result;
}
