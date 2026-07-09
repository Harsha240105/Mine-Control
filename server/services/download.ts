import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

export const PAPER_API = 'https://fill.papermc.io/v3/projects/paper';
export const MOJANG_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
export const FABRIC_API = 'https://meta.fabricmc.net/v2';
export const FORGE_API = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
export const PURPUR_API = 'https://api.purpurmc.org/v2/purpur/';
export const NEOFORGE_API = 'https://api.neoforged.net/v1';
export const QUILT_API = 'https://meta.quiltmc.org/v3';

const CACHE_DIR = path.join(__dirname, '..', '..', 'cache', 'versions');

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

// Persistent disk cache for version lists
function diskCachePath(key: string): string {
  const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(CACHE_DIR, `${sanitized}.json`);
}

export function diskCacheGet<T>(key: string): T | null {
  try {
    const filePath = diskCachePath(key);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.expiry && parsed.expiry > Date.now()) {
      return parsed.data as T;
    }
    return null;
  } catch {
    return null;
  }
}

export function diskCacheSet(key: string, data: any, ttlMs = 1800000): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const filePath = diskCachePath(key);
    const payload = JSON.stringify({ data, expiry: Date.now() + ttlMs });
    fs.writeFileSync(filePath, payload, 'utf-8');
  } catch {}
}

export function diskCacheClear(): void {
  try {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      for (const f of files) {
        fs.unlinkSync(path.join(CACHE_DIR, f));
      }
    }
  } catch {}
}

// Fetch with both memory + disk cache fallback
export async function fetchWithCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300000): Promise<T> {
  const memCached = cacheGet<T>(key);
  if (memCached) return memCached;

  const diskCached = diskCacheGet<T>(key);
  if (diskCached) {
    cacheSet(key, diskCached, ttlMs);
    return diskCached;
  }

  const data = await fetcher();
  cacheSet(key, data, ttlMs);
  diskCacheSet(key, data, ttlMs);
  return data;
}

// Get all PaperMC Minecraft versions as a flat array
export async function getPaperVersions(): Promise<string[]> {
  const data = await httpsGet(PAPER_API);
  const parsed = JSON.parse(data);
  const versionsObj = parsed.versions || {};
  const all: string[] = [];
  for (const group of Object.keys(versionsObj)) {
    const groupVersions = versionsObj[group];
    if (Array.isArray(groupVersions)) {
      for (const v of groupVersions) {
        if (!all.includes(v)) all.push(v);
      }
    }
  }
  return all;
}

// Get PaperMC builds for a specific version (returns array of build objects)
export async function getPaperBuilds(version: string): Promise<any[]> {
  const data = await httpsGet(`${PAPER_API}/versions/${version}/builds`);
  const parsed = JSON.parse(data);
  return Array.isArray(parsed) ? parsed : (parsed.builds || []);
}

