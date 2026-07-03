import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export type JavaSource = 'PATH' | 'JAVA_HOME' | 'REGISTRY' | 'INSTALL_DIR' | 'WHERE_COMMAND' | 'MANAGED' | 'KNOWN_PATH';

export interface JavaVersion {
  path: string;
  version: string;
  majorVersion: number;
  vendor: string;
  arch: string;
  is64bit: boolean;
  javaHome: string;
  source: JavaSource;
}

// Minecraft version → required Java version (semver-aware)
// Mojang official requirements:
//   ≤1.16.5 → Java 8
//   1.17    → Java 16
//   1.18–1.20.4 → Java 17
//   1.20.5+ → Java 21
const MC_JAVA_REQUIREMENTS: Array<{ min: string; max: string; java: number }> = [
  { min: '0.0', max: '1.16.5', java: 8 },
  { min: '1.17', max: '1.17.1', java: 16 },
  { min: '1.18', max: '1.20.4', java: 17 },
  { min: '1.20.5', max: '99.99', java: 21 },
];

const SOFTWARE_JAVA_REQUIREMENTS: Record<string, number> = {
  spigot: 8, vanilla: 8,
};

const ADOPTIUM_API = 'https://api.adoptium.net/v3';

export class JavaDetector {
  static async scan(): Promise<JavaVersion[]> {
    const javaPaths = new Set<string>();
    const platform = os.platform();

    if (platform === 'win32') {
      this.scanWindows(javaPaths);
    } else if (platform === 'darwin') {
      this.scanMac(javaPaths);
    } else {
      this.scanLinux(javaPaths);
    }

    const results: JavaVersion[] = [];
    for (const jPath of javaPaths) {
      const info = await this.checkVersion(jPath);
      if (info) {
        const exists = results.find(r => r.majorVersion === info.majorVersion && r.javaHome === info.javaHome);
        if (!exists) results.push(info);
      }
    }

    results.sort((a, b) => b.majorVersion - a.majorVersion);
    return results;
  }

  private static addPath(set: Set<string>, p: string) {
    const normalized = p.replace(/\\/g, '/').trim();
    if (normalized && !set.has(normalized)) set.add(normalized);
  }

  private static scanWindows(set: Set<string>) {
    const installDirs = [
      'C:/Program Files/Java',
      'C:/Program Files/Eclipse Adoptium',
      'C:/Program Files/Microsoft',
      'C:/Program Files/Amazon Corretto',
      'C:/Program Files/Zulu',
      'C:/Program Files/BellSoft',
      'C:/Program Files (x86)/Java',
      'C:/Program Files (x86)/Eclipse Adoptium',
      'C:/Program Files (x86)/Microsoft',
      'C:/Program Files (x86)/Amazon Corretto',
      'C:/Program Files (x86)/Zulu',
      'C:/Program Files/AdoptOpenJDK',
      'C:/Program Files/Oracle',
      'C:/Program Files/JavaSoft',
      'C:/ProgramData/Oracle/Java',
      'C:/ProgramData/Java',
      `${process.env.LOCALAPPDATA || ''}/Programs/Eclipse Adoptium`,
      `${process.env.LOCALAPPDATA || ''}/Programs/Java`,
      `${process.env.LOCALAPPDATA || ''}/Programs/Microsoft`,
      `${process.env.LOCALAPPDATA || ''}/Programs/Amazon Corretto`,
      `${process.env.LOCALAPPDATA || ''}/Programs/Zulu`,
      `${process.env.LOCALAPPDATA || ''}/Programs/BellSoft`,
      `${process.env.USERPROFILE || ''}/.minecontrol/jre`,
    ];
    for (const dir of installDirs) {
      if (dir) this.findInDir(dir.replace(/\\/g, '/'), set, 'INSTALL_DIR');
    }

    // JAVA_HOME
    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
      const binDir = path.join(javaHome, 'bin').replace(/\\/g, '/');
      this.findInDir(binDir, set, 'JAVA_HOME');
      for (const exe of ['bin/java.exe', 'bin/javaw.exe', 'bin/java']) {
        const full = path.join(javaHome.replace(/\\/g, '/'), exe);
        if (fs.existsSync(full)) this.addPath(set, full);
      }
    }

