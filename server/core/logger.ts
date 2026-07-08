export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVELS: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

function getLevel(): LogLevel {
  return LOG_LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LogLevel.INFO;
}

function timestamp(): string {
  return new Date().toISOString();
}

export interface LogContext {
  requestId?: string;
  serverId?: string;
  userId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export function debug(module: string, message: string, context?: LogContext): void {
  if (getLevel() <= LogLevel.DEBUG) {
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    console.log(`[${timestamp()}] [DEBUG] [${module}] ${message}${ctx}`);
  }
}

export function info(module: string, message: string, context?: LogContext): void {
  if (getLevel() <= LogLevel.INFO) {
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    console.log(`[${timestamp()}] [INFO] [${module}] ${message}${ctx}`);
  }
}

export function warn(module: string, message: string, context?: LogContext): void {
  if (getLevel() <= LogLevel.WARN) {
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    console.warn(`[${timestamp()}] [WARN] [${module}] ${message}${ctx}`);
  }
}

export function error(module: string, message: string, context?: LogContext): void {
  if (getLevel() <= LogLevel.ERROR) {
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    console.error(`[${timestamp()}] [ERROR] [${module}] ${message}${ctx}`);
  }
}
