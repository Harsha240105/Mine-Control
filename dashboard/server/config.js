import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT) || 3001,
  jwtSecret: process.env.JWT_SECRET || 'change-this-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  dbPath: process.env.DB_PATH || './data/dashboard.db',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  mcDir: process.env.MC_DIR || '/opt/minecraft/server',
  mcLogDir: process.env.MC_LOG_DIR || '/opt/minecraft/logs',
  nodeEnv: process.env.NODE_ENV || 'development'
};
