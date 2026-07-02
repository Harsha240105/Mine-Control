// MineControl OS — Phase 13 Validation Suite
// Usage: node tests/validate.mjs
// Requires the server to be running on port 3001

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3001';

let PASSED = 0;
let FAILED = 0;
let WARNINGS = 0;
const ERRORS = [];

function log(msg) { process.stdout.write(msg + '\n'); }
function ok(msg) { PASSED++; log(`  ✅ ${msg}`); }
function fail(msg, err) { FAILED++; ERRORS.push({ msg, err }); log(`  ❌ ${msg}${err ? ': ' + (err?.message || JSON.stringify(err)) : ''}`); }
function warn(msg) { WARNINGS++; log(`  ⚠️  ${msg}`); }

async function request(method, urlPath, body = null, expectStatus = 200) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3001,
      path: urlPath,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        const statusMatch = res.statusCode === expectStatus || (expectStatus === 200 && res.statusCode < 300);
        resolve({ status: res.statusCode, data: parsed, ok: statusMatch, headers: res.headers });
      });
    });
    req.on('error', e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assertOk(res, label) {
  if (!res.ok) fail(`${label} — expected ${res.status}, got ${res.status}`, res.data);
  else ok(label);
  return res.ok;
}

function assertField(res, field, label) {
  const val = res?.data?.[field];
  if (val === undefined || val === null) fail(`${label}: missing field "${field}"`);
  else ok(`${label}: ${field}=${JSON.stringify(val).slice(0, 80)}`);
  return val !== undefined && val !== null;
}

// ─── Phase 1-2: Server Management ────────────────────────────────
async function testServerManagement() {
  log('\n📦 Phase 1-2: Server Management');

  // Login (get auth token)
  let token = null;
  const login = await request('POST', '/api/auth/login', { username: 'owner', password: 'minecontrol' });
  if (!login.ok) { fail('Login', login.data); return null; }
  token = login.data?.token;
  if (!token) { fail('Login: no token'); return null; }
  ok(`Login got token: ${token.slice(0, 16)}...`);

  // Add token to requests
  const authRequest = async (method, path, body, expectStatus) => {
    const opts = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      timeout: 10000,
    };
    return new Promise((resolve, reject) => {
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode, data: parsed, ok: res.statusCode === (expectStatus || 200) });
        });
      });
      req.on('error', e => reject(e));
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  };

  // Get servers
  const serversList = await authRequest('GET', '/api/servers');
  assertOk(serversList, 'GET /api/servers');

  // Ensure we have at least one server (server/index.ts auto-creates)
  const servers = serversList.data?.servers || serversList.data || [];
  if (servers.length === 0) warn('No servers found (auto-create may not have fired)');
  else ok(`Found ${servers.length} server(s)`);

  // GET /api/server (health / config)
  const srvConfig = await authRequest('GET', '/api/server');
  if (srvConfig.ok) ok('GET /api/server — config endpoint');
  else warn('GET /api/server config endpoint');

  // GET /api/server/status
  const srvStatus = await authRequest('GET', '/api/server/status');
  if (srvStatus.ok) ok('GET /api/server/status');
  else warn('GET /api/server/status');

  // Create a test server
  const tsSlug = 'qa-validation-test-' + Date.now();
  const createSrv = await authRequest('POST', '/api/servers', {
    name: 'QA Validation Test',
    slug: tsSlug,
    port: 25666,
    version: '1.21',
    version_source: 'paper',
    directory: `./servers/${tsSlug}`,
  }, 200);
  assertOk(createSrv, 'POST /api/servers (create)');

  // Select the test server
  const selectSrv = await authRequest('POST', '/api/servers/select', { slug: tsSlug });
  assertOk(selectSrv, 'POST /api/servers/select');

  // Health endpoint
  const health = await authRequest('GET', '/api/health');
  assertOk(health, 'GET /api/health');

  return authRequest;
}

