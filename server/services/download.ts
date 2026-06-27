import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

export const PAPER_API = 'https://api.papermc.io/v2/projects/paper';
export const MOJANG_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
export const FABRIC_API = 'https://meta.fabricmc.net/v2';
export const FORGE_API = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
export const PURPUR_API = 'https://api.purpurmc.org/v2/purpur/';
export const NEOFORGE_API = 'https://api.neoforged.net/v1';

export interface MojangVersion {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
}

const cache: { [key: string]: { data: any; expiry: number } } = {};

export function cacheGet<T>(key: string): T | null {
  const entry = cache[key];
  if (entry && entry.expiry > Date.now()) return entry.data;
  return null;
}

export function cacheSet(key: string, data: any, ttlMs = 300000) {
  cache[key] = { data, expiry: Date.now() + ttlMs };
}

export function clearCache() {
  for (const key of Object.keys(cache)) {
    delete cache[key];
  }
}

export async function httpsGet(url: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (resp) => {
      if (resp.statusCode && resp.statusCode >= 400) {
        req.destroy();
        return reject(new Error(`HTTP Error ${resp.statusCode}`));
      }
      let d = '';
      resp.on('data', (chunk) => d += chunk);
      resp.on('end', () => resolve(d));
    }).on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });
  });
}

export function downloadFile(url: string, destPath: string, timeoutMs = 120000): Promise<void> {
  return downloadWithRetry(url, destPath, timeoutMs, 3);
}

async function downloadWithRetry(url: string, destPath: string, timeoutMs: number, maxRetries: number): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await downloadOnce(url, destPath, timeoutMs);
      return;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError || new Error('Download failed');
}

function downloadOnce(url: string, destPath: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tempPath = destPath + '.download';
    const file = fs.createWriteStream(tempPath);
    let isFinished = false;

    const getWithRedirects = (requestUrl: string) => {
      const client = requestUrl.startsWith('https') ? https : http;
      const options = {
        headers: {
          'User-Agent': 'MineControl-OS/1.0.48 (contact@minecontrol.dev)'
        }
      };
      const req = client.get(requestUrl, options, (resp: any) => {
        if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
          let newUrl = resp.headers.location;
          if (!newUrl.startsWith('http')) {
             const urlObj = new URL(requestUrl);
             newUrl = `${urlObj.protocol}//${urlObj.host}${newUrl}`;
          }
          getWithRedirects(newUrl);
          return;
        }
        if (resp.statusCode !== 200) {
          file.close();
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          return reject(new Error(`Failed to download: HTTP ${resp.statusCode} from ${requestUrl}`));
        }
        resp.pipe(file);
        file.on('finish', () => {
          isFinished = true;
          file.close();
          if (destPath.endsWith('.jar') || destPath.endsWith('.zip')) {
            try {
              const buffer = Buffer.alloc(4);
              const fd = fs.openSync(tempPath, 'r');
              fs.readSync(fd, buffer, 0, 4, 0);
              fs.closeSync(fd);
              if (buffer[0] !== 0x50 || buffer[1] !== 0x4B || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                return reject(new Error('Downloaded file is not a valid ZIP/JAR archive (bad magic bytes).'));
              }
            } catch (err) {
              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
              return reject(new Error('Failed to verify downloaded file integrity.'));
            }
          }
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          fs.renameSync(tempPath, destPath);
          resolve();
        });
      });
      req.on('error', (err: any) => {
        isFinished = true;
        file.close();
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        reject(err);
      });
      req.setTimeout(timeoutMs, () => {
        if (!isFinished) {
          req.destroy();
          file.close();
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          reject(new Error(`Download timed out after ${timeoutMs}ms`));
        }
      });
    };
    getWithRedirects(url);
  });
}

export async function isPaperAvailable(version: string): Promise<boolean> {
  let paperVersions: string[] = [];
  const cached = cacheGet<string[]>('paperVersions');
  if (cached) {
    paperVersions = cached;
  } else {
    try {
      const data = await httpsGet(PAPER_API);
      const parsed = JSON.parse(data);
      paperVersions = parsed.versions || [];
      cacheSet('paperVersions', paperVersions);
    } catch {
      return false;
    }
  }
  return paperVersions.includes(version);
}

export async function downloadPaperVersion(version: string, jarPath: string): Promise<void> {
  try {
    const buildsData = await httpsGet(`${PAPER_API}/versions/${version}/builds`);
    const builds = JSON.parse(buildsData);
    const latestBuild = builds.builds && builds.builds[builds.builds.length - 1];
    if (!latestBuild) {
      throw new Error(`No builds found for Paper ${version}`);
    }
    const downloadUrl = `${PAPER_API}/versions/${version}/builds/${latestBuild.build}/downloads/${latestBuild.downloads.application.name}`;
    await downloadFile(downloadUrl, jarPath);
  } catch (err: any) {
    throw new Error(`Failed to download Paper ${version}: ${err.message}`);
  }
}

