import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDatabase } from '../database';
import { BASE_PATH, resolvePath, resolveMinecraftDir, getMinecraftDir } from '../paths';
import { activeServer } from '../activeServer';
import { maskValue, getAllCredentialMetadata, hasCredential, storeCredential, getCredential, deleteCredential } from './encryption';

function getDirSize(dir: string): number {
  let size = 0;
  try {
    const walk = (d: string) => {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) size += fs.statSync(full).size;
      }
    };
    walk(dir);
  } catch {}
  return size;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

export const privacyService = {
  getLocalDataInfo() {
    const locations: any[] = [];

    const sqliteDbPath = path.join(BASE_PATH, 'data', 'minecontrol.db');
    const sqliteSize = fs.existsSync(sqliteDbPath) ? fs.statSync(sqliteDbPath).size : 0;

    locations.push({
      label: 'SQLite Database',
      path: sqliteDbPath,
      size: formatSize(sqliteSize),
      exists: fs.existsSync(sqliteDbPath),
    });

    const dataDir = resolvePath('data');
    if (fs.existsSync(dataDir)) {
      const entries = fs.readdirSync(dataDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const full = path.join(dataDir, entry.name);
          locations.push({
            label: 'Data/' + entry.name,
            path: full,
            size: formatSize(getDirSize(full)),
            exists: true,
          });
        }
      }
    }

    const mcDir = getMinecraftDir();
    if (mcDir && fs.existsSync(mcDir)) {
      const mcEntries = fs.readdirSync(mcDir, { withFileTypes: true });
      for (const entry of mcEntries) {
        if (entry.isDirectory()) {
          const full = path.join(mcDir, entry.name);
          locations.push({
            label: 'Server/' + entry.name,
            path: full,
            size: formatSize(getDirSize(full)),
            exists: true,
          });
        }
      }
    }

    const appDataLocations = [
      { label: 'Download Cache', dir: resolvePath('downloads') },
      { label: 'Cache', dir: resolvePath('cache') },
      { label: 'Temp', dir: resolvePath('temp') },
      { label: 'Playit Config', dir: resolvePath('playit') },
      { label: 'Java Runtimes', dir: resolvePath('java') },
      { label: 'Feedback Attachments', dir: resolvePath('data', 'attachments') },
      { label: 'Feedback Data', dir: resolvePath('data', 'feedback') },
    ];

    for (const loc of appDataLocations) {
      if (fs.existsSync(loc.dir)) {
        const existing = locations.find(l => l.path === loc.dir);
        if (!existing) {
          locations.push({
            label: loc.label,
            path: loc.dir,
            size: formatSize(getDirSize(loc.dir)),
            exists: true,
          });
        }
      }
    }

    return locations;
  },

  getExternalIntegrations() {
    const db = getDatabase();
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;

    const integrations: any[] = [
      {
        key: 'discord',
        label: 'Discord',
        purpose: 'Server notifications, remote commands, and chat relay',
        dataShared: 'Bot token, guild ID, channel IDs, server events (start/stop/crash/player activity)',
        enabled: false,
        connected: false,
        lastConnection: null,
      },
      {
        key: 'playit',
        label: 'Playit.gg',
        purpose: 'Secure tunnel for external connections without port forwarding',
        dataShared: 'Tunnel configuration, public address assignment',
        enabled: false,
        connected: false,
        lastConnection: null,
      },
      {
        key: 'auto_updates',
        label: 'Update Checker',
        purpose: 'Check for new MineControl OS versions on GitHub',
        dataShared: 'Current version number, platform info',
        enabled: true,
        connected: false,
        lastConnection: null,
      },
      {
        key: 'issue_tracker',
        label: 'Issue Tracker',
        purpose: 'Sync feedback tickets to GitHub/GitLab/Jira',
        dataShared: 'Ticket data, diagnostic info (sanitized), attachments',
        enabled: false,
        connected: false,
        lastConnection: null,
      },
      {
        key: 'mojang_api',
        label: 'Mojang API',
        purpose: 'UUID resolution, skin fetching, version manifests',
        dataShared: 'Minecraft username queries',
        enabled: true,
        connected: false,
        lastConnection: null,
      },
      {
        key: 'external_plugins',
        label: 'Plugin/Mod Repositories',
        purpose: 'Browse and download plugins/mods from BukkitDev, Modrinth, CurseForge',
        dataShared: 'Search queries, download requests',
        enabled: true,
        connected: false,
        lastConnection: null,
      },
    ];

    // Check actual Discord status
    try {
      const discordConfig = activeId ? db.prepare('SELECT * FROM discord_config WHERE server_id = ?').get(activeId) as any : null;
      if (discordConfig) {
        integrations[0].enabled = !!discordConfig.bot_token;
        integrations[0].connected = discordConfig.bot_status === 'connected';
        integrations[0].lastConnection = discordConfig.last_connected_at;
      }
    } catch {}

    // Check Playit status
    try {
      const playitConfig = db.prepare("SELECT value FROM server_config WHERE key = 'playitToken'").get() as any;
      if (playitConfig?.value) {
        integrations[1].enabled = true;
      }
    } catch {}

    // Check issue tracker config
    try {
      const trackerConfig = activeId ? db.prepare('SELECT * FROM issue_tracker_config WHERE server_id = ?').get(activeId) as any : null;
      if (trackerConfig) {
        integrations[3].enabled = trackerConfig.enabled === 1;
        integrations[3].connected = trackerConfig.enabled === 1;
      }
    } catch {}

    // Check permissions
    const perms = this.getPermissions();
    const permMap: Record<string, boolean> = {};
    for (const p of perms as any[]) permMap[p.feature_key] = p.enabled;

    // Override from permissions
    integrations[0].enabled = integrations[0].enabled && permMap.discord_integration;
    integrations[1].enabled = integrations[1].enabled && permMap.playit_integration;
    integrations[2].enabled = permMap.auto_updates;
    integrations[4].enabled = permMap.external_api_calls;
    integrations[5].enabled = permMap.external_api_calls;

    return integrations;
  },

  getPermissions() {
    const db = getDatabase();
    return db.prepare('SELECT * FROM feature_permissions ORDER BY id').all();
  },

  setPermission(featureKey: string, enabled: boolean) {
    const db = getDatabase();
    db.prepare('UPDATE feature_permissions SET enabled = ?, updated_at = datetime(\'now\') WHERE feature_key = ?')
      .run(enabled ? 1 : 0, featureKey);
    this.addAuditLog('permission_change', `${featureKey} set to ${enabled ? 'enabled' : 'disabled'}`);
  },

  getStoredCredentials() {
    const metadata = getAllCredentialMetadata();
    return metadata.map((m: any) => ({
      key: m.credential_key,
      displayName: m.display_name,
      hasValue: !!m.has_value,
      lastUpdated: m.last_updated,
      maskedValue: m.has_value ? maskValue(m.credential_key) : null,
    }));
  },

  saveCredential(key: string, value: string) {
    storeCredential(key, value);
    this.addAuditLog('credential_saved', `Credential ${key} saved`);
    return { success: true };
  },

  deleteStoredCredential(key: string) {
    deleteCredential(key);
    this.addAuditLog('credential_deleted', `Credential ${key} deleted`);
    return { success: true };
  },

  runSecurityCheck() {
    const db = getDatabase();
    const results: any[] = [];
    let totalScore = 0;
    const maxScore = 100;
    let deductions = 0;

    // 1. Database status
    try {
      const dbSize = (db.prepare("SELECT page_count * page_size as size FROM pragma_page_count, pragma_page_size").get() as any)?.size || 0;
      const integrityOk = db.prepare('PRAGMA integrity_check').get() as any;
      const dbOk = integrityOk === 'ok';
      db.prepare('UPDATE security_checks SET status = ?, detail = ?, score_impact = ?, checked_at = datetime(\'now\') WHERE check_type = ?')
        .run(dbOk ? 'pass' : 'fail', dbOk ? `Database integrity OK, size: ${formatSize(dbSize)}` : 'Integrity check failed', dbOk ? 0 : -15, 'database_status');
      results.push({ check_type: 'database_status', status: dbOk ? 'pass' : 'fail', detail: dbOk ? 'Database integrity OK' : 'Integrity check failed' });
      if (!dbOk) deductions += 15;
    } catch (e: any) {
      db.prepare('UPDATE security_checks SET status = ?, detail = ?, score_impact = ?, checked_at = datetime(\'now\') WHERE check_type = ?')
        .run('fail', 'Database check error: ' + e.message, -15, 'database_status');
      deductions += 15;
    }

    // 2. Encryption status
    try {
      const creds = db.prepare('SELECT COUNT(*) as c FROM encrypted_credentials').get() as any;
      const hasEncryption = (creds?.c || 0) > 0;
      db.prepare('UPDATE security_checks SET status = ?, detail = ?, score_impact = ?, checked_at = datetime(\'now\') WHERE check_type = ?')
        .run(hasEncryption ? 'pass' : 'warn', hasEncryption ? `${creds.c} credential(s) encrypted` : 'No credentials stored yet', hasEncryption ? 0 : -5, 'encryption_status');
      results.push({ check_type: 'encryption_status', status: hasEncryption ? 'pass' : 'warn', detail: hasEncryption ? `${creds.c} credential(s) encrypted` : 'No credentials stored' });
      if (!hasEncryption) deductions += 5;
    } catch { deductions += 5; }

    // 3. Firewall status
    try {
      const { firewallManager } = require('./firewallManager');
      if (!firewallManager.isAdmin()) {
        db.prepare('UPDATE security_checks SET status = ?, detail = ?, score_impact = ?, checked_at = datetime(\'now\') WHERE check_type = ?')
          .run('fail', 'Cannot check firewall without admin privileges', -10, 'firewall_status');
        deductions += 10;
      } else {
        const { execSync } = require('child_process');
        const out = execSync('netsh advfirewall firewall show rule name="MineControl OS Minecraft" dir=in verbose', { encoding: 'utf-8', timeout: 3000 });
        const isActive = out.includes('Enabled:               Yes');
        db.prepare('UPDATE security_checks SET status = ?, detail = ?, score_impact = ?, checked_at = datetime(\'now\') WHERE check_type = ?')
          .run(isActive ? 'pass' : 'warn', isActive ? 'Firewall rule active' : 'Firewall rule not active', isActive ? 0 : -10, 'firewall_status');
        results.push({ check_type: 'firewall_status', status: isActive ? 'pass' : 'warn', detail: isActive ? 'Firewall rule active' : 'Firewall rule not active' });
        if (!isActive) deductions += 10;
      }
    } catch {
      db.prepare('UPDATE security_checks SET status = ?, detail = ?, score_impact = ?, checked_at = datetime(\'now\') WHERE check_type = ?')
        .run('fail', 'Cannot check firewall status', -10, 'firewall_status');
      deductions += 10;
    }

    // 4. Backup status
    try {
      const backupCount = (db.prepare('SELECT COUNT(*) as c FROM backups').get() as any)?.c || 0;
      const lastBackup = db.prepare('SELECT created_at FROM backups ORDER BY created_at DESC LIMIT 1').get() as any;
      const detail = backupCount > 0 ? `${backupCount} backup(s), last: ${lastBackup?.created_at || 'N/A'}` : 'No backups found';
      db.prepare('UPDATE security_checks SET status = ?, detail = ?, score_impact = ?, checked_at = datetime(\'now\') WHERE check_type = ?')
        .run(backupCount > 0 ? 'pass' : 'warn', detail, backupCount > 0 ? 0 : -10, 'backup_status');
      results.push({ check_type: 'backup_status', status: backupCount > 0 ? 'pass' : 'warn', detail });
      if (backupCount === 0) deductions += 10;
    } catch { deductions += 10; }

    // 5. Credential status
    try {
      const storedCreds = db.prepare('SELECT COUNT(*) as c FROM credential_metadata WHERE has_value = 1').get() as any;
      const storedCount = storedCreds?.c || 0;
      const permEnabled = db.prepare("SELECT enabled FROM feature_permissions WHERE feature_key = 'discord_integration'").get() as any;
      const discordPerm = permEnabled?.enabled === 1;
      db.prepare('UPDATE security_checks SET status = ?, detail = ?, score_impact = ?, checked_at = datetime(\'now\') WHERE check_type = ?')
        .run(storedCount > 0 ? 'pass' : 'warn', storedCount > 0 ? `${storedCount} credential(s) stored (encrypted)` : 'No credentials stored', 0, 'credential_status');
      results.push({ check_type: 'credential_status', status: storedCount > 0 ? 'pass' : 'warn', detail: storedCount > 0 ? `${storedCount} credential(s) stored (encrypted)` : 'No credentials stored' });
    } catch { deductions += 5; }

    // 6. Connection status
    try {
      const server = activeServer.current;
      const portOpen = server ? true : false;
      db.prepare('UPDATE security_checks SET status = ?, detail = ?, score_impact = ?, checked_at = datetime(\'now\') WHERE check_type = ?')
        .run(portOpen ? 'pass' : 'warn', portOpen ? `Server configured on port ${server?.port || 25565}` : 'No active server', 0, 'connection_status');
      results.push({ check_type: 'connection_status', status: portOpen ? 'pass' : 'warn', detail: portOpen ? 'Server configured' : 'No active server' });
    } catch { deductions += 5; }

    // 7. Permission status
    try {
      const riskyPerms = db.prepare("SELECT feature_key FROM feature_permissions WHERE enabled = 1 AND feature_key IN ('discord_integration', 'playit_integration', 'feedback_upload', 'diagnostic_upload')").all() as any[];
      const riskyCount = riskyPerms.length;
      db.prepare('UPDATE security_checks SET status = ?, detail = ?, score_impact = ?, checked_at = datetime(\'now\') WHERE check_type = ?')
        .run(riskyCount === 0 ? 'pass' : 'warn', riskyCount > 0 ? `${riskyCount} external permission(s) enabled` : 'All permissions properly configured', -riskyCount * 2, 'permission_status');
      results.push({ check_type: 'permission_status', status: riskyCount === 0 ? 'pass' : 'warn', detail: riskyCount > 0 ? `${riskyCount} external permission(s) enabled` : 'All permissions properly configured' });
      deductions += riskyCount * 2;
    } catch { deductions += 5; }

    totalScore = Math.max(0, maxScore - deductions);

    // Update last check time
    const now = new Date().toISOString();
    db.prepare("INSERT OR REPLACE INTO privacy_preferences (key, value, updated_at) VALUES ('last_security_check', ?, datetime('now'))").run(now);

    this.addAuditLog('security_check', `Security check completed. Score: ${totalScore}/100`);

    return {
      score: totalScore,
      maxScore,
      deductions,
      checks: results,
      lastChecked: now,
      recommendations: this.getRecommendations(results),
    };
  },

  getSecurityStatus() {
    const db = getDatabase();
    const checks = db.prepare('SELECT * FROM security_checks ORDER BY checked_at DESC').all() as any[];
    const lastCheck = db.prepare("SELECT value FROM privacy_preferences WHERE key = 'last_security_check'").get() as any;
    const prefs = this.getPreferences();

    const failCount = checks.filter((c: any) => c.status === 'fail').length;
    const warnCount = checks.filter((c: any) => c.status === 'warn').length;
    const passCount = checks.filter((c: any) => c.status === 'pass').length;

    let score = 100;
    for (const c of checks) score += (c.score_impact || 0);
    score = Math.max(0, Math.min(100, score));

    return {
      checks,
      score,
      failCount,
      warnCount,
      passCount,
      lastChecked: lastCheck?.value || null,
      maskSecretsInLogs: prefs.mask_secrets_in_logs !== 'false',
      maskSecretsInUi: prefs.mask_secrets_in_ui !== 'false',
      collectAnalytics: prefs.collect_analytics === 'true',
      autoClearLogs: prefs.auto_clear_logs === 'true',
      logRetentionDays: parseInt(prefs.log_retention_days || '30'),
      exportIncludeSecrets: prefs.export_include_secrets === 'true',
    };
  },

  getRecommendations(checks: any[]): string[] {
    const recs: string[] = [];
    for (const c of checks) {
      if (c.status === 'fail') recs.push(`Fix: ${c.check_type.replace(/_/g, ' ')} - ${c.detail}`);
      else if (c.status === 'warn') recs.push(`Improve: ${c.check_type.replace(/_/g, ' ')} - ${c.detail}`);
    }
    if (recs.length === 0) recs.push('All security checks passed');
    return recs;
  },

  getPreferences() {
    const db = getDatabase();
    const rows = db.prepare('SELECT key, value FROM privacy_preferences').all() as any[];
    const prefs: Record<string, string> = {};
    for (const r of rows) prefs[r.key] = r.value;
    return prefs;
  },

  setPreference(key: string, value: string) {
    const db = getDatabase();
    db.prepare("INSERT OR REPLACE INTO privacy_preferences (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, value);
    this.addAuditLog('preference_change', `${key} set to ${value}`);
  },

  addAuditLog(action: string, detail: string) {
    try {
      const db = getDatabase();
      db.prepare('INSERT INTO security_audit_log (action, detail) VALUES (?, ?)').run(action, detail);
    } catch {}
  },

  getAuditLog(limit = 50) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM security_audit_log ORDER BY timestamp DESC LIMIT ?').all(limit);
  },

  exportData(includeSecrets = false) {
    const db = getDatabase();
    const data: Record<string, any> = {
      exported_at: new Date().toISOString(),
      privacy_preferences: db.prepare('SELECT key, value FROM privacy_preferences').all(),
      feature_permissions: db.prepare('SELECT feature_key, enabled, label, description FROM feature_permissions').all(),
      security_checks: db.prepare('SELECT check_type, status, detail, checked_at FROM security_checks ORDER BY checked_at DESC').all(),
      credential_metadata: db.prepare('SELECT credential_key, display_name, has_value, last_updated FROM credential_metadata').all(),
      security_audit_log: db.prepare('SELECT * FROM security_audit_log ORDER BY timestamp DESC LIMIT 100').all(),
    };

    if (includeSecrets) {
      const creds = db.prepare('SELECT credential_key, encrypted_data, iv, auth_tag FROM encrypted_credentials').all() as any[];
      data.encrypted_credentials = creds;
    }

    data._exportType = includeSecrets ? 'full_with_secrets' : 'metadata_only';

    return data;
  },

  clearCache() {
    const dirs = [
      resolvePath('cache'),
      resolvePath('temp'),
      resolvePath('downloads'),
    ];
    let totalCleared = 0;
    for (const dir of dirs) {
      if (fs.existsSync(dir)) {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
            else fs.unlinkSync(full);
          }
          totalCleared++;
        } catch {}
      }
    }
    this.addAuditLog('cache_cleared', `Cleared ${totalCleared} cache directories`);
    return { success: true, message: `Cleared ${totalCleared} cache directories` };
  },

  clearLogs() {
    const db = getDatabase();
    db.prepare('DELETE FROM chat_log').run();
    db.prepare('DELETE FROM security_audit_log').run();

    const logsDir = resolveMinecraftDir('logs');
    if (fs.existsSync(logsDir)) {
      try {
        const entries = fs.readdirSync(logsDir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(logsDir, entry.name);
          if (entry.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
          else fs.unlinkSync(full);
        }
      } catch {}
    }
    this.addAuditLog('logs_cleared', 'All logs cleared');
    return { success: true, message: 'Logs cleared successfully' };
  },

  clearFeedbackQueue() {
    const db = getDatabase();
    db.prepare('DELETE FROM sync_queue').run();

    const feedbackDir = resolvePath('data', 'feedback');
    if (fs.existsSync(feedbackDir)) {
      try {
        const entries = fs.readdirSync(feedbackDir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(feedbackDir, entry.name);
          if (entry.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
          else fs.unlinkSync(full);
        }
      } catch {}
    }
    this.addAuditLog('feedback_queue_cleared', 'Feedback queue cleared');
    return { success: true, message: 'Feedback queue cleared' };
  },

  clearDiagnostics() {
    const db = getDatabase();
    db.prepare('DELETE FROM connection_diagnostics').run();
    this.addAuditLog('diagnostics_cleared', 'Diagnostics data cleared');
    return { success: true, message: 'Diagnostics data cleared' };
  },

  deleteAllUserData() {
    const db = getDatabase();

    const tables = [
      'servers', 'players', 'backups', 'worlds', 'plugins', 'mods', 'shaders', 'resource_packs',
      'claims', 'build_tags', 'chat_log', 'audit_log', 'notifications', 'schedules',
      'feedback_tickets', 'ticket_history', 'ticket_attachments', 'sync_queue',
      'discord_config', 'discord_notifications', 'connection_diagnostics', 'connection_config',
      'guide_preferences', 'guide_bookmarks', 'guide_recently_viewed', 'guide_tutorial_progress', 'guide_search_history',
      'privacy_preferences', 'feature_permissions', 'security_checks', 'encrypted_credentials', 'credential_metadata', 'security_audit_log',
      'system_stats', 'player_history', 'world_dimensions', 'backup_schedule', 'issue_tracker_config',
    ];

    for (const table of tables) {
      try { db.prepare(`DELETE FROM ${table}`).run(); } catch {}
    }

    this.addAuditLog('all_data_deleted', 'All user data deleted');
    return { success: true, message: 'All user data has been deleted. Restart the application.' };
  },

  getDashboardWidget() {
    const status = this.getSecurityStatus();
    const prefs = this.getPreferences();
    const db = getDatabase();

    const backupCount = (db.prepare('SELECT COUNT(*) as c FROM backups').get() as any)?.c || 0;
    const lastBackup = db.prepare('SELECT created_at FROM backups ORDER BY created_at DESC LIMIT 1').get() as any;
    const lastAudit = db.prepare('SELECT timestamp FROM security_audit_log ORDER BY timestamp DESC LIMIT 1').get() as any;

    const warnings: string[] = [];
    if (status.failCount > 0) warnings.push(`${status.failCount} security check(s) failed`);
    if (status.warnCount > 0 && warnings.length < 2) warnings.push(`${status.warnCount} security check(s) need attention`);
    if (backupCount === 0) warnings.push('No backups configured');

    return {
      score: status.score,
      failCount: status.failCount,
      warnCount: status.warnCount,
      passCount: status.passCount,
      lastChecked: status.lastChecked,
      lastBackup: lastBackup?.created_at || null,
      backupCount,
      lastAudit: lastAudit?.timestamp || null,
      warnings,
      maskSecretsInLogs: prefs.mask_secrets_in_logs !== 'false',
      maskSecretsInUi: prefs.mask_secrets_in_ui !== 'false',
    };
  },
};
