import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import unzipper from 'unzipper';
import { resolvePath } from '../paths';
import child_process from 'child_process';
import util from 'util';

const execPromise = util.promisify(child_process.exec);

export type JavaSource = 'MANAGED' | 'SYSTEM';

export interface JavaVersion {
  vendor?: string;
  javaHome?: string;
  path: string;
  version: string;
  majorVersion: number;
  source: JavaSource;
}

const ADOPTIUM_API = 'https://api.adoptium.net/v3';

export class JavaManager {

  static getRequiredJavaVersion(mcVersion: string): number {
    if (!mcVersion) return 21;
    const parts = mcVersion.split('.').map(n => parseInt(n, 10));
    if (parts.length < 2) return 21;
    const major = parts[0];
    const minor = parts[1];
    const patch = parts.length > 2 ? parts[2] : 0;

    if (major < 1) return 21;
    if (major === 1) {
      if (minor <= 16) return 8;
      if (minor === 17) return 17;
      if (minor >= 18 && minor <= 20) {
        if (minor === 20 && patch >= 5) return 21;
        return 17;
      }
      return 21;
    }
    return 21;
  }

  static getManagedJavaDir(majorVersion: number): string {
    const runtimeDir = resolvePath('runtime');
    if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
    return path.join(runtimeDir, `java${majorVersion}`);
  }

  static getManagedJavaExecutable(majorVersion: number): string | null {
    const dir = this.getManagedJavaDir(majorVersion);
    const searchExe = (currentDir: string): string | null => {
      if (!fs.existsSync(currentDir)) return null;
      const files = fs.readdirSync(currentDir);
      for (const file of files) {
        const fullPath = path.join(currentDir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const res = searchExe(fullPath);
          if (res) return res;
        } else if (file === (os.platform() === 'win32' ? 'java.exe' : 'java')) {
          return fullPath;
        }
      }
      return null;
    };
    return searchExe(dir);
  }