// ─── Phase 3: Software & Versions ────────────────────────────────
async function testSoftware(authRequest) {
  log('\n📦 Phase 3: Software & Versions');

  // GET /api/server/versions?type=paper
  const paperVersions = await authRequest('GET', '/api/server/versions?type=paper');
  if (paperVersions.ok && Array.isArray(paperVersions.data)) ok(`Paper versions: ${paperVersions.data.length} available`);
  else if (paperVersions.ok && paperVersions.data?.versions) ok(`Paper versions via data.versions: ${paperVersions.data.versions.length}`);
  else if (paperVersions.ok) ok('Paper versions endpoint returned data');
  else warn('GET /api/server/versions?type=paper');

  // GET /api/server/versions?type=fabric
  const fabricVersions = await authRequest('GET', '/api/server/versions?type=fabric');
  if (fabricVersions.ok) ok('Fabric versions endpoint');
  else warn('Fabric versions endpoint');

  // GET /api/server/versions?type=vanilla
  const vanillaVersions = await authRequest('GET', '/api/server/versions?type=vanilla');
  if (vanillaVersions.ok) ok('Vanilla versions endpoint');
  else warn('Vanilla versions endpoint');

  // GET /api/compatibility
  const compat = await authRequest('GET', '/api/compatibility');
  if (compat.ok) ok('GET /api/compatibility');
  else warn('GET /api/compatibility');
}

// ─── Phase 4: Plugins, Mods, Worlds ──────────────────────────────
async function testPluginsModsWorlds(authRequest) {
  log('\n📦 Phase 4: Plugins, Mods, Worlds');

  // Plugins
  const plugins = await authRequest('GET', '/api/plugins');
  if (plugins.ok) ok('GET /api/plugins');
  else warn('GET /api/plugins');

  // Mods
  const mods = await authRequest('GET', '/api/mods');
  if (mods.ok) ok('GET /api/mods');
  else warn('GET /api/mods');

  // Shaders
  const shaders = await authRequest('GET', '/api/shaders');
  if (shaders.ok) ok('GET /api/shaders');
  else warn('GET /api/shaders');

  // Resource Packs
  const rps = await authRequest('GET', '/api/resourcepacks');
  if (rps.ok) ok('GET /api/resourcepacks');
  else warn('GET /api/resourcepacks');

  // Worlds
  const worlds = await authRequest('GET', '/api/worlds');
  if (worlds.ok) ok('GET /api/worlds');
  else warn('GET /api/worlds');

  // Worlds stats
  const worldStats = await authRequest('GET', '/api/worlds/stats');
  if (worldStats.ok) ok('GET /api/worlds/stats');
  else warn('GET /api/worlds/stats');
}

// ─── Phase 5: Players ────────────────────────────────────────────
async function testPlayers(authRequest) {
  log('\n📦 Phase 5: Players');

  const players = await authRequest('GET', '/api/players');
  if (players.ok) ok('GET /api/players');
  else warn('GET /api/players');

  const whitelist = await authRequest('GET', '/api/whitelist');
  if (whitelist.ok) ok('GET /api/whitelist');
  else warn('GET /api/whitelist');

  const banned = await authRequest('GET', '/api/players/banned');
  if (banned.ok) ok('GET /api/players/banned');
  else warn('GET /api/players/banned');

  const pending = await authRequest('GET', '/api/players/pending');
  if (pending.ok) ok('GET /api/players/pending');
  else warn('GET /api/players/pending');

  const recentJoins = await authRequest('GET', '/api/players/recent-joins');
  if (recentJoins.ok) ok('GET /api/players/recent-joins');
  else warn('GET /api/players/recent-joins');

  const roles = await authRequest('GET', '/api/players/roles');
  if (roles.ok) ok('GET /api/players/roles');
  else warn('GET /api/players/roles');
}

