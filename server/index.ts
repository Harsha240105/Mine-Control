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
import { BASE_PATH, resolvePath } from './paths';

import authRoutes from './routes/auth';
import serverRoutes from './routes/server';
import playerRoutes from './routes/players';
import worldRoutes from './routes/worlds';
import pluginRoutes from './routes/plugins';
import backupRoutes from './routes/backup';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3001', 'file://'],
    methods: ['GET', 'POST'],
  },
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
app.use(morgan('dev'));
app.use(rateLimiter(60000, 200));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/server', serverRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/worlds', worldRoutes);
app.use('/api/plugins', pluginRoutes);
app.use('/api/backups', backupRoutes);

// Global error handler (must be after routes)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.stack || err.message || err);
  res.status(500).json({ error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error' });
});

// Serve static files (works in both dev and production)
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

// Socket.IO
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('authenticate', (token: string) => {
    try {
      const user = verifyToken(token);
      socket.data.user = user;
      socket.emit('authenticated', { success: true });
    } catch {
      socket.emit('authenticated', { success: false });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Forward Minecraft server events to Socket.IO
minecraftServer.on('server:output', (data: string) => {
  io.emit('server:output', data);
});

minecraftServer.on('player:join', (username: string) => {
  io.emit('player:join', username);
});

minecraftServer.on('player:leave', (username: string) => {
  io.emit('player:leave', username);
});

minecraftServer.on('player:chat', (username: string, message: string) => {
  io.emit('player:chat', username, message);
});

minecraftServer.on('server:started', () => {
  io.emit('server:started');
  io.emit('server:status', { running: true, starting: false });
});

minecraftServer.on('server:stopped', (code: number | null) => {
  io.emit('server:stopped', code);
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
});

// Scheduled tasks

// Auto backup every hour (configurable)
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

// Start server
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║         MineControl OS v1.0.5           ║
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