// Get NeoForge versions
export async function getNeoForgeVersions(minimumMcVersion = '1.20'): Promise<string[]> {
  const data = await httpsGet(`${NEOFORGE_API}/versions`);
  const parsed = JSON.parse(data);
  const allVersions: string[] = [];
  if (parsed.versions && Array.isArray(parsed.versions)) {
    for (const entry of parsed.versions) {
      if (entry.id && entry.id.startsWith('1.') && entry.id >= minimumMcVersion) {
        if (!allVersions.includes(entry.id)) allVersions.push(entry.id);
      }
    }
  }
  return allVersions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

// Get Quilt versions
export async function getQuiltVersions(): Promise<string[]> {
  const data = await httpsGet(`${QUILT_API}/versions`);
  const parsed = JSON.parse(data);
  const allVersions: string[] = [];
  for (const entry of parsed) {
    const v = entry.version;
    if (/^\d+\.\d+/.test(v) && !allVersions.includes(v)) {
      allVersions.push(v);
    }
  }
  return allVersions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

// Get Spigot versions (known supported versions)
export function getSpigotVersions(): string[] {
  return [
    '1.8', '1.8.3', '1.8.4', '1.8.5', '1.8.6', '1.8.7', '1.8.8',
    '1.8.9', '1.9', '1.9.2', '1.9.4', '1.10', '1.10.2', '1.11',
    '1.11.1', '1.11.2', '1.12', '1.12.1', '1.12.2', '1.13', '1.13.1',
    '1.13.2', '1.14', '1.14.1', '1.14.2', '1.14.3', '1.14.4', '1.15',
    '1.15.1', '1.15.2', '1.16.1', '1.16.2', '1.16.3', '1.16.4', '1.16.5',
    '1.17', '1.17.1', '1.18', '1.18.1', '1.18.2', '1.19', '1.19.1',
    '1.19.2', '1.19.3', '1.19.4', '1.20', '1.20.1', '1.20.2', '1.20.3',
    '1.20.4', '1.20.5', '1.20.6', '1.21', '1.21.1', '1.21.3', '1.21.4'
  ];
}

// Get Folia versions (uses same API as Paper)
export async function getFoliaVersions(): Promise<string[]> {
  const data = await httpsGet('https://fill.papermc.io/v3/projects/folia');
  const parsed = JSON.parse(data);
  const versionsObj = parsed.versions || {};
  const all: string[] = [];
  for (const group of Object.keys(versionsObj)) {
    const groupVersions = versionsObj[group];
    if (Array.isArray(groupVersions)) {
      for (const v of groupVersions) {
        if (!all.includes(v)) all.push(v);
      }
    }
  }
  return all;
}

// Get Pufferfish versions (uses Paper versions as base)
export async function getPufferfishVersions(): Promise<string[]> {
  const paperVers = await getPaperVersions();
  return paperVers.filter(v => /^\d+\.\d+(\.\d+)?$/.test(v));
}

export async function httpsGet(url: string, timeoutMs = 15000, headers?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'MineControl-OS/1.0.71 (contact@minecontrol.dev)', ...headers } };
    const req = https.get(url, options, (resp) => {
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

export function downloadFile(url: string, destPath: string, timeoutMs = 300000, onProgress?: (pct: number) => void): Promise<void> {
  return downloadWithRetry(url, destPath, timeoutMs, 3, onProgress);
}

async function downloadWithRetry(url: string, destPath: string, timeoutMs: number, maxRetries: number, onProgress?: (pct: number) => void): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await downloadOnce(url, destPath, timeoutMs, onProgress);
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

function downloadOnce(url: string, destPath: string, timeoutMs: number, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tempPath = destPath + '.download';
    const file = fs.createWriteStream(tempPath);
    let isFinished = false;

    const getWithRedirects = (requestUrl: string) => {
      const client = requestUrl.startsWith('https') ? https : http;
      const options = {
        headers: {
          'User-Agent': 'MineControl-OS/1.0.71 (contact@minecontrol.dev)'
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
        
        const total = parseInt(resp.headers['content-length'] || '0', 10);
        let downloaded = 0;
        
        if (onProgress) {
          resp.on('data', (chunk: Buffer) => {
            downloaded += chunk.length;
            if (total > 0) {
              onProgress(Math.round((downloaded / total) * 100));
            }
          });
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
      paperVersions = await getPaperVersions();
      cacheSet('paperVersions', paperVersions);
    } catch {
      return false;
    }
  }
  return paperVersions.includes(version);
}

export async function downloadPaperVersion(version: string, jarPath: string, onProgress?: (pct: number) => void): Promise<void> {
  try {
    const buildsData = await httpsGet(`${PAPER_API}/versions/${version}/builds`);
    const parsed = JSON.parse(buildsData);
    const builds = Array.isArray(parsed) ? parsed : (parsed.builds || []);
    const stableBuild = builds.find((b: any) => b.channel === 'STABLE');
    const latestBuild = stableBuild || builds[builds.length - 1];
    if (!latestBuild) {
      throw new Error(`No builds found for Paper ${version}`);
    }
    const downloadUrl = latestBuild.downloads?.['server:default']?.url;
    if (!downloadUrl) {
      throw new Error(`No download URL found for Paper ${version} build ${latestBuild.build}`);
    }
    await downloadFile(downloadUrl, jarPath, 300000, onProgress);
  } catch (err: any) {
    throw new Error(`Failed to download Paper ${version}: ${err.message}`);
  }
}

export async function downloadFabricVersion(version: string, jarPath: string, onProgress?: (pct: number) => void): Promise<void> {
  try {
    const loadersData = await httpsGet(`${FABRIC_API}/versions/loader/${version}`);
    const loaders = JSON.parse(loadersData);
    if (!loaders || loaders.length === 0) {
      throw new Error(`No Fabric loaders found for Minecraft ${version}`);
    }
    const loaderVersion = loaders[0].loader.version;
    const downloadUrl = `${FABRIC_API}/versions/loader/${version}/${loaderVersion}/1.0.1/server/jar`;
    await downloadFile(downloadUrl, jarPath, 300000, onProgress);
  } catch (err: any) {
    throw new Error(`Failed to download Fabric ${version}: ${err.message}`);
  }
}

export async function downloadPurpurVersion(version: string, jarPath: string, onProgress?: (pct: number) => void): Promise<void> {
  try {
    const buildsData = await httpsGet(`https://api.purpurmc.org/v2/purpur/${version}`);
    const builds = JSON.parse(buildsData);
    const latestBuild = builds.builds.latest;
    const downloadUrl = `https://api.purpurmc.org/v2/purpur/${version}/${latestBuild}/download`;
    await downloadFile(downloadUrl, jarPath, 300000, onProgress);
  } catch (err: any) {
    throw new Error(`Failed to download Purpur ${version}: ${err.message}`);
  }
}

export async function downloadForgeVersion(version: string, jarPath: string, onProgress?: (pct: number) => void): Promise<void> {
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
    await downloadFile(downloadUrl, jarPath, 300000, onProgress);
  } catch (err: any) {
    if (err.message.includes('HTTP 404')) {
      throw new Error(`This Forge version is unavailable (404). Choose another version.`);
    }
    throw new Error(`Failed to download Forge ${version}: ${err.message}`);
  }
}

export async function downloadNeoForgeVersion(version: string, jarPath: string, onProgress?: (pct: number) => void): Promise<void> {
  try {
    const neoforgeData = await httpsGet(`${NEOFORGE_API}/versions/${version}`);
    const parsed = JSON.parse(neoforgeData);
    const latest = parsed?.versions?.[parsed.versions.length - 1];
    if (!latest) {
      throw new Error(`No NeoForge builds found for Minecraft ${version}`);
    }
    const downloadUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${latest}/neoforge-${latest}-server.jar`;
    await downloadFile(downloadUrl, jarPath, 300000, onProgress);
  } catch (err: any) {
    throw new Error(`Failed to download NeoForge ${version}: ${err.message}`);
  }
}

export async function downloadQuiltVersion(version: string, jarPath: string, onProgress?: (pct: number) => void): Promise<void> {
  try {
    const loadersData = await httpsGet(`${QUILT_API}/versions/loader/${version}`);
    const loaders = JSON.parse(loadersData);
    if (!loaders || loaders.length === 0) {
      throw new Error(`No Quilt loaders found for Minecraft ${version}`);
    }
    const loaderVersion = loaders[0].loader.version;
    const downloadUrl = `${QUILT_API}/versions/loader/${version}/${loaderVersion}/server/jar`;
    await downloadFile(downloadUrl, jarPath, 300000, onProgress);
  } catch (err: any) {
    throw new Error(`Failed to download Quilt ${version}: ${err.message}`);
  }
}

export async function downloadSpigotVersion(version: string, jarPath: string, onProgress?: (pct: number) => void): Promise<void> {
  try {
    const downloadUrl = `https://download.getbukkit.org/spigot/spigot-${version}.jar`;
    await downloadFile(downloadUrl, jarPath, 300000, onProgress);
  } catch (err: any) {
    throw new Error(`Failed to download Spigot ${version}: ${err.message}`);
  }
}

export async function downloadFoliaVersion(version: string, jarPath: string, onProgress?: (pct: number) => void): Promise<void> {
  try {
    const buildsData = await httpsGet(`https://fill.papermc.io/v3/projects/folia/versions/${version}/builds`);
    const parsed = JSON.parse(buildsData);
    const builds = Array.isArray(parsed) ? parsed : (parsed.builds || []);
    const stableBuild = builds.find((b: any) => b.channel === 'STABLE');
    const latestBuild = stableBuild || builds[builds.length - 1];
    if (!latestBuild) {
      throw new Error(`No builds found for Folia ${version}`);
    }
    const downloadUrl = latestBuild.downloads?.['server:default']?.url;
    if (!downloadUrl) {
      throw new Error(`No download URL found for Folia ${version} build ${latestBuild.build}`);
    }
    await downloadFile(downloadUrl, jarPath, 300000, onProgress);
  } catch (err: any) {
    throw new Error(`Failed to download Folia ${version}: ${err.message}`);
  }
}

export async function downloadVanillaVersion(version: string, jarPath: string, onProgress?: (pct: number) => void): Promise<void> {
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
    await downloadFile(serverDownload.url, jarPath, 300000, onProgress);
  } catch (err: any) {
    throw new Error(`Failed to download Minecraft ${version}: ${err.message}`);
  }
}

export async function downloadVersion(version: string, source: string | undefined, jarPath: string, onProgress?: (pct: number) => void): Promise<{ sourceName: string; displaySource: string }> {
  const sourceLower = (source || '').toLowerCase();
  const usePaper = sourceLower === 'paper' || sourceLower === 'papermc' || (!source && await isPaperAvailable(version));
  const useFabric = sourceLower === 'fabric';
  const usePurpur = sourceLower === 'purpur';
  const useForge = sourceLower === 'forge';
  const useNeoForge = sourceLower === 'neoforge';
  const useQuilt = sourceLower === 'quilt';
  const useSpigot = sourceLower === 'spigot';
  const useFolia = sourceLower === 'folia';
  const usePufferfish = sourceLower === 'pufferfish';
  const useVanilla = sourceLower === 'vanilla' || sourceLower === 'mojang';

  if (useFabric) {
    await downloadFabricVersion(version, jarPath, onProgress);
  } else if (usePurpur) {
    await downloadPurpurVersion(version, jarPath, onProgress);
  } else if (useForge) {
    await downloadForgeVersion(version, jarPath, onProgress);
  } else if (useNeoForge) {
    await downloadNeoForgeVersion(version, jarPath, onProgress);
  } else if (useQuilt) {
    await downloadQuiltVersion(version, jarPath, onProgress);
  } else if (useSpigot) {
    await downloadSpigotVersion(version, jarPath, onProgress);
  } else if (useFolia) {
    await downloadFoliaVersion(version, jarPath, onProgress);
  } else if (usePufferfish) {
    await downloadPaperVersion(version, jarPath, onProgress);
  } else if (usePaper) {
    await downloadPaperVersion(version, jarPath, onProgress);
  } else {
    await downloadVanillaVersion(version, jarPath, onProgress);
  }

  let sourceName = 'Mojang';
  let displaySource = 'Vanilla';
  if (usePaper) { sourceName = 'PaperMC'; displaySource = 'Paper'; }
  else if (useFabric) { sourceName = 'Fabric'; displaySource = 'Fabric'; }
  else if (usePurpur) { sourceName = 'Purpur'; displaySource = 'Purpur'; }
  else if (useForge) { sourceName = 'Forge'; displaySource = 'Forge'; }
  else if (useNeoForge) { sourceName = 'NeoForge'; displaySource = 'NeoForge'; }
  else if (useQuilt) { sourceName = 'Quilt'; displaySource = 'Quilt'; }
  else if (useSpigot) { sourceName = 'Spigot'; displaySource = 'Spigot'; }
  else if (useFolia) { sourceName = 'Folia'; displaySource = 'Folia'; }
  else if (usePufferfish) { sourceName = 'Pufferfish'; displaySource = 'Pufferfish'; }

  return { sourceName, displaySource };
}