export async function downloadFabricVersion(version: string, jarPath: string): Promise<void> {
  try {
    const loadersData = await httpsGet(`${FABRIC_API}/versions/loader/${version}`);
    const loaders = JSON.parse(loadersData);
    if (!loaders || loaders.length === 0) {
      throw new Error(`No Fabric loaders found for Minecraft ${version}`);
    }
    const loaderVersion = loaders[0].loader.version;
    const downloadUrl = `${FABRIC_API}/versions/loader/${version}/${loaderVersion}/1.0.1/server/jar`;
    await downloadFile(downloadUrl, jarPath);
  } catch (err: any) {
    throw new Error(`Failed to download Fabric ${version}: ${err.message}`);
  }
}

export async function downloadPurpurVersion(version: string, jarPath: string): Promise<void> {
  try {
    const buildsData = await httpsGet(`https://api.purpurmc.org/v2/purpur/${version}`);
    const builds = JSON.parse(buildsData);
    const latestBuild = builds.builds.latest;
    const downloadUrl = `https://api.purpurmc.org/v2/purpur/${version}/${latestBuild}/download`;
    await downloadFile(downloadUrl, jarPath);
  } catch (err: any) {
    throw new Error(`Failed to download Purpur ${version}: ${err.message}`);
  }
}

export async function downloadForgeVersion(version: string, jarPath: string): Promise<void> {
  try {
    const promosData = await httpsGet(FORGE_API);
    const promos = JSON.parse(promosData).promos || {};
    const buildKey = `${version}-recommended`;
    const fallbackKey = `${version}-latest`;
    const forgeVersion = promos[buildKey] || promos[fallbackKey];
    if (!forgeVersion) {
      throw new Error(`This Forge version is unavailable. Choose another version.`);
    }
    const downloadUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${version}-${forgeVersion}/forge-${version}-${forgeVersion}-server.jar`;
    await downloadFile(downloadUrl, jarPath);
  } catch (err: any) {
    if (err.message.includes('HTTP 404')) {
      throw new Error(`This Forge version is unavailable (404). Choose another version.`);
    }
    throw new Error(`Failed to download Forge ${version}: ${err.message}`);
  }
}

export async function downloadNeoForgeVersion(version: string, jarPath: string): Promise<void> {
  try {
    const neoforgeData = await httpsGet(`${NEOFORGE_API}/versions/${version}`);
    const parsed = JSON.parse(neoforgeData);
    const latest = parsed?.versions?.[parsed.versions.length - 1];
    if (!latest) {
      throw new Error(`No NeoForge builds found for Minecraft ${version}`);
    }
    const downloadUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${latest}/neoforge-${latest}-server.jar`;
    await downloadFile(downloadUrl, jarPath);
  } catch (err: any) {
    throw new Error(`Failed to download NeoForge ${version}: ${err.message}`);
  }
}

export async function downloadVanillaVersion(version: string, jarPath: string): Promise<void> {
  try {
    let mojangVersions: MojangVersion[] = [];
    const cached = cacheGet<MojangVersion[]>('mojangVersions');
    if (cached) {
      mojangVersions = cached;
    } else {
      const data = await httpsGet(MOJANG_MANIFEST);
      const parsed = JSON.parse(data);
      mojangVersions = parsed.versions || [];
      cacheSet('mojangVersions', mojangVersions);
    }
    const versionEntry = mojangVersions.find(v => v.id === version);
    if (!versionEntry) {
      throw new Error(`Version ${version} not found in Mojang manifest`);
    }
    const detailsData = await httpsGet(versionEntry.url);
    const details = JSON.parse(detailsData);
    const serverDownload = details.downloads?.server;
    if (!serverDownload?.url) {
      throw new Error(`No server download available for ${version}`);
    }
    await downloadFile(serverDownload.url, jarPath);
  } catch (err: any) {
    throw new Error(`Failed to download Minecraft ${version}: ${err.message}`);
  }
}

export async function downloadVersion(version: string, source: string | undefined, jarPath: string): Promise<{ sourceName: string; displaySource: string }> {
  const sourceLower = (source || '').toLowerCase();
  const usePaper = sourceLower === 'paper' || sourceLower === 'papermc' || (!source && await isPaperAvailable(version));
  const useFabric = sourceLower === 'fabric';
  const usePurpur = sourceLower === 'purpur';
  const useForge = sourceLower === 'forge';
  const useNeoForge = sourceLower === 'neoforge';
  const useVanilla = sourceLower === 'vanilla' || sourceLower === 'mojang';

  if (useFabric) {
    await downloadFabricVersion(version, jarPath);
  } else if (usePurpur) {
    await downloadPurpurVersion(version, jarPath);
  } else if (useForge) {
    await downloadForgeVersion(version, jarPath);
  } else if (useNeoForge) {
    await downloadNeoForgeVersion(version, jarPath);
  } else if (usePaper) {
    await downloadPaperVersion(version, jarPath);
  } else {
    await downloadVanillaVersion(version, jarPath);
  }

  let sourceName = 'Mojang';
  let displaySource = 'Vanilla';
  if (usePaper) { sourceName = 'PaperMC'; displaySource = 'Paper'; }
  else if (useFabric) { sourceName = 'Fabric'; displaySource = 'Fabric'; }
  else if (usePurpur) { sourceName = 'Purpur'; displaySource = 'Purpur'; }
  else if (useForge) { sourceName = 'Forge'; displaySource = 'Forge'; }
  else if (useNeoForge) { sourceName = 'NeoForge'; displaySource = 'NeoForge'; }

  return { sourceName, displaySource };
}
