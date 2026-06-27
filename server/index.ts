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
import { getDatabase } from './database';
import { minecraftServer } from './services/minecraftServer';
import { backupService } from './services/backup';
import { BASE_PATH, resolvePath, setMinecraftDir, getMinecraftDir } from './paths';

import authRoutes from './routes/auth';
import serverRoutes from './routes/server';
import serverManagerRoutes from './routes/servers';
import playerRoutes from './routes/players';
import worldRoutes from './routes/worlds';
import pluginRoutes from './routes/plugins';
import backupRoutes from './routes/backup';
import claimRoutes from './routes/claims';
import buildRoutes from './routes/builds';
import githubRoutes from './routes/github';
import compatibilityRoutes from './routes/compatibility';
import scheduleRoutes from './routes/schedules';
import marketplaceRoutes from './routes/marketplace';
import analyticsRoutes from './routes/analytics';
import discordRoutes from './routes/discord';
import { SchedulerService } from './services/scheduler';
import { discordService } from './services/discord';

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
app.use('/api/backups', backupRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/builds', buildRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/compatibility', compatibilityRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/server', analyticsRoutes);
app.use('/api/discord', discordRoutes);

// API 404 handler (unknown API routes return JSON, not HTML)
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[Error] ${req.method} ${req.url}:`, err.stack || err.message || err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR'
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

// Helper: emit full server status
function emitServerUpdate() {
  try {
    const db = getDatabase();
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
    const config = minecraftServer.getConfig();
    const onlinePlayers = db.prepare('SELECT COUNT(*) as count FROM players WHERE status = ?').get('online') as any;
    io.emit('server:update', {
      running: minecraftServer.isRunning,
      starting: minecraftServer.isStarting,
      state: minecraftServer.state,
      onlinePlayers: minecraftServer.isRunning ? (onlinePlayers?.count || 0) : null,
      maxPlayers: config.maxPlayers,
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
});

minecraftServer.on('server:stopped', (code: number | null) => {
  io.emit('server:stopped', code);
  io.emit('server:state', 'stopped');
  io.emit('server:status', { running: false, starting: false, code });
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

// Auto backup every hour
cron.schedule('0 * * * *', async () => {
  console.log('[Cron] Running auto-backup...');
  try {
    await backupService.createBackup(
      `Auto-Backup-${new Date().toISOString().slice(0, 10)}`,
      'auto',
      false
    );
    console.log('[Cron] Auto-backup completed');
  } catch (error) {
    console.error('[Cron] Auto-backup failed:', error);
  }
});

// Auto world save every 30 minutes
cron.schedule('*/30 * * * *', () => {
  if (minecraftServer.isRunning) {
    minecraftServer.sendCommand('save-all').catch(() => {});
    console.log('[Cron] World save triggered');
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
});
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

// Initialize active server
const db = getDatabase();
const activeRow = db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any;
const activeId = activeRow?.value;
if (activeId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(activeId) as any;
  if (server) {
    setMinecraftDir(server.directory);
    minecraftServer.loadServer(server.directory);
    console.log(`[Server] Active: ${server.name} (${server.slug})`);
  }
} else {
  // Create default server from existing config or use default minecraft dir
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
    setMinecraftDir(dir);
    minecraftServer.loadServer(dir);
    console.log(`[Server] Created default server at ${dir}`);
  }
}

// Start server
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

  const osVersion = (() => { try { return require('../package.json').version; } catch { return require('../../package.json').version; } })();
  console.log(`
  ╔══════════════════════════════════════════╗
  ║         MineControl OS v${osVersion.padEnd(16, ' ')} ║
  ║     Minecraft Server Management         ║
  ║══════════════════════════════════════════║
  ║  Server:  http://localhost:${PORT}         ║
  ║  API:     http://localhost:${PORT}/api    ║
  ║  Socket:  ws://localhost:${PORT}          ║
  ╚══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  if (minecraftServer.isRunning) {
    await minecraftServer.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (minecraftServer.isRunning) {
    await minecraftServer.stop();
  }
  process.exit(0);
});
