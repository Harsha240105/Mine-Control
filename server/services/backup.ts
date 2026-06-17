import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { createDecipheriv, createCipheriv, randomBytes, pbkdf2Sync } from 'crypto';
import { getDatabase } from '../database';
import { v4 as uuidv4 } from 'uuid';

const BACKUP_DIR = path.join(process.cwd(), 'minecraft', 'backups');
const WORLDS_DIR = path.join(process.cwd(), 'minecraft', 'worlds');
const ENCRYPTION_KEY = process.env.BACKUP_KEY || 'minecontrol-os-secure-key-2024';

export class BackupService {
  async createBackup(name: string, type: 'manual' | 'auto' = 'manual', encrypted = false): Promise<any> {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const worlds = this.getWorldList();
    const timestamp = Date.now();
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeName}-${timestamp}.zip`;
    const filePath = path.join(BACKUP_DIR, fileName);

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', async () => {
        const stats = fs.statSync(filePath);
        const size = this.formatSize(stats.size);

        const db = getDatabase();
        const backup = {
          id: uuidv4(),
          name,
          size,
          created_at: new Date().toISOString(),
          type,
          worlds: JSON.stringify(worlds),
          encrypted: encrypted ? 1 : 0,
          path: filePath,
        };

        db.prepare(
          'INSERT INTO backups (id, name, size, created_at, type, worlds, encrypted, path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(...Object.values(backup));

        if (encrypted) {
          await this.encryptFile(filePath);
        }

        resolve({ ...backup, worlds: JSON.parse(backup.worlds), encrypted: !!backup.encrypted });
      });

      archive.on('error', reject);

      archive.pipe(output);

      // Add worlds
      for (const world of worlds) {
        const worldPath = path.join(WORLDS_DIR, world);
        if (fs.existsSync(worldPath)) {
          archive.directory(worldPath, world);
        }
      }

      // Add server properties
      const serverProps = path.join(process.cwd(), 'minecraft', 'server.properties');
      const opsJson = path.join(process.cwd(), 'minecraft', 'ops.json');
      const whitelistJson = path.join(process.cwd(), 'minecraft', 'whitelist.json');

      if (fs.existsSync(serverProps)) {
        archive.file(serverProps, { name: 'server.properties' });
      }
      if (fs.existsSync(opsJson)) {
        archive.file(opsJson, { name: 'ops.json' });
      }
      if (fs.existsSync(whitelistJson)) {
        archive.file(whitelistJson, { name: 'whitelist.json' });
      }

      archive.finalize();
    });
  }

  async restoreBackup(backupId: string): Promise<void> {
    const db = getDatabase();
    const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as any;

    if (!backup) {
      throw new Error('Backup not found');
    }

    const filePath = backup.path;
    if (!fs.existsSync(filePath)) {
      throw new Error('Backup file not found on disk');
    }

    // Extract to temporary directory
    const tempDir = path.join(BACKUP_DIR, 'temp_restore');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // Handle encrypted backups
    let extractPath = filePath;
    if (backup.encrypted) {
      extractPath = await this.decryptFile(filePath);
    }

    const unzipper = require('unzipper');
    await new Promise((resolve, reject) => {
      fs.createReadStream(extractPath)
        .pipe(unzipper.Extract({ path: tempDir }))
        .on('close', resolve)
        .on('error', reject);
    });

    // Restore worlds
    const worlds = JSON.parse(backup.worlds);
    for (const world of worlds) {
      const sourceWorld = path.join(tempDir, world);
      const destWorld = path.join(WORLDS_DIR, world);
      if (fs.existsSync(sourceWorld)) {
        if (fs.existsSync(destWorld)) {
          fs.rmSync(destWorld, { recursive: true });
        }
        fs.cpSync(sourceWorld, destWorld, { recursive: true });
      }
    }

    // Restore config files
    const configFiles = ['server.properties', 'ops.json', 'whitelist.json'];
    for (const file of configFiles) {
      const src = path.join(tempDir, file);
      const dest = path.join(process.cwd(), 'minecraft', file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }

    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
    if (backup.encrypted && extractPath !== filePath) {
      fs.unlinkSync(extractPath);
    }
  }

  getBackups(): any[] {
    const db = getDatabase();
    const backups = db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all() as any[];
    return backups.map(b => ({
      ...b,
      worlds: JSON.parse(b.worlds),
      encrypted: !!b.encrypted,
    }));
  }

  getBackupById(backupId: string): any {
    const db = getDatabase();
    const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as any;
    if (!backup) return null;
    return {
      ...backup,
      worlds: JSON.parse(backup.worlds),
      encrypted: !!backup.encrypted,
    };
  }

  deleteBackup(backupId: string): void {
    const db = getDatabase();
    const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as any;
    if (!backup) throw new Error('Backup not found');

    if (fs.existsSync(backup.path)) {
      fs.unlinkSync(backup.path);
    }
    db.prepare('DELETE FROM backups WHERE id = ?').run(backupId);
  }

  async encryptFile(filePath: string): Promise<void> {
    const algorithm = 'aes-256-cbc';
    const key = pbkdf2Sync(ENCRYPTION_KEY, 'salt', 100000, 32, 'sha256');
    const iv = randomBytes(16);

    const data = fs.readFileSync(filePath);
    const cipher = createCipheriv(algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

    // Store iv + encrypted data
    const outputPath = filePath + '.enc';
    fs.writeFileSync(outputPath, Buffer.concat([iv, encrypted]));
    fs.unlinkSync(filePath);
    fs.renameSync(outputPath, filePath);
  }

  async decryptFile(filePath: string): Promise<string> {
    const algorithm = 'aes-256-cbc';
    const key = pbkdf2Sync(ENCRYPTION_KEY, 'salt', 100000, 32, 'sha256');

    const data = fs.readFileSync(filePath);
    const iv = data.subarray(0, 16);
    const encrypted = data.subarray(16);

    const decipher = createDecipheriv(algorithm, key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    const outputPath = filePath.replace('.enc', '') + '.decrypted';
    fs.writeFileSync(outputPath, decrypted);
    return outputPath;
  }

  private getWorldList(): string[] {
    const worlds: string[] = [];
    if (fs.existsSync(WORLDS_DIR)) {
      const entries = fs.readdirSync(WORLDS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          // Check if it's a Minecraft world (has level.dat)
          const levelDat = path.join(WORLDS_DIR, entry.name, 'level.dat');
          if (fs.existsSync(levelDat)) {
            worlds.push(entry.name);
          }
        }
      }
    }
    return worlds;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }
}

export const backupService = new BackupService();
