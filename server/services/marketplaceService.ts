import https from 'https';
import { getDatabase } from '../database';

const MODRINTH_API = 'https://api.modrinth.com/v2';
const CURSEFORGE_API = 'https://api.curseforge.com/v1';
const CACHE_TTL_MS = 5 * 60 * 1000;

function httpsGetJson(url: string, headers?: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'MineControl-OS/1.0', ...headers }, timeout: 10000 }, (resp) => {
      let data = '';
      resp.on('data', (chunk) => data += chunk);
      resp.on('end', () => {
        try {
          if (resp.statusCode && resp.statusCode >= 400) {
            reject(new Error(`HTTP ${resp.statusCode}: ${data.slice(0, 200)}`));
          } else {
            resolve(JSON.parse(data));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${(e as Error).message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function cacheGet(cacheKey: string): any | null {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT value, created_at FROM marketplace_cache WHERE key = ?').get(cacheKey) as any;
    if (!row) return null;
    const age = Date.now() - new Date(row.created_at).getTime();
    if (age > CACHE_TTL_MS) {
      db.prepare('DELETE FROM marketplace_cache WHERE key = ?').run(cacheKey);
      return null;
    }
    return JSON.parse(row.value);
  } catch { return null; }
}

function cacheSet(cacheKey: string, value: any): void {
  try {
    const db = getDatabase();
    db.prepare('INSERT OR REPLACE INTO marketplace_cache (key, value, created_at) VALUES (?, ?, ?)').run(
      cacheKey, JSON.stringify(value), new Date().toISOString()
    );
  } catch {}
}

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  author: string;
  iconUrl: string;
  downloads: number;
  follows: number;
  source: 'modrinth' | 'curseforge';
  categories: string[];
  latestVersion: string;
  clientSide: string;
  serverSide: string;
}

export interface SoftwarePreset {
  id: string;
  name: string;
  description: string;
  software: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  useCase: string;
  recommended: boolean;
}

export class MarketplaceService {
  // ── Modrinth ──

  async searchModrinth(
    query: string,
    loader?: string,
    mcVersion?: string,
    page: number = 0,
    facets?: string[]
  ): Promise<{ hits: MarketplaceItem[]; total: number; offset: number }> {
    const cacheKey = `modrinth:search:${query}:${loader || ''}:${mcVersion || ''}:${page}:${(facets || []).join(',')}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const f: string[] = [...(facets || [])];
    if (loader) f.push(`["categories:${loader}"]`);
    if (mcVersion) f.push(`["versions:${mcVersion}"]`);
    f.push('["server_side:required","server_side:optional"]');

    const params = new URLSearchParams({
      query: query || '',
      facets: `[${f.join(',')}]`,
      limit: '20',
      offset: (page * 20).toString(),
    });

    const data = await httpsGetJson(`${MODRINTH_API}/search?${params.toString()}`);
    const hits: MarketplaceItem[] = (data.hits || []).map((h: any) => ({
      id: h.project_id,
      name: h.title,
      description: h.description,
      author: h.author,
      iconUrl: h.icon_url || '',
      downloads: h.downloads || 0,
      follows: h.follows || 0,
      source: 'modrinth' as const,
      categories: h.categories || [],
      latestVersion: h.latest_version || '',
      clientSide: h.client_side || '',
      serverSide: h.server_side || '',
    }));

    const result = { hits, total: data.total_hits || 0, offset: data.offset || 0 };
    cacheSet(cacheKey, result);
    return result;
  }

  async getModrinthProject(id: string): Promise<any> {
    const cacheKey = `modrinth:project:${id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
    const data = await httpsGetJson(`${MODRINTH_API}/project/${id}`);
    cacheSet(cacheKey, data);
    return data;
  }

  async getModrinthVersions(id: string, loader?: string, mcVersion?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (loader) params.append('loaders', `["${loader}"]`);
    if (mcVersion) params.append('game_versions', `["${mcVersion}"]`);
    const qs = params.toString();
    const cacheKey = `modrinth:versions:${id}:${qs}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
    const data = await httpsGetJson(`${MODRINTH_API}/project/${id}/version${qs ? '?' + qs : ''}`);
    cacheSet(cacheKey, data);
    return data;
  }

  // ── CurseForge ──

  async searchCurseforge(
    query: string,
    gameVersion?: string,
    classId?: number,
    page: number = 0
  ): Promise<{ hits: MarketplaceItem[]; total: number }> {
    const apiKey = process.env.CURSEFORGE_API_KEY;
    if (!apiKey) return { hits: [], total: 0 };

    const cacheKey = `curseforge:search:${query}:${gameVersion || ''}:${classId || ''}:${page}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      searchFilter: query,
      pageSize: '20',
      index: (page * 20).toString(),
    });
    if (gameVersion) params.append('gameVersion', gameVersion);
    if (classId) params.append('classId', classId.toString());

    const data = await httpsGetJson(`${CURSEFORGE_API}/mods/search?${params.toString()}`, {
      'x-api-key': apiKey,
    });

    const hits: MarketplaceItem[] = (data.data || []).map((h: any) => ({
      id: String(h.id),
      name: h.name,
      description: h.summary || '',
      author: h.authors?.[0]?.name || '',
      iconUrl: h.logo?.url || '',
      downloads: h.downloadCount || 0,
      follows: 0,
      source: 'curseforge' as const,
      categories: (h.categories || []).map((c: any) => c.name),
      latestVersion: h.latestFiles?.[0]?.displayName || '',
      clientSide: h.supportedClientSide || '',
      serverSide: h.supportedServerSide || '',
    }));

    const result = { hits, total: data.pagination?.totalCount || hits.length };
    cacheSet(cacheKey, result);
    return result;
  }

  async getCurseforgeProject(id: string): Promise<any> {
    const apiKey = process.env.CURSEFORGE_API_KEY;
    if (!apiKey) return null;
    const cacheKey = `curseforge:project:${id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
    const data = await httpsGetJson(`${CURSEFORGE_API}/mods/${id}`, { 'x-api-key': apiKey });
    cacheSet(cacheKey, data);
    return data;
  }

  // ── Combined Search ──

  async searchAll(
    query: string,
    loader?: string,
    mcVersion?: string,
    page: number = 0
  ): Promise<{ hits: MarketplaceItem[]; total: number }> {
    const [modrinth, curseforge] = await Promise.all([
      this.searchModrinth(query, loader, mcVersion, page),
      this.searchCurseforge(query, mcVersion, undefined, page),
    ]);
    const combined = [...modrinth.hits, ...curseforge.hits].sort((a, b) => b.downloads - a.downloads);
    return { hits: combined, total: modrinth.total + curseforge.total };
  }

  // ── World Templates (Modrinth world category) ──

  async searchWorldTemplates(query: string = '', page: number = 0): Promise<{ hits: MarketplaceItem[]; total: number }> {
    return this.searchModrinth(query, undefined, undefined, page, ['["categories:world"]']);
  }

  // ── Server Software Presets ──

  getSoftwarePresets(): SoftwarePreset[] {
    return [
      { id: 'paper-performance', name: 'Paper (Performance)', description: 'Most popular high-performance server software with optimizations and plugin API. Best for survival, minigames, and general use.', software: 'paper', category: 'performance', difficulty: 'beginner', useCase: 'Best for most servers — survival, minigames, creative, general use', recommended: true },
      { id: 'purpur-performance', name: 'Purpur (Unlock Features)', description: 'Fork of Paper with additional configuration options, world features, and gameplay tweaks. For servers wanting more control.', software: 'purpur', category: 'performance', difficulty: 'intermediate', useCase: 'Servers that want Paper performance plus extra gameplay features', recommended: false },
      { id: 'fabric-mods', name: 'Fabric (Lightweight Mods)', description: 'Lightweight mod loader for modern Minecraft. Fast, modular, and community-driven. For custom modpack experiences.', software: 'fabric', category: 'modded', difficulty: 'intermediate', useCase: 'Custom modpack servers, lightweight modding, performance with mods', recommended: false },
      { id: 'forge-classic', name: 'Forge (Classic Mods)', description: 'The original and largest mod loader. Supports the widest range of mods including large content mods and magic/tech packs.', software: 'forge', category: 'modded', difficulty: 'intermediate', useCase: 'Large content mods, classic modpacks, magic/tech mods', recommended: false },
      { id: 'neoforge-modern', name: 'NeoForge (Modern Mods)', description: 'Modern fork of Forge for Minecraft 1.21+. Active development, community-governed, with improved performance.', software: 'neoforge', category: 'modded', difficulty: 'intermediate', useCase: 'Modern modpacks on 1.21+, community-driven mod loader', recommended: false },
      { id: 'vanilla-vanilla', name: 'Vanilla (Pure)', description: 'Official Mojang server jar. No modifications, no plugins. Pure Minecraft experience.', software: 'vanilla', category: 'vanilla', difficulty: 'beginner', useCase: 'Pure vanilla experience, no plugins needed', recommended: false },
      { id: 'folia-regions', name: 'Folia (Region Threading)', description: 'Experimental region-based multithreading fork of Paper. Splits world into regions on separate threads for massive player counts.', software: 'folia', category: 'performance', difficulty: 'advanced', useCase: 'Large servers (100+ players) needing multithreaded region processing', recommended: false },
      { id: 'spigot-legacy', name: 'Spigot (Legacy Compat)', description: 'Legacy server software with Bukkit API support. Still widely used for older plugins that don\'t support Paper APIs.', software: 'spigot', category: 'compatibility', difficulty: 'intermediate', useCase: 'Older plugins not compatible with Paper', recommended: false },
      { id: 'pufferfish-performance', name: 'Pufferfish (Optimized)', description: 'Performance fork of Paper with additional optimizations. Aims for maximum performance with minimal configuration.', software: 'pufferfish', category: 'performance', difficulty: 'intermediate', useCase: 'Maximum performance on Paper-compatible servers', recommended: false },
    ];
  }

  getRecommendedPreset(useCase?: string): SoftwarePreset[] {
    const presets = this.getSoftwarePresets();
    if (!useCase) return presets.filter(p => p.recommended);
    return presets.filter(p => p.useCase.toLowerCase().includes(useCase.toLowerCase()) || p.category === useCase);
  }
}

export const marketplaceService = new MarketplaceService();
