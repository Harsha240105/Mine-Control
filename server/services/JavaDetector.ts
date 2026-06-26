import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export interface JavaVersion {
  path: string;
  version: string;
  majorVersion: number;
}

export class JavaDetector {
  static async scan(): Promise<JavaVersion[]> {
    const javaPaths = new Set<string>();

    // Always add 'java' (from PATH)
    javaPaths.add('java');

    const platform = os.platform();

    // Standard paths based on OS
    if (platform === 'win32') {
      this.findInDir('C:/Program Files/Java', javaPaths);
      this.findInDir('C:/Program Files/Eclipse Adoptium', javaPaths);
      this.findInDir('C:/Program Files/Microsoft', javaPaths);
      this.findInDir('C:/Program Files/Amazon Corretto', javaPaths);
    } else if (platform === 'darwin') {
      this.findInDirMac('/Library/Java/JavaVirtualMachines', javaPaths);
      this.findInDirUnix('/usr/local/opt', javaPaths);
      this.findInDirUnix('/opt/homebrew/opt', javaPaths);
    } else { // Linux
      this.findInDirUnix('/usr/lib/jvm', javaPaths);
      this.findInDirUnix('/opt/java', javaPaths);
      if (fs.existsSync('/usr/local/bin/java')) javaPaths.add('/usr/local/bin/java');
    }

    const results: JavaVersion[] = [];

    for (const jPath of javaPaths) {
      const versionInfo = await this.checkVersion(jPath);
      if (versionInfo) {
        // avoid exact duplicates if 'java' in PATH resolves to one of the explicit paths
        const exists = results.find(r => r.version === versionInfo.version && r.majorVersion === versionInfo.majorVersion);
        if (!exists) {
            results.push({
                path: jPath,
                version: versionInfo.version,
                majorVersion: versionInfo.majorVersion
            });
        }
      }
    }

    return results;
  }

  private static findInDir(baseDir: string, set: Set<string>) {
    if (!fs.existsSync(baseDir)) return;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const javaExe = path.join(baseDir, entry.name, 'bin', 'java.exe');
          if (fs.existsSync(javaExe)) {
            set.add(javaExe);
          }
        }
      }
    } catch (e) {}
  }

  private static findInDirMac(baseDir: string, set: Set<string>) {
    if (!fs.existsSync(baseDir)) return;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const javaExe = path.join(baseDir, entry.name, 'Contents', 'Home', 'bin', 'java');
          if (fs.existsSync(javaExe)) {
            set.add(javaExe);
          }
        }
      }
    } catch (e) {}
  }

  private static findInDirUnix(baseDir: string, set: Set<string>) {
    if (!fs.existsSync(baseDir)) return;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const javaExe = path.join(baseDir, entry.name, 'bin', 'java');
          if (fs.existsSync(javaExe)) {
            set.add(javaExe);
          }
        }
      }
    } catch (e) {}
  }

  private static async checkVersion(javaPath: string): Promise<{ version: string, majorVersion: number } | null> {
    try {
      const command = javaPath === 'java' ? 'java -version' : \`"\${javaPath}" -version\`;
      const { stderr } = await execAsync(command); // java -version outputs to stderr
      
      // Parse something like: openjdk version "17.0.1" 2021-10-19
      const match = stderr.match(/version "(.*?)"/);
      if (match && match[1]) {
        const fullVersion = match[1];
        let major = 0;
        
        if (fullVersion.startsWith('1.')) {
          // e.g. 1.8.0_312
          major = parseInt(fullVersion.split('.')[1], 10);
        } else {
          // e.g. 17.0.1
          major = parseInt(fullVersion.split('.')[0], 10);
        }
        
        return { version: fullVersion, majorVersion: major };
      }
      return null;
    } catch (e) {
      return null;
    }
  }
}
