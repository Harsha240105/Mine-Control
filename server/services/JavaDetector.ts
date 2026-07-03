import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export interface JavaVersion {
  path: string;
  version: string;
  majorVersion: number;
  vendor: string;
  arch: string;
  is64bit: boolean;
  javaHome: string;
}

// Minecraft major version → minimum required Java version
const MC_JAVA_REQUIREMENTS: Record<string, number> = {
  '1.0': 6, '1.1': 6, '1.2': 6, '1.3': 6, '1.4': 6, '1.5': 6, '1.6': 6, '1.7': 6,
  '1.8': 8, '1.9': 8, '1.10': 8, '1.11': 8, '1.12': 8, '1.13': 8, '1.14': 8, '1.15': 8, '1.16': 8,
  '1.17': 16, '1.18': 17, '1.19': 17, '1.20': 17, '1.21': 21,
};

// Software → minimum Java version
const SOFTWARE_JAVA_REQUIREMENTS: Record<string, number> = {
  paper: 17, purpur: 17, fabric: 17, forge: 17, neoforge: 17,
  quilt: 17, spigot: 8, folia: 17, pufferfish: 17, vanilla: 8,
};

const ADOPTIUM_API = 'https://api.adoptium.net/v3';

export class JavaDetector {
  static async scan(): Promise<JavaVersion[]> {
    const javaPaths = new Set<string>();
    const platform = os.platform();

    javaPaths.add('java');
    javaPaths.add('javaw');

    if (platform === 'win32') {
      this.scanWindows(javaPaths);
    } else if (platform === 'darwin') {
      this.findInDirMac('/Library/Java/JavaVirtualMachines', javaPaths);
      this.findInDirUnix('/usr/local/opt', javaPaths);
      this.findInDirUnix('/opt/homebrew/opt', javaPaths);
    } else {
      this.findInDirUnix('/usr/lib/jvm', javaPaths);
      this.findInDirUnix('/opt/java', javaPaths);
      this.findInDirUnix('/usr/local/lib', javaPaths);
      this.findInDirUnix('/snap', javaPaths);
      if (fs.existsSync('/usr/local/bin/java')) javaPaths.add('/usr/local/bin/java');
      if (fs.existsSync('/usr/bin/java')) javaPaths.add('/usr/bin/java');
    }

    const results: JavaVersion[] = [];
    for (const jPath of javaPaths) {
      const info = await this.checkVersion(jPath);
      if (info) {
        const exists = results.find(r => r.majorVersion === info.majorVersion && r.javaHome === info.javaHome);
        if (!exists) results.push(info);
      }
    }

    return results;
  }

  private static scanWindows(set: Set<string>) {
    const searchDirs = [
      'C:/Program Files/Java',
      'C:/Program Files/Eclipse Adoptium',
      'C:/Program Files/Microsoft',
      'C:/Program Files/Amazon Corretto',
      'C:/Program Files/Zulu',
      'C:/Program Files/BellSoft',
      'C:/Program Files (x86)/Java',
      'C:/Program Files (x86)/Eclipse Adoptium',
      process.env.JAVA_HOME || '',
      `${process.env.LOCALAPPDATA || ''}/Programs/Eclipse Adoptium`,
      `${process.env.LOCALAPPDATA || ''}/Programs/Java`,
      `${process.env.USERPROFILE || ''}/.minecontrol/jre`,
    ];
    for (const dir of searchDirs) {
      if (dir) this.findInDir(dir.replace(/\\/g, '/'), set);
    }
    try {
      const out = execSync('where java 2>nul', { encoding: 'utf8', timeout: 5000 });
      for (const line of out.split('\n')) {
        const p = line.trim();
        if (p && !set.has(p)) set.add(p);
      }
    } catch {}
    try {
      const out = execSync('reg query "HKLM\\SOFTWARE\\JavaSoft\\JDK" /s 2>nul', { encoding: 'utf8', timeout: 5000 });
      for (const line of out.split('\n')) {
        const m = line.match(/JavaHome\s+REG_SZ\s+(.+)/);
        if (m) {
          const home = m[1].trim().replace(/\\/g, '/');
          this.findInDir(home, set);
        }
      }
    } catch {}
  }

