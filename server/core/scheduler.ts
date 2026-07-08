import { info, error } from './logger';

interface ScheduledTask {
  id: string;
  name: string;
  intervalMs: number;
  runOnStart: boolean;
  fn: () => Promise<void>;
  handle: ReturnType<typeof setInterval> | null;
}

const tasks: Map<string, ScheduledTask> = new Map();

export function registerTask(id: string, name: string, intervalMs: number, fn: () => Promise<void>, runOnStart = false): void {
  if (tasks.has(id)) {
    error('Scheduler', `Task '${id}' already registered`);
    return;
  }
  tasks.set(id, { id, name, intervalMs, runOnStart, fn, handle: null });
  info('Scheduler', `Registered task: ${name} (every ${intervalMs}ms)`);
}

export function startAll(): void {
  for (const [id, task] of tasks) {
    if (task.runOnStart) {
      (async () => {
        try {
          info('Scheduler', `Running startup task: ${task.name}`);
          await task.fn();
        } catch (e: any) {
          error('Scheduler', `Startup task '${task.name}' failed: ${e.message}`);
        }
      })();
    }
    task.handle = setInterval(async () => {
      try {
        await task.fn();
      } catch (e: any) {
        error('Scheduler', `Task '${task.name}' failed: ${e.message}`);
      }
    }, task.intervalMs);
  }
  info('Scheduler', `Started ${tasks.size} background tasks`);
}

export function stopAll(): void {
  for (const [id, task] of tasks) {
    if (task.handle) {
      clearInterval(task.handle);
      task.handle = null;
    }
  }
  info('Scheduler', 'All background tasks stopped');
}

export function unregisterTask(id: string): void {
  const task = tasks.get(id);
  if (task?.handle) {
    clearInterval(task.handle);
  }
  tasks.delete(id);
}

export function getTaskStatus(): Array<{ id: string; name: string; intervalMs: number; running: boolean }> {
  return Array.from(tasks.values()).map(t => ({
    id: t.id,
    name: t.name,
    intervalMs: t.intervalMs,
    running: t.handle !== null,
  }));
}
