import 'express-async-errors';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import cron from 'node-cron';
import { rateLimiter, verifyToken } from './middleware/auth';
import { getDatabase, closeDatabase } from './database';
import { activeServer } from './activeServer';
import { setIO } from './socketManager';
import { minecraftServer } from './services/minecraftServer';
import { backupService, autoBackupIfEnabled } from './services/backup';
import { BASE_PATH, resolvePath, setMinecraftDir, getMinecraftDir } from './paths';

import authRoutes from './routes/auth';
import serverRoutes from './routes/server';
import serverManagerRoutes from './routes/servers';
import playerRoutes from './routes/players';
import worldRoutes from './routes/worlds';
import pluginRoutes from './routes/plugins';
import modRoutes from './routes/mods';
import shaderRoutes from './routes/shaders';
import resourcePackRoutes from './routes/resourcepacks';
import backupRoutes from './routes/backup';
import claimRoutes from './routes/claims';
import buildRoutes from './routes/builds';
import githubRoutes from './routes/github';
import compatibilityRoutes from './routes/compatibility';
import scheduleRoutes from './routes/schedules';
import marketplaceRoutes from './routes/marketplace';
import analyticsRoutes from './routes/analytics';
import discordRoutes from './routes/discord';
import feedbackRoutes from './routes/feedback';
import privacyRoutes from './routes/privacy';
import uiRoutes from './routes/ui';
import importRoutes from './routes/import';
import guideRoutes from './routes/guide';
import updateRoutes from './routes/updates';
import uninstallRoutes from './routes/uninstall';
import { SchedulerService } from './services/scheduler';
import { discordService } from './services/discord';
import { feedbackService } from './services/feedback';
import { autoDetectPlayers } from './services/playerDetection';
import { detectWorlds, syncWorldFromServerDir } from './services/worldManager';
import { connectionManager as connManager } from './services/connectionManager';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3001', 'file://'],
    methods: ['GET', 'POST'],
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 120000,
  },
});

setIO(io);

// Log Socket.IO errors
io.engine.on('connection_error', (err) => {
  console.error('[Socket.IO] Connection error:', err.message || err.code);
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3001', 'file://'],
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
// JSON parse error handler (malformed request bodies)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next(err);
});
app.use(morgan('dev'));
app.use(rateLimiter(60000, 200));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/server', serverRoutes);
app.use('/api/servers', serverManagerRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/worlds', worldRoutes);
app.use('/api/plugins', pluginRoutes);
app.use('/api/mods', modRoutes);
app.use('/api/shaders', shaderRoutes);
app.use('/api/resourcepacks', resourcePackRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/builds', buildRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/compatibility', compatibilityRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/discord', discordRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/import', importRoutes);
app.use('/api/ui', uiRoutes);
app.use('/api/guide', guideRoutes);
app.use('/api/updates', updateRoutes);
app.use('/api/uninstall', uninstallRoutes);

// API 404 handler (unknown API routes return JSON, not HTML)
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
    reason: 'The requested API endpoint does not exist',
    details: `${req.method} ${req.originalUrl}`,
    repairAction: 'Check the URL and try again'
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[Error] ${req.method} ${req.url}:`, err.stack || err.message || err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    reason: err.reason || (status === 400 ? 'Bad request' : 'An unexpected error occurred on the server'),
    details: err.details || (err.stack ? err.stack.split('\n').slice(0, 3).join(' ') : ''),
    repairAction: err.repairAction || (status === 400 ? 'Check your input and try again' : 'Restart the application if the problem persists')
  });
});

// Serve static files
const possiblePaths = [
  path.join(__dirname, '../dist/client'),
  path.join(__dirname, '../client'),
  resolvePath('dist/client'),
];
let clientPath = '';
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    clientPath = p;
    break;
  }
}
if (clientPath) {
  app.use(express.static(clientPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => {
    res.status(200).json({ status: 'API is running', ui: 'Run `npm run dev` for the frontend dev server on port 5173' });
  });
}

// Helper: emit full player list
function emitPlayersUpdate() {
  try {
    const db = getDatabase();
    const players = db.prepare('SELECT * FROM players ORDER BY last_login DESC').all();
    io.emit('players:update', players);
  } catch (e) {
    // ignore
  }
}

// Helper: emit full worlds list
function emitWorldsUpdate() {
  try {
    const db = getDatabase();
    const worlds = db.prepare('SELECT * FROM worlds ORDER BY created_at DESC').all();
    io.emit('worlds:update', worlds);
  } catch (e) {
    // ignore
  }
}

// Helper: emit full server status
function emitServerUpdate() {
  try {
    const db = getDatabase();
    const config = minecraftServer.getConfig();
    const onlinePlayers = db.prepare('SELECT COUNT(*) as count FROM players WHERE status = ?').get('online') as any;
    io.emit('server:update', {
      serverId: activeServer.current?.id || null,
      running: minecraftServer.isRunning,
      starting: minecraftServer.isStarting,
      state: minecraftServer.state,
      onlinePlayers: minecraftServer.isRunning ? (onlinePlayers?.count || 0) : null,
      maxPlayers: config?.maxPlayers || 4,
      tps: 20.0,
    });
  } catch (e) {
    // ignore
  }
}

// Socket.IO
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Send initial state to newly connected clients
  socket.emit('server:status', { running: minecraftServer.isRunning, starting: minecraftServer.isStarting, state: minecraftServer.state });
  emitPlayersUpdate();
  emitServerUpdate();
  emitWorldsUpdate();
  connManager.emitConnectionUpdate().catch(() => {});

  socket.on('authenticate', (token: string) => {
    try {
      const user = verifyToken(token);
      socket.data.user = user;
      socket.emit('authenticated', { success: true });
    } catch {
      socket.emit('authenticated', { success: false });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Client disconnected: ${socket.id} (${reason})`);
  });
});