  private static findInDir(baseDir: string, set: Set<string>) {
    if (!fs.existsSync(baseDir)) return;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          for (const exe of ['bin/java.exe', 'bin/javaw.exe', 'bin/java']) {
            const full = path.join(baseDir, entry.name, exe).replace(/\\/g, '/');
            if (fs.existsSync(full)) set.add(full);
          }
        }
      }
    } catch {}
  }

  private static findInDirMac(baseDir: string, set: Set<string>) {
    if (!fs.existsSync(baseDir)) return;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        const javaExe = path.join(baseDir, entry.name, 'Contents', 'Home', 'bin', 'java');
        if (fs.existsSync(javaExe)) set.add(javaExe);
      }
    } catch {}
  }

  private static findInDirUnix(baseDir: string, set: Set<string>) {
    if (!fs.existsSync(baseDir)) return;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const javaExe = path.join(baseDir, entry.name, 'bin', 'java');
          if (fs.existsSync(javaExe)) set.add(javaExe);
        }
      }
    } catch {}
  }

  private static async checkVersion(javaPath: string): Promise<JavaVersion | null> {
    try {
      const cmd = javaPath === 'java' || javaPath === 'javaw' ? `${javaPath} -version` : `"${javaPath}" -version`;
      const { stderr } = await execAsync(cmd);
      const verMatch = stderr.match(/version "(.*?)"/);
      if (!verMatch || !verMatch[1]) return null;
      const fullVersion = verMatch[1];
      let major = 0;
      if (fullVersion.startsWith('1.')) major = parseInt(fullVersion.split('.')[1], 10);
      else major = parseInt(fullVersion.split('.')[0], 10);
      const vendor = this.detectVendor(stderr);
      const archMatch = stderr.match(/(?:64-Bit|64bit|x86_64|amd64)/i);
      const is64bit = !!archMatch;
      const javaHome = await this.resolveJavaHome(javaPath);
      return { path: javaPath, version: fullVersion, majorVersion: major, vendor, arch: is64bit ? '64-bit' : '32-bit', is64bit, javaHome };
    } catch { return null; }
  }

  private static detectVendor(versionOutput: string): string {
    if (versionOutput.includes('Eclipse Adoptium') || versionOutput.includes('Temurin')) return 'Temurin';
    if (versionOutput.includes('AdoptOpenJDK')) return 'AdoptOpenJDK';
    if (versionOutput.includes('Microsoft')) return 'Microsoft';
    if (versionOutput.includes('Amazon') || versionOutput.includes('Corretto')) return 'Corretto';
    if (versionOutput.includes('Zulu')) return 'Zulu';
    if (versionOutput.includes('BellSoft') || versionOutput.includes('Liberica')) return 'Liberica';
    if (versionOutput.includes('GraalVM')) return 'GraalVM';
    if (versionOutput.includes('OpenJDK')) return 'OpenJDK';
    if (versionOutput.includes('Oracle')) return 'Oracle';
    if (versionOutput.includes('IBM')) return 'IBM';
    if (versionOutput.includes('SAP')) return 'SAP';
    return 'Unknown';
  }

  private static async resolveJavaHome(javaPath: string): Promise<string> {
    try {
      if (javaPath === 'java' || javaPath === 'javaw') {
        const cmd = `"${javaPath}" -XshowSettings:properties -version 2>&1`;
        const { stdout, stderr } = await execAsync(cmd);
        const out = stdout + stderr;
        const m = out.match(/java\.home\s*=\s*(.+)/);
        if (m) return m[1].trim();
        return '';
      }
      const dir = path.dirname(path.dirname(javaPath));
      if (fs.existsSync(path.join(dir, 'lib', 'modules'))) return dir;
      if (fs.existsSync(path.join(dir, 'jre', 'lib'))) return path.join(dir, 'jre');
      return dir;
    } catch { return ''; }
  }

  static async validateJava(version: string, source: string): Promise<{
    ok: boolean;
    required: number;
    found: JavaVersion | null;
    allDetected: JavaVersion[];
    message: string;
    canAutoInstall: boolean;
  }> {
    const required = JavaDetector.getRequiredJavaVersion(version, source);
    const detected = await JavaDetector.scan();
    const compatible = detected.filter(j => j.majorVersion >= required).sort((a, b) => a.majorVersion - b.majorVersion);
    const found = compatible.length > 0 ? compatible[0] : null;
    const canAutoInstall = required >= 8 && required <= 23;
    if (found) {
      return { ok: true, required, found, allDetected: detected, message: `Java ${found.majorVersion} found at "${found.path}"`, canAutoInstall };
    }
    if (detected.length === 0) {
      return { ok: false, required, found: null, allDetected: detected, message: `Java not found. Minecraft ${version} requires Java ${required}+.`, canAutoInstall };
    }
    const latest = detected.sort((a, b) => b.majorVersion - a.majorVersion)[0];
    return {
      ok: false, required, found: null, allDetected: detected,
      message: `Java ${latest.majorVersion} found at "${latest.path}" but Minecraft ${version} requires Java ${required}+.\nInstalled: ${detected.map(j => `Java ${j.majorVersion} (${j.vendor})`).join(', ')}`,
      canAutoInstall,
    };
  }

  static getRequiredJavaVersion(version: string, source: string): number {
    const sourceLower = source.toLowerCase();
    if (sourceLower in SOFTWARE_JAVA_REQUIREMENTS) {
      return SOFTWARE_JAVA_REQUIREMENTS[sourceLower];
    }
    const majorMatch = version.match(/^(\d+\.\d+)/);
    if (majorMatch) {
      const mcVer = majorMatch[1];
      for (const [range, javaVer] of Object.entries(MC_JAVA_REQUIREMENTS).sort((a, b) => b[0].localeCompare(a[0]))) {
        if (mcVer >= range) return javaVer;
      }
    }
    return 17;
  }
}