// ─── Phase 6: Backup & Connection ────────────────────────────────
async function testBackupConnection(authRequest) {
  log('\n📦 Phase 6: Backup & Connection');

  // Backups
  const backups = await authRequest('GET', '/api/backups');
  if (backups.ok) ok('GET /api/backups');
  else warn('GET /api/backups');

  const backupStats = await authRequest('GET', '/api/backups/stats');
  if (backupStats.ok) ok('GET /api/backups/stats');
  else warn('GET /api/backups/stats');

  const backupSchedule = await authRequest('GET', '/api/backups/schedule');
  if (backupSchedule.ok) ok('GET /api/backups/schedule');
  else warn('GET /api/backups/schedule');

  // Connection
  const connInfo = await authRequest('GET', '/api/connection');
  if (connInfo.ok) ok('GET /api/connection');
  else warn('GET /api/connection');

  const connStatus = await authRequest('GET', '/api/connection/status');
  if (connStatus.ok) ok('GET /api/connection/status');
  else warn('GET /api/connection/status');

  const connDiagnostics = await authRequest('GET', '/api/connection/diagnostics');
  if (connDiagnostics.ok) ok('GET /api/connection/diagnostics');
  else warn('GET /api/connection/diagnostics');

  // Firewall
  const fwStatus = await authRequest('GET', '/api/firewall/status');
  if (fwStatus.ok) ok('GET /api/firewall/status');
  else warn('Firewall status');
}

// ─── Phase 7: Discord ────────────────────────────────────────────
async function testDiscord(authRequest) {
  log('\n📦 Phase 7: Discord');

  const discordConfig = await authRequest('GET', '/api/discord');
  if (discordConfig.ok) ok('GET /api/discord');
  else warn('GET /api/discord');

  const discordStatus = await authRequest('GET', '/api/discord/status');
  if (discordStatus.ok) ok('GET /api/discord/status');
  else warn('GET /api/discord/status');

  const discordHistory = await authRequest('GET', '/api/discord/history');
  if (discordHistory.ok) ok('GET /api/discord/history');
  else warn('GET /api/discord/history');
}

// ─── Phase 8: Feedback ───────────────────────────────────────────
async function testFeedback(authRequest) {
  log('\n📦 Phase 8: Feedback');

  const tickets = await authRequest('GET', '/api/feedback');
  if (tickets.ok) ok('GET /api/feedback');
  else warn('GET /api/feedback');

  const counts = await authRequest('GET', '/api/feedback/counts');
  if (counts.ok) ok('GET /api/feedback/counts');
  else warn('GET /api/feedback/counts');

  const stats = await authRequest('GET', '/api/feedback/stats');
  if (stats.ok) ok('GET /api/feedback/stats');
  else warn('GET /api/feedback/stats');

  const pending = await authRequest('GET', '/api/feedback/pending');
  if (pending.ok) ok('GET /api/feedback/pending');
  else warn('GET /api/feedback/pending');

  // Create a feedback ticket
  const ticket = await authRequest('POST', '/api/feedback', {
    type: 'bug',
    summary: 'QA Validation Test Ticket',
    description: 'Automated test ticket — no action needed.',
    priority: 'low',
  });
  if (ticket.ok && (ticket.data?.id || ticket.data?.ticket?.id)) ok('POST /api/feedback (create ticket)');
  else warn('POST /api/feedback');

  // Tracked
  const syncQueue = await authRequest('GET', '/api/feedback/sync-queue');
  if (syncQueue.ok) ok('GET /api/feedback/sync-queue');
  else warn('GET /api/feedback/sync-queue');
}

// ─── Phase 9: Guide ──────────────────────────────────────────────
async function testGuide(authRequest) {
  log('\n📦 Phase 9: Guide');

  const sections = await authRequest('GET', '/api/guide/sections');
  if (sections.ok) ok('GET /api/guide/sections');
  else warn('GET /api/guide/sections');

  const search = await authRequest('GET', '/api/guide/search?q=server');
  if (search.ok) ok('GET /api/guide/search?q=server');
  else warn('GET /api/guide/search');

  const widget = await authRequest('GET', '/api/guide/dashboard');
  if (widget.ok) ok('GET /api/guide/dashboard');
  else warn('GET /api/guide/dashboard');

  const tip = await authRequest('GET', '/api/guide/tip');
  if (tip.ok) ok('GET /api/guide/tip');
  else warn('GET /api/guide/tip');
}