    // PATH entries
    const pathEnv = process.env.PATH || '';
    for (const entry of pathEnv.split(';')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      for (const exe of ['java.exe', 'javaw.exe', 'java']) {
        const full = path.join(trimmed, exe).replace(/\\/g, '/');
        if (fs.existsSync(full)) this.addPath(set, full);
      }
    }

    // where java
    try {
      const out = execSync('where java 2>nul', { encoding: 'utf8', timeout: 5000 });
      for (const line of out.split('\n')) {
        const p = line.trim();
        if (p && !set.has(p)) set.add(p);
      }
    } catch {}

    // Registry: HKLM JavaSoft JDK
    for (const key of [
      'HKLM\\SOFTWARE\\JavaSoft\\JDK',
      'HKLM\\SOFTWARE\\JavaSoft\\JRE',
      'HKLM\\SOFTWARE\\JavaSoft\\Java Development Kit',
      'HKLM\\SOFTWARE\\JavaSoft\\Java Runtime Environment',
      'HKLM\\SOFTWARE\\Eclipse Adoptium\\JDK',
      'HKLM\\SOFTWARE\\Microsoft\\JDK',
      'HKCU\\SOFTWARE\\JavaSoft\\JDK',
      'HKCU\\SOFTWARE\\JavaSoft\\JRE',
    ]) {
      try {
        const out = execSync(`reg query "${key}" /s 2>nul`, { encoding: 'utf8', timeout: 5000 });
        for (const line of out.split('\n')) {
          const m = line.match(/(?:JavaHome|Path)\s+REG_SZ\s+(.+)/);
          if (m) {
            const home = m[1].trim().replace(/\\/g, '/');
            this.findInDir(home, set, 'REGISTRY');
            for (const exe of ['bin/java.exe', 'bin/javaw.exe', 'bin/java']) {
              const full = path.join(home, exe).replace(/\\/g, '/');
              if (fs.existsSync(full)) this.addPath(set, full);
            }
          }
        }
      } catch {}
    }