  static async getJavaVersion(javaPath: string): Promise<{ version: string; majorVersion: number } | null> {
    try {
      const { stdout, stderr } = await execPromise(`"${javaPath}" -version 2>&1`);
      const output = stdout || stderr;
      const match = output.match(/(?:openjdk|java|openjdk version|java version)["']?\s*(\d+)/i);
      if (match) {
        const major = parseInt(match[1], 10);
        return { version: match[1], majorVersion: major };
      }
      return null;
    } catch {
      return null;
    }
  }

  static async scanSystemJava(): Promise<JavaVersion[]> {
    const results: JavaVersion[] = [];
    const candidates = [
      process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', os.platform() === 'win32' ? 'java.exe' : 'java') : '',
      ...(process.env.PATH || '').split(path.delimiter).map(d => path.join(d, os.platform() === 'win32' ? 'java.exe' : 'java')),
      os.platform() === 'win32' ? 'C:\\Program Files\\Java\\*\\bin\\java.exe' : '',
      os.platform() === 'win32' ? 'C:\\Program Files (x86)\\Java\\*\\bin\\java.exe' : '',
      '/usr/lib/jvm/*/bin/java',
      '/usr/lib/jvm/*/jre/bin/java',
    ];

    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (candidate.includes('*')) {
        try {
          const globDir = candidate.substring(0, candidate.lastIndexOf('*'));
          const pattern = candidate.substring(candidate.lastIndexOf('*') + 1);
          if (fs.existsSync(globDir)) {
            const entries = fs.readdirSync(globDir);
            for (const entry of entries) {
              const fullPath = path.join(globDir, entry, pattern);
              if (fs.existsSync(fullPath) && !seen.has(fullPath)) {
                seen.add(fullPath);
                const ver = await this.getJavaVersion(fullPath);
                if (ver) {
                  results.push({ path: fullPath, version: ver.version, majorVersion: ver.majorVersion, source: 'SYSTEM' });
                }
              }
            }
          }
        } catch {}
      } else {
        if (fs.existsSync(candidate) && !seen.has(candidate)) {
          seen.add(candidate);
          const ver = await this.getJavaVersion(candidate);
          if (ver) {
            results.push({ path: candidate, version: ver.version, majorVersion: ver.majorVersion, source: 'SYSTEM' });
          }
        }
      }
    }
    return results;
  }

  static async ensureJavaInstalled(majorVersion: number, onProgress?: (msg: string, pct?: number) => void): Promise<string> {
    const existing = this.getManagedJavaExecutable(majorVersion);
    if (existing) {
      const ver = await this.getJavaVersion(existing);
      if (ver && ver.majorVersion === majorVersion) {
        if (onProgress) onProgress(`Java ${majorVersion} already installed.`);
        return existing;
      }
    }

    if (onProgress) onProgress(`Downloading Java ${majorVersion}...`, 0);

    const dlPlatform = os.platform() === 'win32' ? 'windows' : os.platform() === 'darwin' ? 'mac' : 'linux';
    const arch = os.arch() === 'x64' ? 'x64' : 'aarch64';

    const url = `${ADOPTIUM_API}/binary/latest/${majorVersion}/ga/${dlPlatform}/${arch}/jre/hotspot/normal/eclipse`;

    const downloadDir = this.getManagedJavaDir(majorVersion);
    const tempZip = path.join(downloadDir, 'temp.zip');

    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    try {
      await this.downloadFile(url, tempZip, (pct) => {
        if (onProgress) onProgress(`Downloading Java ${majorVersion}...`, pct);
      });

      if (onProgress) onProgress(`Verifying Java ${majorVersion} download...`, 95);

      if (os.platform() === 'win32') {
        await fs.createReadStream(tempZip)
          .pipe(unzipper.Extract({ path: downloadDir }))
          .promise();
      } else {
        await execPromise(`unzip -o "${tempZip}" -d "${downloadDir}" || tar -xf "${tempZip}" -C "${downloadDir}"`);
      }

      fs.unlinkSync(tempZip);

      const newExe = this.getManagedJavaExecutable(majorVersion);
      if (!newExe) {
        throw new Error(`Failed to locate java executable after extracting Java ${majorVersion}`);
      }

      if (os.platform() !== 'win32') {
        fs.chmodSync(newExe, '755');
      }

      const ver = await this.getJavaVersion(newExe);
      if (!ver || ver.majorVersion !== majorVersion) {
        throw new Error(`Downloaded Java ${majorVersion} but got version ${ver?.version || 'unknown'}`);
      }

      if (onProgress) onProgress(`Java ${majorVersion} installed successfully.`, 100);
      return newExe;
    } catch (err) {
      if (fs.existsSync(tempZip)) {
        try { fs.unlinkSync(tempZip); } catch {}
      }
      throw err;
    }
  }

  private static async downloadFile(url: string, dest: string, onProgress?: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);

      const request = https.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          try { fs.unlinkSync(dest); } catch {}
          this.downloadFile(response.headers.location!, dest, onProgress).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
        }

        const total = parseInt(response.headers['content-length'] || '0', 10);
        let downloaded = 0;

        response.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (total > 0 && onProgress) {
            onProgress(Math.round((downloaded / total) * 100));
          }
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      });

      request.on('error', (err) => {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        reject(err);
      });

      request.setTimeout(120000, () => {
        request.destroy();
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        reject(new Error('Download timed out after 120s'));
      });
    });
  }

  static async scan(): Promise<JavaVersion[]> {
    const results: JavaVersion[] = [];
    const seenPaths = new Set<string>();

    // Scan managed Java installations
    for (const v of [8, 11, 16, 17, 21, 24, 25]) {
      const exe = this.getManagedJavaExecutable(v);
      if (exe && !seenPaths.has(exe)) {
        seenPaths.add(exe);
        const ver = await this.getJavaVersion(exe);
        results.push({
          path: exe,
          version: ver?.version || v.toString(),
          majorVersion: ver?.majorVersion || v,
          source: 'MANAGED'
        });
      }
    }

    // Scan system Java
    const systemJavas = await this.scanSystemJava();
    for (const sj of systemJavas) {
      if (!seenPaths.has(sj.path)) {
        seenPaths.add(sj.path);
        results.push(sj);
      }
    }

    return results;
  }

}