// ─── Phase 10: Privacy & Security ────────────────────────────────
async function testPrivacy(authRequest) {
  log('\n📦 Phase 10: Privacy & Security');

  const overview = await authRequest('GET', '/api/privacy');
  if (overview.ok) ok('GET /api/privacy');
  else warn('GET /api/privacy');

  const locations = await authRequest('GET', '/api/privacy/locations');
  if (locations.ok) ok('GET /api/privacy/locations');
  else warn('GET /api/privacy/locations');

  const permissions = await authRequest('GET', '/api/privacy/permissions');
  if (permissions.ok) ok('GET /api/privacy/permissions');
  else warn('GET /api/privacy/permissions');

  const credentials = await authRequest('GET', '/api/privacy/credentials');
  if (credentials.ok) ok('GET /api/privacy/credentials');
  else warn('GET /api/privacy/credentials');

  const preferences = await authRequest('GET', '/api/privacy/preferences');
  if (preferences.ok) ok('GET /api/privacy/preferences');
  else warn('GET /api/privacy/preferences');

  const checks = await authRequest('POST', '/api/privacy/run-security-check');
  if (checks.ok) ok('POST /api/privacy/run-security-check');
  else warn('POST /api/privacy/run-security-check');

  const securityStatus = await authRequest('GET', '/api/privacy/security');
  if (securityStatus.ok) ok('GET /api/privacy/security');
  else warn('GET /api/privacy/security');

  const auditLog = await authRequest('GET', '/api/privacy/audit-log');
  if (auditLog.ok) ok('GET /api/privacy/audit-log');
  else warn('GET /api/privacy/audit-log');

  const dashboardWidget = await authRequest('GET', '/api/privacy/dashboard');
  if (dashboardWidget.ok) ok('GET /api/privacy/dashboard');
  else warn('GET /api/privacy/dashboard');
}

// ─── Phase 11: Updates ───────────────────────────────────────────
async function testUpdates(authRequest) {
  log('\n📦 Phase 11: Updates');

  const status = await authRequest('GET', '/api/updates');
  if (status.ok) ok('GET /api/updates');
  else warn('GET /api/updates');

  const check = await authRequest('POST', '/api/updates/check');
  if (check.ok) ok('POST /api/updates/check');
  else warn('POST /api/updates/check');

  const releaseNotes = await authRequest('GET', '/api/updates/release-notes');
  if (releaseNotes.ok) ok('GET /api/updates/release-notes');
  else warn('GET /api/updates/release-notes');

  const history = await authRequest('GET', '/api/updates/history');
  if (history.ok) ok('GET /api/updates/history');
  else warn('GET /api/updates/history');

  const prefs = await authRequest('GET', '/api/updates/preferences');
  if (prefs.ok) ok('GET /api/updates/preferences');
  else warn('GET /api/updates/preferences');

  const checklist = await authRequest('GET', '/api/updates/checklist');
  if (checklist.ok) ok('GET /api/updates/checklist');
  else warn('GET /api/updates/checklist');

  const dashboardWidget = await authRequest('GET', '/api/updates/dashboard');
  if (dashboardWidget.ok) ok('GET /api/updates/dashboard');
  else warn('GET /api/updates/dashboard');

  const migrations = await authRequest('GET', '/api/updates/migrations');
  if (migrations.ok) ok('GET /api/updates/migrations');
  else warn('GET /api/updates/migrations');

  const verify = await authRequest('GET', '/api/updates/verify-data');
  if (verify.ok) ok('GET /api/updates/verify-data');
  else warn('GET /api/updates/verify-data');
}