// Forward Minecraft server events to Socket.IO
minecraftServer.on('server:state', (state: string) => {
  io.emit('server:state', state);
  io.emit('server:status', { running: state === 'running', starting: state === 'starting' || state === 'stopping' });
  emitServerUpdate();
});

minecraftServer.on('server:output', (data: string) => {
  io.emit('server:output', data);
  io.emit('console:update', data);
});

minecraftServer.on('player:join', (username: string) => {
  io.emit('player:join', username);
  emitPlayersUpdate();
});

minecraftServer.on('player:leave', (username: string) => {
  io.emit('player:leave', username);
  emitPlayersUpdate();
});

minecraftServer.on('player:chat', (username: string, message: string) => {
  io.emit('player:chat', username, message);
});

minecraftServer.on('server:started', () => {
  io.emit('server:started');
  io.emit('server:state', 'running');
  io.emit('server:status', { running: true, starting: false });

  // Refresh connection status
  connManager.emitConnectionUpdate().catch(() => {});

  // Re-scan players when server starts
  try {
    const result = autoDetectPlayers();
    if (result.created > 0 || result.updated > 0) {
      emitPlayersUpdate();
    }
  } catch (e) {
    console.error('[Detection] Server-start scan failed:', e);
  }
});

minecraftServer.on('server:stopped', (code: number | null) => {
  io.emit('server:stopped', code);
  io.emit('server:state', 'stopped');
  io.emit('server:status', { running: false, starting: false, code });
  // Refresh connection status
  connManager.emitConnectionUpdate().catch(() => {});
});

minecraftServer.on('server:error', (error: string) => {
  io.emit('server:error', error);
});

minecraftServer.on('server:crashed', (error: string) => {
  io.emit('server:crashed', error);
});

minecraftServer.on('stats:update', (stats) => {
  io.emit('stats:update', stats);
  emitServerUpdate();
});

// Scheduled tasks

// Scheduled backups (check every 15 minutes for pending schedules)
cron.schedule('*/15 * * * *', async () => {
  try {
    await backupService.runScheduledBackups();
  } catch (error) {
    console.error('[Cron] Scheduled backup check failed:', error);
  }
});

// Auto world save every 30 minutes
cron.schedule('*/30 * * * *', () => {
  if (minecraftServer.isRunning) {
    minecraftServer.sendCommand('save-all').catch(() => {});
    console.log('[Cron] World save triggered');
  }
});

// Periodic world detection (every 15 minutes)
cron.schedule('*/15 * * * *', () => {
  try {
    const detected = detectWorlds();
    if (detected.length > 0) {
      io.emit('worlds:update');
      console.log(`[Worlds] Periodic scan: ${detected.length} new worlds`);
    }
  } catch (e) {
    console.error('[Worlds] Periodic scan failed:', e);
  }
});

// Periodic player detection (every 5 minutes)
cron.schedule('*/5 * * * *', () => {
  try {
    const result = autoDetectPlayers();
    if (result.created > 0 || result.updated > 0) {
      emitPlayersUpdate();
      console.log(`[Detection] Periodic scan: ${result.created} created, ${result.updated} updated`);
    }
  } catch (e) {
    console.error('[Detection] Periodic scan failed:', e);
  }
});

// Periodic connection status refresh (every 5 minutes)
cron.schedule('*/5 * * * *', () => {
  connManager.emitConnectionUpdate().catch(() => {});
});

// Auto-sync feedback queue (every 2 minutes)
cron.schedule('*/2 * * * *', async () => {
  try {
    const result = await feedbackService.processSyncQueue();
    if (result.synced > 0 || result.failed > 0) {
      console.log(`[Feedback] Sync: ${result.synced} synced, ${result.failed} failed`);
    }
  } catch (error) {
    console.error('[Feedback] Sync cron failed:', error);
  }
});

// Cleanup old stats (keep 7 days)
cron.schedule('0 0 * * 0', () => {
  const db = getDatabase();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM system_stats WHERE timestamp < ?').run(weekAgo);
  console.log('[Cron] Old stats cleaned');
});

