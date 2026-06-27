const API_BASE = '/api';
const REQUEST_TIMEOUT = 15000;

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('mc_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error.error || `Request failed: ${res.status}`);
    }

    return res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out - server may be unavailable');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  get: (endpoint: string) => request<any>(endpoint),
  post: (endpoint: string, data?: any) => request<any>(endpoint, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  put: (endpoint: string, data?: any) => request<any>(endpoint, { method: 'PUT', body: data ? JSON.stringify(data) : undefined }),
  delete: (endpoint: string) => request<any>(endpoint, { method: 'DELETE' }),

  // Health check
  health: () => request<any>('/server/health'),

  // Connection verification
  verifyConnection: () => request<any>('/server/verify-connection'),

  // Playit status
  getPlayitStatus: () => request<any>('/server/playit-status'),

  // Config file management
  getOps: () => request<any[]>('/server/ops'),
  updateOps: (data: any[]) => request<any>('/server/ops', { method: 'PUT', body: JSON.stringify(data) }),
  getWhitelistJson: () => request<any[]>('/server/whitelist-json'),
  updateWhitelistJson: (data: any[]) => request<any>('/server/whitelist-json', { method: 'PUT', body: JSON.stringify(data) }),
  getBannedPlayersJson: () => request<any[]>('/server/banned-players-json'),
  updateBannedPlayersJson: (data: any[]) => request<any>('/server/banned-players-json', { method: 'PUT', body: JSON.stringify(data) }),
  getBannedIpsJson: () => request<any[]>('/server/banned-ips-json'),
  updateBannedIpsJson: (data: any[]) => request<any>('/server/banned-ips-json', { method: 'PUT', body: JSON.stringify(data) }),
  getUsercacheJson: () => request<any[]>('/server/usercache-json'),

  // Auth
  login: (username: string, password: string) =>
    request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  me: () => request<any>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // Server
  getServerStatus: () => request<any>('/server/status'),
  startServer: () =>
    request<{ success: boolean }>('/server/start', { method: 'POST' }),
  stopServer: () =>
    request<{ success: boolean }>('/server/stop', { method: 'POST' }),
  restartServer: () =>
    request<{ success: boolean }>('/server/restart', { method: 'POST' }),
  sendCommand: (command: string) =>
    request<{ success: boolean }>('/server/command', {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),
  getLogs: (limit = 100, offset = 0) =>
    request<string[]>(`/server/logs?limit=${limit}&offset=${offset}`),
  searchLogs: (q: string) =>
    request<string[]>(`/server/logs/search?q=${encodeURIComponent(q)}`),
  getServerConfig: () => request<any>('/server/config'),
  updateServerConfig: (config: any) =>
    request<any>('/server/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  getStatsHistory: (minutes = 30) =>
    request<any[]>(`/server/stats/history?minutes=${minutes}`),
  getAuditLog: (limit = 50) =>
    request<any[]>(`/server/audit-log?limit=${limit}`),
  getServerProperties: () => request<any>('/server/properties'),
  updateServerProperties: (props: any) =>
    request<any>('/server/properties', {
      method: 'PUT',
      body: JSON.stringify(props),
    }),

  // Servers (multi-server)
  getServers: () => request<{ servers: any[]; activeServerId: string }>('/servers'),
  getServer: (id: string) => request<any>(`/servers/${id}`),
  createServer: (data: any) =>
    request<any>('/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateServer: (id: string, data: any) =>
    request<any>(`/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  selectServer: (id: string) =>
    request<any>(`/servers/${id}/select`, { method: 'POST' }),
  deleteServer: (id: string) =>
    request<{ success: boolean }>(`/servers/${id}`, { method: 'DELETE' }),

  // Connection Info
  getConnectionInfo: () => request<any>('/server/connection'),

  // Compatibility Manager
  getCompatibilityStatus: () => request<any>('/compatibility/status'),
  checkCompatibility: (settings: { mode: string; allowMultipleVersions: boolean }) =>
    request<any>('/compatibility/check', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),
  configureCompatibility: (settings: { mode: string; allowMultipleVersions: boolean }) =>
    request<any>('/compatibility/configure', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),

  // Diagnostics
  getDiagnostics: () => request<any[]>('/server/diagnostics'),
  healthCheck: () => request<any>('/server/health-check'),

  // Version Management
  getAvailableVersions: () => request<any>('/server/versions'),
  setServerVersion: (version: string, source?: string) =>
    request<any>('/server/version', {
      method: 'POST',
      body: JSON.stringify({ version, source }),
    }),

  // Game Mode
  setGameMode: (mode: string) =>
    request<any>('/server/gamemode', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  // Players
  getPlayers: () => request<any[]>('/players'),
  getPlayer: (id: string) => request<any>(`/players/${id}`),
  addPlayer: (data: any) =>
    request<any>('/players', { method: 'POST', body: JSON.stringify(data) }),
  updatePlayer: (id: string, data: any) =>
    request<any>(`/players/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deletePlayer: (id: string) =>
    request<{ success: boolean }>(`/players/${id}`, { method: 'DELETE' }),
  banPlayer: (id: string, reason?: string) =>
    request<any>(`/players/${id}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  unbanPlayer: (id: string) =>
    request<any>(`/players/${id}/unban`, { method: 'POST' }),
  kickPlayer: (id: string, reason?: string) =>
    request<any>(`/players/${id}/kick`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  mutePlayer: (id: string) =>
    request<any>(`/players/${id}/mute`, { method: 'POST' }),
  unmutePlayer: (id: string) =>
    request<any>(`/players/${id}/unmute`, { method: 'POST' }),
  tempBanPlayer: (id: string, duration: string, reason?: string) =>
    request<any>(`/players/${id}/temp-ban`, {
      method: 'POST',
      body: JSON.stringify({ duration, reason }),
    }),

  // Whitelist
  getWhitelist: () => request<any[]>('/players/whitelist/all'),
  addToWhitelist: (username: string, uuid?: string) =>
    request<any>('/players/whitelist', {
      method: 'POST',
      body: JSON.stringify({ username, uuid }),
    }),
  removeFromWhitelist: (username: string) =>
    request<{ success: boolean }>(`/players/whitelist/${username}`, {
      method: 'DELETE',
    }),
  getBannedPlayers: () => request<any[]>('/players/banned'),

  // Chat
  getChatLog: (limit = 50) =>
    request<any[]>(`/players/chat?limit=${limit}`),

  // Roles
  getRoles: () => request<any[]>('/players/roles'),
  updateRole: (name: string, data: any) =>
    request<any>(`/players/roles/${name}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Worlds
  getWorlds: () => request<any[]>('/worlds'),
  createWorld: (data: any) =>
    request<any>('/worlds', { method: 'POST', body: JSON.stringify(data) }),
  deleteWorld: (name: string) =>
    request<{ success: boolean }>(`/worlds/${name}`, { method: 'DELETE' }),
  cloneWorld: (name: string, newName: string) =>
    request<any>(`/worlds/${name}/clone`, {
      method: 'POST',
      body: JSON.stringify({ newName }),
    }),
  downloadWorld: (name: string) => `${API_BASE}/worlds/${name}/download`,
  uploadWorld: (filePath: string, worldName: string) =>
    request<any>('/worlds/upload', {
      method: 'POST',
      body: JSON.stringify({ filePath, worldName }),
    }),

  // Plugins
  getPlugins: () => request<any[]>('/plugins'),
  installPlugin: (name: string, downloadUrl?: string) =>
    request<any>('/plugins/install', {
      method: 'POST',
      body: JSON.stringify({ name, downloadUrl }),
    }),
  removePlugin: (name: string) =>
    request<{ success: boolean }>(`/plugins/${name}`, { method: 'DELETE' }),
  togglePlugin: (name: string) =>
    request<any>(`/plugins/${name}/toggle`, { method: 'POST' }),

  // Backups
  getBackups: () => request<any[]>('/backups'),
  createBackup: (name?: string, encrypted = false) =>
    request<any>('/backups/create', {
      method: 'POST',
      body: JSON.stringify({ name, encrypted }),
    }),
  restoreBackup: (id: string) =>
    request<{ success: boolean }>(`/backups/restore/${id}`, {
      method: 'POST',
    }),
  deleteBackup: (id: string) =>
    request<{ success: boolean }>(`/backups/${id}`, { method: 'DELETE' }),

  // Claims
  getClaims: () => request<any[]>('/claims'),
  createClaim: (data: any) =>
    request<any>('/claims', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteClaim: (id: string) =>
    request<{ success: boolean }>(`/claims/${id}`, { method: 'DELETE' }),

  // Build Tags
  getBuildTags: () => request<any[]>('/builds'),
  createBuildTag: (data: any) =>
    request<any>('/builds', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteBuildTag: (id: string) =>
    request<{ success: boolean }>(`/builds/${id}`, { method: 'DELETE' }),

  // GitHub Issues
  submitBugReport: (data: any) =>
    request<any>('/github/bug-report', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  submitFeatureRequest: (data: any) =>
    request<any>('/github/feature-request', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getGitHubIssues: () => request<any[]>('/github/issues'),

  // Import
  importAnalyze: (filePath: string) =>
    request<any>('/import/analyze', {
      method: 'POST',
      body: JSON.stringify({ filePath }),
    }),
  importExecute: (filePath: string, config: any) =>
    request<any>('/import/execute', {
      method: 'POST',
      body: JSON.stringify({ filePath, config }),
    }),
  getSupportedFormats: () => request<any>('/import/supported-formats'),

  // Feedback Center
  getFeedbackTickets: (params?: { type?: string; status?: string }) =>
    request<any[]>('/feedback' + (params ? '?' + new URLSearchParams(params as any).toString() : '')),
  createFeedbackTicket: (data: any) =>
    request<any>('/feedback', { method: 'POST', body: JSON.stringify(data) }),
  getFeedbackTicket: (id: string) =>
    request<any>(`/feedback/${id}`),
  updateFeedbackTicketStatus: (id: string, status: string) =>
    request<any>(`/feedback/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  voteFeedbackTicket: (id: string) =>
    request<any>(`/feedback/${id}/vote`, { method: 'POST' }),

  // Privacy
  getPrivacyData: () => request<any>('/privacy/data'),
  clearPrivacyLogs: () => request<any>('/privacy/logs', { method: 'DELETE' }),
  clearPrivacyBackups: () => request<any>('/privacy/backups', { method: 'DELETE' }),
  exportPrivacyData: () => request<any>('/privacy/export'),
};