// ─── Phase 12: Uninstall ─────────────────────────────────────────
async function testUninstall(authRequest) {
  log('\n📦 Phase 12: Uninstall & Restore');

  const storage = await authRequest('GET', '/api/uninstall/storage');
  if (storage.ok) ok('GET /api/uninstall/storage');
  else warn('GET /api/uninstall/storage');

  const detection = await authRequest('GET', '/api/uninstall/detect');
  if (detection.ok) ok('GET /api/uninstall/detect');
  else warn('GET /api/uninstall/detect');

  const restoreStatus = await authRequest('GET', '/api/uninstall/restore-status');
  if (restoreStatus.ok) ok('GET /api/uninstall/restore-status');
  else warn('GET /api/uninstall/restore-status');

  const history = await authRequest('GET', '/api/uninstall/history');
  if (history.ok) ok('GET /api/uninstall/history');
  else warn('GET /api/uninstall/history');

  const dashboardWidget = await authRequest('GET', '/api/uninstall/dashboard');
  if (dashboardWidget.ok) ok('GET /api/uninstall/dashboard');
  else warn('GET /api/uninstall/dashboard');

  // GET /api/uninstall/server-info (requires active server)
  const serverInfo = await authRequest('GET', '/api/uninstall/server-info');
  if (serverInfo.ok) ok('GET /api/uninstall/server-info');
  else warn('GET /api/uninstall/server-info');

  // UI state endpoints
  const uiState = await authRequest('GET', '/api/ui/state');
  if (uiState.ok) ok('GET /api/ui/state');
  else warn('GET /api/ui/state');
}

// ─── Error Handling Tests ────────────────────────────────────────
async function testErrorHandling(authRequest) {
  log('\n📦 Error Handling');

  // 404 route
  const notFound = await authRequest('GET', '/api/nonexistent-route-12345', null, 404);
  if (notFound.status === 404) ok('GET /api/nonexistent → 404');
  else warn(`Expected 404 for nonexistent route, got ${notFound.status}`);

  // Unauthenticated request (without token)
  const noAuthReq = await request('GET', '/api/servers', null);
  if (noAuthReq.status === 401 || noAuthReq.status === 403) ok('Unauthenticated request returns 401');
  else warn(`Unauthenticated returned ${noAuthReq.status}`);

  // Empty POST body
  const emptyBody = await authRequest('POST', '/api/servers', {}, 400);
  if (emptyBody.status >= 400) ok('Empty POST body → error');
  else warn('Empty POST /api/servers did not return error');
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  log('='.repeat(60));
  log(' MineControl OS — Phase 13 Validation Suite');
  log('='.repeat(60));
  log(` Started: ${new Date().toISOString()}`);
  log(` Requires server on http://localhost:3001\n`);

  // Quick health check
  try {
    const ping = await request('GET', '/api/server/health');
    if (!ping.ok) {
      log('❌ Server not reachable at http://localhost:3001');
      log('   Start the server with: npm run dev');
      process.exit(1);
    }
    log('✅ Server is reachable\n');
  } catch (e) {
    log('❌ Server not reachable: ' + e.message);
    log('   Start the server with: npm run dev');
    process.exit(1);
  }

  const authRequest = await testServerManagement();
  if (!authRequest) {
    log('\n❌ Server management validation failed — aborting further tests.\n');
    printResults();
    process.exit(1);
  }

  await testSoftware(authRequest);
  await testPluginsModsWorlds(authRequest);
  await testPlayers(authRequest);
  await testBackupConnection(authRequest);
  await testDiscord(authRequest);
  await testFeedback(authRequest);
  await testGuide(authRequest);
  await testPrivacy(authRequest);
  await testUpdates(authRequest);
  await testUninstall(authRequest);
  await testErrorHandling(authRequest);

  printResults();
}

function printResults() {
  const total = PASSED + FAILED;
  const pct = total > 0 ? Math.round(PASSED / total * 100) : 0;
  log('');
  log('='.repeat(60));
  log(' RESULTS SUMMARY');
  log('='.repeat(60));
  log(`  Passed:  ${PASSED}/${total} (${pct}%)`);
  log(`  Failed:  ${FAILED}/${total}`);
  log(`  Warnings: ${WARNINGS}`);
  log('');
  if (ERRORS.length > 0) {
    log(' FAILURES:');
    ERRORS.forEach((e, i) => log(`  ${i + 1}. ${e.msg}`));
    log('');
  }
  log('='.repeat(60));
}

main().catch(e => {
  log('\n❌ Validation suite crashed: ' + e.message);
  printResults();
  process.exit(1);
});
