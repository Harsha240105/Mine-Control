
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
    // Basic semver check for minecraft versions
    if (!mcVersion) return 21; // Default to modern
    const parts = mcVersion.split('.').map(n => parseInt(n, 10));
    if (parts.length < 2) return 21;
    const minor = parts[1];
    const patch = parts.length > 2 ? parts[2] : 0;

    if (minor <= 16) {
      if (minor === 16 && patch >= 0) return 8; // Actually 1.16.5 is Java 8
      return 8;
    }
    if (minor === 17) return 17; // 1.17 usually 16, but 17 is safe
    if (minor >= 18 && minor <= 20) {
      if (minor === 20 && patch >= 5) return 21;
      return 17;
    }
    return 21; // 1.21+ 
  }

  static getManagedJavaDir(majorVersion: number): string {
    const runtimeDir = resolvePath('runtime');
    if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
    return path.join(runtimeDir, `java${majorVersion}`);
  }

  static getManagedJavaExecutable(majorVersion: number): string | null {
    const dir = this.getManagedJavaDir(majorVersion);
    const platform = os.platform();
    let exePath = '';

    // Search for java executable recursively in the extracted folder
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

  static async ensureJavaInstalled(majorVersion: number, onProgress?: (msg: string) => void): Promise<string> {
    const existing = this.getManagedJavaExecutable(majorVersion);
    if (existing) {
      if (onProgress) onProgress(`Java ${majorVersion} is already installed.`);
      return existing;
    }

    if (onProgress) onProgress(`Downloading Java ${majorVersion}...`);
    
const dlPlatform = os.platform() === 'win32' ? 'windows' : os.platform() === 'darwin' ? 'mac' : 'linux';
    const arch = os.arch() === 'x64' ? 'x64' : 'aarch64';
    
    // Using JRE for runtime
    const url = `https://api.adoptium.net/v3/binary/latest/${majorVersion}/ga/${dlPlatform}/${arch}/jre/hotspot/normal/eclipse`;

    const downloadDir = this.getManagedJavaDir(majorVersion);
    const tempZip = path.join(downloadDir, 'temp.zip');
    
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    await this.downloadFile(url, tempZip);
    
    if (onProgress) onProgress(`Extracting Java ${majorVersion}...`);
    
    if (os.platform() === 'win32') {
      await fs.createReadStream(tempZip)
        .pipe(unzipper.Extract({ path: downloadDir }))
        .promise();
    } else {
      // Use native unzip/tar for mac/linux to preserve permissions
      await execPromise(`unzip -o "${tempZip}" -d "${downloadDir}" || tar -xf "${tempZip}" -C "${downloadDir}"`);
    }

    fs.unlinkSync(tempZip);
    
    const newExe = this.getManagedJavaExecutable(majorVersion);
    if (!newExe) {
      throw new Error(`Failed to locate java executable after extracting Java ${majorVersion}`);
    }

    // Ensure executable permissions on linux/mac
    if (os.platform() !== 'win32') {
      fs.chmodSync(newExe, '755');
    }

    if (onProgress) onProgress(`Java ${majorVersion} installed successfully.`);
    return newExe;
  }

  private static async downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      const request = https.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          this.downloadFile(response.headers.location!, dest).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed to download: ${response.statusCode}`));
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    });
  }

  static async scan(): Promise<JavaVersion[]> {
    const results: JavaVersion[] = [];
    for (const v of [8, 11, 16, 17, 21, 24, 25]) {
      const exe = this.getManagedJavaExecutable(v);
      if (exe) {
        results.push({
          path: exe,
          version: v.toString(),
          majorVersion: v,
          source: 'MANAGED'
        });
      }
    }
    return results;
  }
}