    // Managed JRE
    const managedDir = path.join(process.env.USERPROFILE || '', '.minecontrol', 'jre').replace(/\\/g, '/');
    this.findInDir(managedDir, set, 'MANAGED');
  }

  private static scanMac(set: Set<string>) {
    this.findInDirMac('/Library/Java/JavaVirtualMachines', set);
    this.findInDirUnix('/usr/local/opt', set);
    this.findInDirUnix('/opt/homebrew/opt', set);
    if (fs.existsSync('/usr/bin/java')) this.addPath(set, '/usr/bin/java');
    // brew
    try {
      const out = execSync('brew --prefix openjdk 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
      const p = out.trim();
      if (p) {
        const javaExe = path.join(p, 'bin', 'java');
        if (fs.existsSync(javaExe)) this.addPath(set, javaExe);
      }
    } catch {}
    try {
      const out = execSync('ls /usr/local/Cellar/openjdk*/bin/java 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
      for (const line of out.split('\n')) {
        if (line.trim()) this.addPath(set, line.trim());
      }
    } catch {}
  }

  private static scanLinux(set: Set<string>) {
    this.findInDirUnix('/usr/lib/jvm', set);
    this.findInDirUnix('/opt/java', set);
    this.findInDirUnix('/usr/local/lib', set);
    this.findInDirUnix('/snap', set);
    if (fs.existsSync('/usr/local/bin/java')) this.addPath(set, '/usr/local/bin/java');
    if (fs.existsSync('/usr/bin/java')) this.addPath(set, '/usr/bin/java');
    if (fs.existsSync('/usr/libexec/java_home')) {
      try {
        const out = execSync('/usr/libexec/java_home 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
        const home = out.trim();
        if (home) {
          const javaExe = path.join(home, 'bin', 'java');
          if (fs.existsSync(javaExe)) this.addPath(set, javaExe);
        }
      } catch {}
    }
  }

  private static findInDir(baseDir: string, set: Set<string>, source: JavaSource = 'INSTALL_DIR') {
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
      // Also check if baseDir itself contains java
      for (const exe of ['java.exe', 'javaw.exe', 'java']) {
        const full = path.join(baseDir, exe).replace(/\\/g, '/');
        if (fs.existsSync(full)) set.add(full);
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
      if (!major) return null;
      const vendor = this.detectVendor(stderr);
      const archMatch = stderr.match(/(?:64-Bit|64bit|x86_64|amd64|AArch64)/i);
      const is64bit = !!archMatch;
      const javaHome = await this.resolveJavaHome(javaPath);
      const source = this.detectSource(javaPath);
      return {
        path: javaPath, version: fullVersion, majorVersion: major,
        vendor, arch: is64bit ? '64-bit' : '32-bit', is64bit, javaHome, source,
      };
    } catch { return null; }
  }

  private static detectSource(javaPath: string): JavaSource {
    if (javaPath.includes('.minecontrol')) return 'MANAGED';
    if (process.env.JAVA_HOME && javaPath.startsWith(process.env.JAVA_HOME.replace(/\\/g, '/'))) return 'JAVA_HOME';
    const pathEnv = process.env.PATH || '';
    for (const entry of pathEnv.split(';')) {
      const dir = entry.trim().replace(/\\/g, '/');
      if (dir && javaPath.startsWith(dir)) return 'PATH';
    }
    if (javaPath === 'java' || javaPath === 'javaw') return 'PATH';
    return 'INSTALL_DIR';
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
    if (versionOutput.includes('Semeru')) return 'Semeru';
    if (versionOutput.includes('Dragonwell')) return 'Dragonwell';
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
      if (fs.existsSync(path.join(dir, 'lib', 'jexec'))) return dir;
      if (fs.existsSync(path.join(dir, 'lib', 'modules'))) return dir;
      if (fs.existsSync(path.join(dir, 'jre', 'lib'))) return path.join(dir, 'jre');
      if (fs.existsSync(path.join(dir, 'bin', 'java'))) return dir;
      if (fs.existsSync(path.join(dir, 'bin', 'java.exe'))) return dir;
      return dir;
    } catch { return ''; }
  }

  static async resolveBestJava(version: string, source: string): Promise<{
    javaPath: string;
    javaMajor: number;
    javaVersion: string;
    javaVendor: string;
    javaHome: string;
    autoDownloaded: boolean;
  }> {
    const required = JavaDetector.getRequiredJavaVersion(version, source);
    const installed = await JavaDetector.scan();
    const compatible = installed.filter(j => j.majorVersion >= required);

    if (compatible.length > 0) {
      const best = compatible[0];
      return {
        javaPath: best.path,
        javaMajor: best.majorVersion,
        javaVersion: best.version,
        javaVendor: best.vendor,
        javaHome: best.javaHome,
        autoDownloaded: false,
      };
    }

    // None compatible — auto-download
    const controlDir = path.join(os.homedir(), '.minecontrol');
    const jreDir = path.join(controlDir, 'jre');

    // Check if managed JRE exists and is compatible
    const managedExe = path.join(jreDir, 'bin', 'java.exe').replace(/\\/g, '/');
    if (fs.existsSync(managedExe)) {
      const v = await JavaDownloader.checkJavaVersion(managedExe);
      if (v >= required) {
        const info = await JavaDownloader.getVersionInfo(managedExe);
        return {
          javaPath: managedExe,
          javaMajor: v,
          javaVersion: info.version,
          javaVendor: info.vendor,
          javaHome: jreDir,
          autoDownloaded: false,
        };
      }
    }

    // Download Temurin
    const downloadPath = await JavaDownloader.downloadAndInstall(required, jreDir, undefined);
    const exePath = path.join(downloadPath, 'bin', 'java.exe').replace(/\\/g, '/');
    const maj = await JavaDownloader.checkJavaVersion(exePath);
    const info2 = await JavaDownloader.getVersionInfo(exePath);
    return {
      javaPath: exePath,
      javaMajor: maj,
      javaVersion: info2.version,
      javaVendor: info2.vendor,
      javaHome: downloadPath,
      autoDownloaded: true,
    };
  }

  static getRequiredJavaVersion(version: string, source?: string): number {
    // Software-only fallbacks (loaders that work across older Java)
    if (source) {
      const s = source.toLowerCase();
      if (s === 'spigot' || s === 'vanilla') return 8;
    }

    // Use authoritative Minecraft version mapping
    const mcVer = version;
    for (const req of MC_JAVA_REQUIREMENTS) {
      if (JavaDetector.semverGte(mcVer, req.min) && JavaDetector.semverLte(mcVer, req.max)) {
        return req.java;
      }
    }
    return 21;
  }

  private static semverGte(a: string, b: string): boolean {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na > nb) return true;
      if (na < nb) return false;
    }
    return true;
  }

  private static semverLte(a: string, b: string): boolean {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na < nb) return true;
      if (na > nb) return false;
    }
    return true;
  }
}

