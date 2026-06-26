import cron from 'node-cron';
import { getDatabase } from '../database';
import { v4 as uuidv4 } from 'uuid';
import { minecraftServer } from './minecraftServer';
import { backupService } from './backup';

export interface Schedule {
  id: string;
  server_id: string;
  name: string;
  cron: string;
  action: 'start' | 'stop' | 'restart' | 'backup' | 'command';
  command?: string;
  enabled: number;
  last_run?: string;
}

export class SchedulerService {
  private static tasks = new Map<string, cron.ScheduledTask>();

  static initialize() {
    const db = getDatabase();
    const schedules = db.prepare('SELECT * FROM schedules WHERE enabled = 1').all() as Schedule[];
    
    for (const schedule of schedules) {
      this.scheduleTask(schedule);
    }
    console.log(`[Scheduler] Initialized ${schedules.length} active tasks.`);
  }

  static scheduleTask(schedule: Schedule) {
    if (this.tasks.has(schedule.id)) {
      this.tasks.get(schedule.id)!.stop();
      this.tasks.delete(schedule.id);
    }

    if (!cron.validate(schedule.cron)) {
      console.error(`[Scheduler] Invalid cron expression for task ${schedule.id}: ${schedule.cron}`);
      return;
    }

    const task = cron.schedule(schedule.cron, async () => {
      console.log(`[Scheduler] Executing task ${schedule.name} (${schedule.action}) for server ${schedule.server_id}`);
      
      try {
        const db = getDatabase();
        
        switch (schedule.action) {
          case 'start':
            await minecraftServer.start();
            break;
          case 'stop':
            await minecraftServer.stop();
            break;
          case 'restart':
            await minecraftServer.stop();
            await minecraftServer.start();
            break;
          case 'backup':
            await backupService.createBackup(`Scheduled Backup - ${schedule.name}`, 'auto');
            break;
          case 'command':
            if (schedule.command) {
              await minecraftServer.sendCommand(schedule.command);
            }
            break;
        }

        db.prepare('UPDATE schedules SET last_run = datetime("now") WHERE id = ?').run(schedule.id);
      } catch (err) {
        console.error(`[Scheduler] Task ${schedule.name} failed:`, err);
      }
    });

    this.tasks.set(schedule.id, task);
  }

  static removeTask(id: string) {
    if (this.tasks.has(id)) {
      this.tasks.get(id)!.stop();
      this.tasks.delete(id);
    }
  }

  static reloadTask(id: string) {
    const db = getDatabase();
    const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as Schedule | undefined;
    
    if (schedule && schedule.enabled) {
      this.scheduleTask(schedule);
    } else {
      this.removeTask(id);
    }
  }
}