// Catch unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
  console.error('[Uncaught Exception] The application is in an undefined state. Exiting after logging.');
  try {
    const logPath = path.join(process.env.APP_DATA_PATH || __dirname, 'crash.log');
    fs.writeFileSync(logPath, `[${new Date().toISOString()}] Uncaught Exception: ${err.stack || err.message}\n`, { flag: 'a' });
  } catch {}
});
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
  try {
    const logPath = path.join(process.env.APP_DATA_PATH || __dirname, 'crash.log');
    const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
    fs.writeFileSync(logPath, `[${new Date().toISOString()}] Unhandled Rejection: ${message}\n`, { flag: 'a' });
  } catch {}
});

// ══════════════════════════════════════════════════════════════════════
// PHASE 1-2: Database initialization (open + migrate + validate + repair)
// ══════════════════════════════════════════════════════════════════════
console.log('[Startup] Phase 1-2: Initializing database...');
let db: ReturnType<typeof getDatabase>;
try {
  db = getDatabase();
  console.log('[Startup] Phase 1-2: Database ready');
} catch (err: any) {
  console.error('[Startup] FATAL: Database initialization failed:', err.message);
  // Show error in Electron if possible, otherwise exit
  try {
    const { dialog } = require('electron');
    dialog.showErrorBox('Database Error', 'Failed to initialize database:\n' + err.message + '\n\nThe application cannot continue.');
  } catch {}
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 3: Initialize services (ONLY after database is confirmed ready)
// ══════════════════════════════════════════════════════════════════════
console.log('[Startup] Phase 3: Initializing services...');

// 3a: Initialize active server
try {
  const active = activeServer.load();
  if (active) {
    setMinecraftDir(active.directory);
    minecraftServer.loadServer(active.directory);
    console.log(`[Server] Active: ${active.name} (${active.slug})`);
  } else {
    const count = db.prepare('SELECT COUNT(*) as c FROM servers').get() as any;
    if (count.c === 0) {
      const { v4 } = require('uuid');
      const id = v4();
      const portRow = db.prepare("SELECT value FROM server_config WHERE key = 'port'").get() as any;
      const port = parseInt(portRow?.value || '25565');
      const dir = getMinecraftDir();
      db.prepare(`
        INSERT INTO servers (id, name, slug, port, directory, status)
        VALUES (?, 'My Server', 'my-server', ?, ?, 'stopped')
      `).run(id, Number.isNaN(port) ? 25565 : port, dir);
      db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('active_server_id', ?)").run(id);
      activeServer.load();
      setMinecraftDir(dir);
      minecraftServer.loadServer(dir);
      console.log(`[Server] Created default server at ${dir}`);
    } else {
      activeServer.load();
    }
  }
} catch (err) {
  console.error('[Startup] Failed to initialize active server:', err);
}

// 3b: Auto-detect players from filesystem
try {
  const result = autoDetectPlayers();
  if (result.created > 0 || result.updated > 0) {
    console.log(`[Detection] ${result.created} players created, ${result.updated} updated`);
  }
} catch (e) {
  console.error('[Detection] Initial scan failed:', e);
}

// 3c: Auto-detect worlds from filesystem
try {
  const detected = detectWorlds();
  if (detected.length > 0) {
    console.log(`[Worlds] ${detected.length} worlds auto-detected`);
  }
  const synced = syncWorldFromServerDir();
  if (synced) {
    console.log(`[Worlds] Synced server world: ${synced.name}`);
  }
} catch (e) {
  console.error('[Worlds] Initial scan failed:', e);
}

console.log('[Startup] Phase 3: Services initialized');

// ══════════════════════════════════════════════════════════════════════
// PHASE 4: Start HTTP server + Socket.IO (ONLY after all services init)
// ══════════════════════════════════════════════════════════════════════
console.log('[Startup] Phase 4: Starting HTTP server...');
const portToUse = PORT;
server.listen(portToUse, () => {
  console.log(`[Server] Running on port ${portToUse}`);
  
  // Initialize cron schedules
  try {
    SchedulerService.initialize();
  } catch (err) {
    console.error('[Server] Failed to initialize schedules:', err);
  }
  
  // Initialize Discord
  discordService.initialize().catch(err => console.error('[Discord] Init failed:', err));

  const appVersion = (() => { try { return require('../package.json').version; } catch { return require('../../package.json').version; } })();
  console.log(`
  ╔══════════════════════════════════════════╗
  ║         MineControl OS v${appVersion.padEnd(16, ' ')} ║
  ║     Minecraft Server Management         ║
  ║══════════════════════════════════════════║
  ║  Server:  http://localhost:${PORT}         ║
  ║  API:     http://localhost:${PORT}/api    ║
  ║  Socket:  ws://localhost:${PORT}          ║
  ╚══════════════════════════════════════════╝
  `);
  console.log('[Startup] Phase 4: Server ready');
});

// Graceful shutdown
async function gracefulShutdown() {
  console.log('\nShutting down...');
  discordService.destroy();
  SchedulerService.stopAll();
  if (minecraftServer.isRunning) {
    await minecraftServer.stop();
  }
  io.close();
  try { closeDatabase(); } catch {}
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