export class JavaDownloader {
  static async getDownloadUrl(majorVersion: number): Promise<string> {
    return `${ADOPTIUM_API}/binary/latest/${majorVersion}/ga/windows/x64/jdk/hotspot/normal/eclipse`;
  }

  static async getVersionInfo(javaPath: string): Promise<{ version: string; vendor: string }> {
    try {
      const { stderr } = await execAsync(`"${javaPath}" -version`);
      const verMatch = stderr.match(/version "(.*?)"/);
      const version = verMatch ? verMatch[1] : 'unknown';
      let vendor = 'Unknown';
      if (stderr.includes('Temurin') || stderr.includes('Eclipse Adoptium')) vendor = 'Temurin';
      else if (stderr.includes('Microsoft')) vendor = 'Microsoft';
      else if (stderr.includes('Corretto')) vendor = 'Corretto';
      else if (stderr.includes('Zulu')) vendor = 'Zulu';
      else if (stderr.includes('Liberica')) vendor = 'Liberica';
      else if (stderr.includes('Oracle')) vendor = 'Oracle';
      else if (stderr.includes('OpenJDK')) vendor = 'OpenJDK';
      return { version, vendor };
    } catch {
      return { version: 'unknown', vendor: 'Unknown' };
    }
  }

  static async checkJavaVersion(javaPath: string): Promise<number> {
    try {
      const { stderr } = await execAsync(`"${javaPath}" -version`);
      const m = stderr.match(/version "(?:1\.)?(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    } catch { return 0; }
  }

  static async downloadAndInstall(majorVersion: number, targetDir: string, onProgress?: (pct: number) => void): Promise<string> {
    const url = await JavaDownloader.getDownloadUrl(majorVersion);
    const zipPath = path.join(targetDir, `temurin-${majorVersion}-jdk.zip`);
    const extractDir = path.join(targetDir, `jdk-${majorVersion}`);

    if (fs.existsSync(path.join(extractDir, 'bin', 'java.exe'))) {
      return extractDir;
    }

    fs.mkdirSync(targetDir, { recursive: true });

    try {
      await JavaDownloader.downloadFile(url, zipPath, onProgress);
      await JavaDownloader.extractZip(zipPath, targetDir);
    } finally {
      try { fs.unlinkSync(zipPath); } catch {}
    }

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const javaExe = path.join(targetDir, entry.name, 'bin', 'java.exe');
        if (fs.existsSync(javaExe)) {
          const full = path.join(targetDir, entry.name);
          if (full !== extractDir) {
            try {
              if (fs.existsSync(extractDir)) {
                // Remove old extract dir first
                fs.rmSync(extractDir, { recursive: true, force: true });
              }
              fs.renameSync(full, extractDir);
            } catch {}
          }
          return extractDir;
        }
      }
    }
    return extractDir;
  }

  static async downloadFile(url: string, dest: string, onProgress?: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const https = require('https');
      const fs2 = require('fs');
      const file = fs2.createWriteStream(dest);
      https.get(url, (res: any) => {
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          file.write(chunk);
          if (total && onProgress) onProgress(Math.round((downloaded / total) * 100));
        });
        res.on('end', () => { file.end(); resolve(); });
      }).on('error', (err: Error) => {
        file.close();
        try { fs2.unlinkSync(dest); } catch {}
        reject(err);
      });
    });
  }

  private static extractZip(zipPath: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const fs2 = require('fs');
      const unzipper = require('unzipper');
      fs2.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: dest }))
        .on('close', resolve)
        .on('error', reject);
    });
  }
}
