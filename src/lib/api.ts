const API_BASE = '/api';
const REQUEST_TIMEOUT = 30000;

export class ApiError extends Error {
  code?: string;
  reason?: string;
  details?: string;
  repairAction?: string;
  status?: number;

  constructor(msg: string, extra?: { code?: string; reason?: string; details?: string; repairAction?: string; status?: number }) {
    super(msg);
    this.name = 'ApiError';
    this.code = extra?.code;
    this.reason = extra?.reason;
    this.details = extra?.details;
    this.repairAction = extra?.repairAction;
    this.status = extra?.status;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  timeout?: number
): Promise<T> {
  const token = localStorage.getItem('mc_token');

  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const effectiveTimeout = timeout ?? REQUEST_TIMEOUT;
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      let errorMsg = res.statusText;
      let code: string | undefined;
      let reason: string | undefined;
      let details: string | undefined;
      let repairAction: string | undefined;
      try {
        const body = await res.json();
        errorMsg = body.error || body.message || JSON.stringify(body);
        code = body.code;
        reason = body.reason;
        details = body.details;
        repairAction = body.repairAction;
      } catch {
        try { errorMsg = await res.text(); } catch {}
      }
      throw new ApiError(errorMsg || `Request failed: ${res.status}`, { code, reason, details, repairAction, status: res.status });
    }

    return res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new ApiError('Request timed out - server may be unavailable', { code: 'TIMEOUT' });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  // Guide & Knowledge Center
  getGuideSections: () => request<any>('/guide/sections'),
  getGuideArticle: (sectionId: string, articleId: string) => request<any>(`/guide/article/${sectionId}/${articleId}`),
  searchGuide: (q: string) => request<any>(`/guide/search?q=${encodeURIComponent(q)}`),
  getGuideDetections: () => request<any>('/guide/detections'),
  getGuideBookmarks: () => request<any>('/guide/bookmarks'),
  addGuideBookmark: (sectionId: string, articleId: string, title: string) =>
    request<any>('/guide/bookmarks', { method: 'POST', body: JSON.stringify({ sectionId, articleId, title }) }),
  removeGuideBookmark: (sectionId: string, articleId: string) =>
    request<any>(`/guide/bookmarks/${sectionId}/${articleId}`, { method: 'DELETE' }),
  getGuideRecentlyViewed: () => request<any>('/guide/recently-viewed'),
  getGuideSearchHistory: () => request<any>('/guide/search-history'),
  getGuideTutorialProgress: () => request<any>('/guide/tutorial-progress'),
  updateGuideTutorialProgress: (tutorialId: string, stepIndex: number, completed: boolean) =>
    request<any>('/guide/tutorial-progress', { method: 'POST', body: JSON.stringify({ tutorialId, stepIndex, completed }) }),
  getGuidePreferences: () => request<any>('/guide/preferences'),
  setGuidePreference: (key: string, value: string) =>
    request<any>('/guide/preferences', { method: 'POST', body: JSON.stringify({ key, value }) }),
  getGuideDashboardWidget: () => request<any>('/guide/dashboard-widget'),
  getGuideRandomTip: () => request<any>('/guide/random-tip'),
  getGuideReleaseNotes: () => request<any>('/guide/release-notes'),
  getGuideQuickStart: () => request<any>('/guide/quick-start'),