export class JavaDownloader {
  static async getDownloadUrl(majorVersion: number): Promise<string> {
    return `${ADOPTIUM_API}/binary/latest/${majorVersion}/ga/windows/x64/jdk/hotspot/normal/eclipse`;
  }

  static async downloadAndInstall(majorVersion: number, targetDir: string, onProgress?: (pct: number) => void): Promise<string> {
    const url = await JavaDownloader.getDownloadUrl(majorVersion);
    const zipPath = path.join(targetDir, `temurin-${majorVersion}-jdk.zip`);
    const extractDir = path.join(targetDir, `jdk-${majorVersion}`);

    if (fs.existsSync(path.join(extractDir, 'bin', 'java.exe'))) {
      return extractDir;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    await JavaDownloader.downloadFile(url, zipPath, onProgress);
    await JavaDownloader.extractZip(zipPath, targetDir);
    try { fs.unlinkSync(zipPath); } catch {}

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('jdk-')) {
        const full = path.join(targetDir, entry.name);
        const javaExe = path.join(full, 'bin', 'java.exe');
        if (fs.existsSync(javaExe)) {
          if (full !== extractDir) {
            try { fs.renameSync(full, extractDir); } catch {}
          }
          return extractDir;
        }
      }
    }
    return extractDir;
  }

  static async checkJavaVersion(javaPath: string): Promise<number> {
    try {
      const { stderr } = await execAsync(`"${javaPath}" -version`);
      const m = stderr.match(/version "(?:1\.)?(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    } catch { return 0; }
  }

  private static downloadFile(url: string, dest: string, onProgress?: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const https = require('https');
      const fs = require('fs');
      const file = fs.createWriteStream(dest);
      https.get(url, (res: any) => {
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          file.write(chunk);
          if (total && onProgress) onProgress(Math.round((downloaded / total) * 100));
        });
        res.on('end', () => { file.end(); resolve(); });
      }).on('error', (err: Error) => { file.close(); fs.unlinkSync(dest); reject(err); });
    });
  }

  private static extractZip(zipPath: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const fs = require('fs');
      const unzipper = require('unzipper');
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: dest }))
        .on('close', resolve)
        .on('error', reject);
    });
  }

  static async ensureJavaForMinecraft(version: string, source: string, controlDir: string, onProgress?: (pct: number) => void): Promise<string> {
    const required = JavaDetector.getRequiredJavaVersion(version, source);
    const jreDir = path.join(controlDir, 'jre');

    const existing = JavaDetector.scan();
    const compatible = (await existing).filter(j => j.majorVersion >= required);
    if (compatible.length > 0) {
      return compatible[0].path;
    }

    const jreBin = path.join(jreDir, 'bin', 'java.exe');
    if (fs.existsSync(jreBin)) {
      const v = await JavaDownloader.checkJavaVersion(jreBin);
      if (v >= required) return jreBin;
    }

    return path.join(await JavaDownloader.downloadAndInstall(required, jreDir, onProgress), 'bin', 'java.exe');
  }
}