  get: (endpoint: string) => request<any>(endpoint),
  post: (endpoint: string, data?: any) => request<any>(endpoint, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  postFormData: (endpoint: string, formData: FormData) => request<any>(endpoint, { method: 'POST', body: formData }),
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
  validateConnection: () => request<any>('/server/validate', { method: 'POST' }),
  mcPing: () => request<any>('/server/mc-ping'),
  getConnectionWizard: () => request<any>('/server/connection-wizard'),

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

  // Java Manager
  getJavaScan: () => request<any>('/server/java/scan'),
  installJava: (version: string, source?: string) =>
    request<any>('/server/java/install', { method: 'POST', body: JSON.stringify({ version, source }) }),
  removeJava: (javaPath: string) =>
    request<any>('/server/java/remove', { method: 'POST', body: JSON.stringify({ javaPath }) }),
  resolveBestJava: (version: string, source: string) =>
    request<any>('/server/java/resolve', { method: 'POST', body: JSON.stringify({ version, source }) }),

  // Validation & Repair
  validateServer: () => request<any>('/server/validate'),
  repairServer: (action: string, data?: any) =>
    request<any>('/server/repair', { method: 'POST', body: JSON.stringify({ action, ...data }) }),
  getStartupLog: () => request<any>('/server/startup-log'),

  // Diagnostics
  getDiagnostics: () => request<any[]>('/server/diagnostics'),
  getCrashLogs: () => request<any[]>('/server/crash-logs'),
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
  getPlayerDetails: (serverId: string, uuid: string, username: string) =>
    request<any>(`/analytics/${serverId}/player/${uuid}?username=${username}`),
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

  // Player management
  getPlayerHistory: (id: string) => request<any[]>(`/players/${id}/history`),
  getPlayerSessions: (id: string) => request<any[]>(`/players/${id}/sessions`),
  approvePlayer: (id: string) =>
    request<any>(`/players/${id}/approve`, { method: 'POST' }),
  rejectPlayer: (id: string) =>
    request<any>(`/players/${id}/reject`, { method: 'POST' }),
  opPlayer: (id: string) =>
    request<any>(`/players/${id}/op`, { method: 'POST' }),
  deopPlayer: (id: string) =>
    request<any>(`/players/${id}/deop`, { method: 'POST' }),
  whitelistPlayer: (id: string) =>
    request<any>(`/players/${id}/whitelist`, { method: 'POST' }),
  unwhitelistPlayer: (id: string) =>
    request<any>(`/players/${id}/unwhitelist`, { method: 'POST' }),
  detectPlayers: () =>
    request<any>('/players/detect', { method: 'POST' }),
  getActivity: () =>
    request<any[]>('/players/activity'),
  getRecentJoins: () =>
    request<any[]>('/players/recent-joins'),
  getPendingCount: () =>
    request<{ count: number }>('/players/pending-count'),
  exportPlayer: (id: string) =>
    request<any>(`/players/${id}/export`),
  importPlayer: (data: any) =>
    request<any>('/players/import', { method: 'POST', body: JSON.stringify({ data }) }),
  exportAllPlayers: () =>
    request<any>('/players/export/all'),

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
  getWorld: (name: string) => request<any>(`/worlds/${name}`),
  createWorld: (data: any) =>
    request<any>('/worlds', { method: 'POST', body: JSON.stringify(data) }),
  updateWorld: (name: string, data: any) =>
    request<any>(`/worlds/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
  renameWorld: (name: string, newName: string) =>
    request<any>(`/worlds/${name}/rename`, { method: 'POST', body: JSON.stringify({ newName }) }),
  deleteWorld: (name: string) =>
    request<{ success: boolean }>(`/worlds/${name}`, { method: 'DELETE' }),
  cloneWorld: (name: string, newName: string) =>
    request<any>(`/worlds/${name}/clone`, {
      method: 'POST',
      body: JSON.stringify({ newName }),
    }),
  optimizeWorld: (name: string) =>
    request<any>(`/worlds/${name}/optimize`, { method: 'POST' }),
  repairWorld: (name: string) =>
    request<any>(`/worlds/${name}/repair`, { method: 'POST' }),
  getWorldDimensions: (name: string) =>
    request<any[]>(`/worlds/${name}/dimensions`),
  downloadWorld: (name: string) => `${API_BASE}/worlds/${name}/download`,
  importWorldZip: (formData: FormData) =>
    request<any>('/worlds/import/zip', { method: 'POST', body: formData }, 300000),
  importWorldFolder: (sourcePath: string, worldName?: string) =>
    request<any>('/worlds/import/folder', { method: 'POST', body: JSON.stringify({ sourcePath, worldName }) }, 300000),
  uploadWorld: (filePath: string, worldName: string) =>
    request<any>('/worlds/upload', {
      method: 'POST',
      body: JSON.stringify({ filePath, worldName }),
    }),
  detectWorlds: () =>
    request<any>('/worlds/detect', { method: 'POST' }),
  syncWorld: () =>
    request<any>('/worlds/sync', { method: 'POST' }),
  getCurrentWorldInfo: () =>
    request<any>('/worlds/current/info'),
  getWorldStats: () =>
    request<any>('/worlds/stats/summary'),

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

  // Mods
  getMods: () => request<any[]>('/mods'),
  installMod: (name: string, downloadUrl?: string) =>
    request<any>('/mods/install', {
      method: 'POST',
      body: JSON.stringify({ name, downloadUrl }),
    }),
  removeMod: (name: string) =>
    request<{ success: boolean }>(`/mods/${name}`, { method: 'DELETE' }),
  toggleMod: (name: string) =>
    request<any>(`/mods/${name}/toggle`, { method: 'POST' }),

  // Shaders
  getShaders: () => request<any[]>('/shaders'),
  installShader: (name: string, downloadUrl?: string) =>
    request<any>('/shaders/install', {
      method: 'POST',
      body: JSON.stringify({ name, downloadUrl }),
    }),
  removeShader: (name: string) =>
    request<{ success: boolean }>(`/shaders/${name}`, { method: 'DELETE' }),
  toggleShader: (name: string) =>
    request<any>(`/shaders/${name}/toggle`, { method: 'POST' }),

  // Resource Packs
  getResourcePacks: () => request<any[]>('/resourcepacks'),
  installResourcePack: (name: string, downloadUrl?: string) =>
    request<any>('/resourcepacks/install', {
      method: 'POST',
      body: JSON.stringify({ name, downloadUrl }),
    }),
  uploadResourcePack: (formData: FormData) =>
    request<any>('/resourcepacks/upload', {
      method: 'POST',
      body: formData,
    }),
  removeResourcePack: (name: string) =>
    request<{ success: boolean }>(`/resourcepacks/${name}`, { method: 'DELETE' }),
  toggleResourcePack: (name: string) =>
    request<any>(`/resourcepacks/${name}/toggle`, { method: 'POST' }),

  // Backups
  getBackups: (params?: { search?: string; type?: string; sort?: string; order?: string }) =>
    request<any[]>(`/backups${params ? '?' + new URLSearchParams(params as any).toString() : ''}`),
  getBackup: (id: string) => request<any>(`/backups/${id}`),
  createBackup: (data?: { name?: string; reason?: string; type?: string; encrypted?: boolean; includes?: any; createdBy?: string }) =>
    request<any>('/backups/create', { method: 'POST', body: JSON.stringify(data || {}) }),
  restoreBackup: (id: string) =>
    request<{ success: boolean; safetyBackupId: string }>(`/backups/restore/${id}`, { method: 'POST' }),
  exportBackup: (id: string) =>
    request<{ success: boolean; path: string; fileName: string }>(`/backups/export/${id}`, { method: 'POST' }),
  downloadBackupUrl: (id: string) => `${API_BASE}/backups/export/${id}/download`,
  importBackup: (formData: FormData) =>
    request<any>('/backups/import', { method: 'POST', body: formData }),
  verifyBackup: (id: string) =>
    request<{ integrity: string; id: string }>(`/backups/verify/${id}`, { method: 'POST' }),
  deleteBackup: (id: string) =>
    request<{ success: boolean }>(`/backups/${id}`, { method: 'DELETE' }),
  runCleanup: (rules?: { maxBackups?: number; maxStorageMb?: number; maxAgeDays?: number }) =>
    request<any>('/backups/cleanup', { method: 'POST', body: JSON.stringify(rules || {}) }),
  getBackupStats: () => request<any>('/backups/stats'),
  getBackupSchedule: () => request<any>('/backups/schedule'),
  updateBackupSchedule: (data: any) =>
    request<any>('/backups/schedule', { method: 'POST', body: JSON.stringify(data) }),

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

  // GitHub Configuration
  getGitHubConfig: () => request<any>('/github/config'),
  saveGitHubConfig: (data: { owner: string; repo: string; token?: string }) =>
    request<any>('/github/config', { method: 'PUT', body: JSON.stringify(data) }),
  testGitHubConnection: (owner: string, repo: string, token?: string) =>
    request<any>('/github/test-connection', { method: 'POST', body: JSON.stringify({ owner, repo, token }) }),

  // Universal Import System
  importAnalyze: (filePath: string) =>
    request<any>('/import/analyze', {
      method: 'POST',
      body: JSON.stringify({ filePath }),
    }, 300000),
  importAnalyzePlayers: (worldPath: string) =>
    request<any>('/import/analyze-players', {
      method: 'POST',
      body: JSON.stringify({ worldPath }),
    }, 300000),
  importValidate: (filePath: string) =>
    request<any>('/import/validate', {
      method: 'POST',
      body: JSON.stringify({ filePath }),
    }, 300000),
  importSummary: (filePath: string) =>
    request<any>('/import/summary', {
      method: 'POST',
      body: JSON.stringify({ filePath }),
    }, 300000),
  importGetServers: () =>
    request<any>('/import/servers'),
  importExecute: (filePath: string, config: any) =>
    request<any>('/import/execute', {
      method: 'POST',
      body: JSON.stringify({ filePath, config }),
    }, 600000),
  getSupportedFormats: () => request<any>('/import/supported-formats'),

  // Feedback & Issue Management
  getFeedbackTickets: (params?: {
    type?: string; status?: string; search?: string; sort?: string; order?: string;
    sync_status?: string; priority?: string; from_date?: string; to_date?: string; limit?: number; offset?: number
  }) =>
    request<any[]>('/feedback' + (params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined && v !== null)) as any
    ).toString() : '')),
  createFeedbackTicket: (data: any) =>
    request<any>('/feedback', { method: 'POST', body: JSON.stringify(data) }),
  getFeedbackTicket: (id: string) =>
    request<any>(`/feedback/${id}`),
  getFeedbackTicketHistory: (id: string) =>
    request<any[]>(`/feedback/${id}/history`),
  getFeedbackTicketAttachments: (id: string) =>
    request<any[]>(`/feedback/${id}/attachments`),
  updateFeedbackTicketStatus: (id: string, status: string, note?: string) =>
    request<any>(`/feedback/${id}/status`, { method: 'PUT', body: JSON.stringify({ status, note }) }),
  updateFeedbackTicketPriority: (id: string, priority: string) =>
    request<any>(`/feedback/${id}/priority`, { method: 'PUT', body: JSON.stringify({ priority }) }),
  updateFeedbackTicketNotes: (id: string, notes: string) =>
    request<any>(`/feedback/${id}/notes`, { method: 'PUT', body: JSON.stringify({ notes }) }),
  voteFeedbackTicket: (id: string) =>
    request<any>(`/feedback/${id}/vote`, { method: 'POST' }),
  getFeedbackCounts: () =>
    request<any>('/feedback/counts'),
  getFeedbackStats: () =>
    request<any>('/feedback/stats'),
  getFeedbackPending: () =>
    request<any[]>('/feedback/pending'),
  getSyncQueue: () =>
    request<any[]>('/feedback/sync-queue'),
  triggerSync: () =>
    request<any>('/feedback/sync', { method: 'POST' }),
  markFeedbackSynced: (id: string, issueTrackerUrl: string, issueTrackerId?: string) =>
    request<any>(`/feedback/${id}/sync`, { method: 'POST', body: JSON.stringify({ issue_tracker_url: issueTrackerUrl, issue_tracker_id: issueTrackerId }) }),
  deleteFeedbackAttachment: (ticketId: string, attachmentId: string) =>
    request<any>(`/feedback/${ticketId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  getIssueTrackerConfig: (serverId: string) =>
    request<any>(`/feedback/tracker-config?server_id=${serverId}`),
  saveIssueTrackerConfig: (data: any) =>
    request<any>('/feedback/tracker-config', { method: 'POST', body: JSON.stringify(data) }),
  syncAllFromGitHub: () =>
    request<any>('/feedback/sync-from-github', { method: 'POST' }),
  syncTicketFromGitHub: (id: string) =>
    request<any>(`/feedback/${id}/sync-from-github`, { method: 'POST' }),
  getGitHubComments: (id: string) =>
    request<any[]>(`/feedback/${id}/github-comments`),
  syncGitHubComments: (id: string) =>
    request<any[]>(`/feedback/${id}/sync-comments`, { method: 'POST' }),

  // Privacy & Security
  getPrivacyData: () => request<any>('/privacy/data'),
  clearPrivacyLogs: () => request<any>('/privacy/logs', { method: 'DELETE' }),
  clearPrivacyBackups: () => request<any>('/privacy/backups', { method: 'DELETE' }),
  exportPrivacyData: (includeSecrets = false) => request<any>(`/privacy/export${includeSecrets ? '?secrets=true' : ''}`),
  getPrivacyLocations: () => request<any>('/privacy/locations'),
  openPrivacyFolder: (folderPath: string) => request<any>('/privacy/open-folder', { method: 'POST', body: JSON.stringify({ folderPath }) }),
  getPrivacyIntegrations: () => request<any>('/privacy/integrations'),
  getPrivacyPermissions: () => request<any>('/privacy/permissions'),
  setPrivacyPermission: (featureKey: string, enabled: boolean) =>
    request<any>(`/privacy/permissions/${featureKey}`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
  getPrivacyCredentials: () => request<any>('/privacy/credentials'),
  savePrivacyCredential: (key: string, value: string) =>
    request<any>('/privacy/credentials', { method: 'POST', body: JSON.stringify({ key, value }) }),
  deletePrivacyCredential: (key: string) =>
    request<any>(`/privacy/credentials/${key}`, { method: 'DELETE' }),
  runSecurityCheck: () => request<any>('/privacy/security-check', { method: 'POST' }),
  getSecurityStatus: () => request<any>('/privacy/security-status'),
  getPrivacyPreferences: () => request<any>('/privacy/preferences'),
  setPrivacyPreference: (key: string, value: string) =>
    request<any>('/privacy/preferences', { method: 'POST', body: JSON.stringify({ key, value }) }),
  getPrivacyAuditLog: (limit = 50) => request<any>(`/privacy/audit-log?limit=${limit}`),
  getPrivacyDashboardWidget: () => request<any>('/privacy/dashboard-widget'),
  clearPrivacyCache: () => request<any>('/privacy/clear-cache', { method: 'POST' }),
  clearPrivacyFeedback: () => request<any>('/privacy/clear-feedback', { method: 'POST' }),
  clearPrivacyDiagnostics: () => request<any>('/privacy/clear-diagnostics', { method: 'POST' }),
  deleteAllUserData: () => request<any>('/privacy/delete-all', { method: 'POST' }),

  // UI State Persistence
  getUiState: () => request<Record<string, string>>('/ui/state'),
  saveUiState: (state: Record<string, string>) => request<any>('/ui/state', { method: 'POST', body: JSON.stringify(state) }),
  getUiStateKey: (key: string) => request<any>(`/ui/state/${key}`),

  // Connection Management
  getConnectionStatus: () => request<any>('/server/connection/status'),
  testConnectionJoin: (address?: string) =>
    request<any>('/server/connection/test-join', { method: 'POST', body: JSON.stringify({ address }) }),
  getConnectionDiagnostics: (limit?: number) =>
    request<any[]>(`/server/connection/diagnostics${limit ? `?limit=${limit}` : ''}`),
  getPreferredMode: () => request<any>('/server/connection/preferred-mode'),
  setPreferredMode: (mode: string) =>
    request<any>('/server/connection/preferred-mode', { method: 'POST', body: JSON.stringify({ mode }) }),
  refreshConnection: () =>
    request<any>('/server/connection/refresh', { method: 'POST' }),

  // Firewall Management
  getFirewallStatus: () => request<any>('/server/firewall'),
  addFirewallRule: () =>
    request<any>('/server/firewall/add', { method: 'POST' }),
  removeFirewallRule: () =>
    request<any>('/server/firewall/remove', { method: 'POST' }),
  repairFirewallRule: () =>
    request<any>('/server/firewall/repair', { method: 'POST' }),
  openFirewall: () =>
    request<any>('/server/firewall/open', { method: 'POST' }),
  openAdvancedFirewall: () =>
    request<any>('/server/firewall/open-advanced', { method: 'POST' }),
  verifyFirewallPort: (port: number) =>
    request<any>('/server/firewall/verify', { method: 'POST', body: JSON.stringify({ port }) }),
  checkFirewallAdmin: () => request<any>('/server/firewall/admin-check'),

  // Uninstall & Restore
  getStorageAnalysis: () => request<any>('/uninstall/storage-analysis'),
  detectExistingInstallation: () => request<any>('/uninstall/detect-existing'),
  getRestoreStatus: () => request<any>('/uninstall/restore-status'),
  uninstallKeepData: () => request<any>('/uninstall/uninstall/keep-data', { method: 'POST' }),
  uninstallDeleteEverything: () => request<any>('/uninstall/uninstall/delete-everything', { method: 'POST' }),
  restoreInstallation: () => request<any>('/uninstall/restore', { method: 'POST' }),
  startFreshInstallation: () => request<any>('/uninstall/start-fresh', { method: 'POST' }),
  deleteExistingData: () => request<any>('/uninstall/delete-existing-data', { method: 'DELETE' }),
  getUninstallHistory: () => request<any>('/uninstall/history'),
  getUninstallDashboardWidget: () => request<any>('/uninstall/dashboard-widget'),
  getDeleteServerInfo: (serverId: string) => request<any>(`/uninstall/delete-server-info/${serverId}`),

  // Update & Version Management
  getUpdateStatus: () => request<any>('/updates/status'),
  checkForUpdates: () => request<any>('/updates/check', { method: 'POST' }),
  downloadUpdate: () => request<any>('/updates/download', { method: 'POST' }),
  installUpdate: () => request<any>('/updates/install', { method: 'POST' }),
  getReleaseNotes: (version?: string) =>
    request<any>(`/updates/release-notes${version ? `/${version}` : ''}`),
  getUpdateHistory: () => request<any>('/updates/history'),
  getMigrationHistory: () => request<any>('/updates/migration-history'),
  getUpdatePreferences: () => request<any>('/updates/preferences'),
  setUpdatePreference: (key: string, value: string) =>
    request<any>('/updates/preferences', { method: 'PUT', body: JSON.stringify({ key, value }) }),
  createPreUpdateBackup: () =>
    request<any>('/updates/pre-update-backup', { method: 'POST' }),
  rollbackUpdate: () =>
    request<any>('/updates/rollback', { method: 'POST' }),
  runMigrations: () =>
    request<any>('/updates/migrate', { method: 'POST' }),
  verifyDataPreservation: () => request<any>('/updates/verify-preservation'),
  getUpdateDashboardWidget: () => request<any>('/updates/dashboard-widget'),
  getUpdateChecklist: () => request<any>('/updates/checklist'),

  // Discord Integration
  getDiscordConfig: () => request<any>('/discord'),
  saveDiscordConfig: (data: any) =>
    request<any>('/discord', { method: 'POST', body: JSON.stringify(data) }),
  connectDiscord: () =>
    request<any>('/discord/connect', { method: 'POST' }),
  disconnectDiscord: () =>
    request<any>('/discord/disconnect', { method: 'POST' }),
  reconnectDiscord: () =>
    request<any>('/discord/reconnect', { method: 'POST' }),
  testDiscordConnection: (botToken: string, textChannelId: string) =>
    request<any>('/discord/test', { method: 'POST', body: JSON.stringify({ botToken, textChannelId }) }),
  getDiscordStatus: () => request<any>('/discord/status'),
  getDiscordPermissions: () => request<any>('/discord/permissions'),
  getDiscordHistory: (limit?: number) =>
    request<any[]>(`/discord/history${limit ? `?limit=${limit}` : ''}`),
  sendDiscordTestMessage: () =>
    request<any>('/discord/test-message', { method: 'POST' }),
};
