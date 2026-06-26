import { Router } from 'express';
import { getDatabase } from '../database';
import { SchedulerService, Schedule } from '../services/scheduler';
import { authMiddleware, requirePermission } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Get all schedules
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const serverId = req.query.serverId as string;
    
    let query = 'SELECT * FROM schedules';
    const params: any[] = [];
    
    if (serverId) {
      query += ' WHERE server_id = ?';
      params.push(serverId);
    }
    
    const schedules = db.prepare(query).all(...params);
    res.json(schedules);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create schedule
router.post('/', requirePermission('*'), (req, res) => {
  try {
    const db = getDatabase();
    const { server_id, name, cron, action, command, enabled } = req.body;
    
    const id = uuidv4();
    const schedule: Schedule = {
      id,
      server_id,
      name,
      cron,
      action,
      command,
      enabled: enabled ? 1 : 0
    };
    
    db.prepare(`
      INSERT INTO schedules (id, server_id, name, cron, action, command, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, server_id, name, cron, action, command || null, schedule.enabled);
    
    if (schedule.enabled) {
      SchedulerService.scheduleTask(schedule);
    }
    
    res.json(schedule);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update schedule
router.put('/:id', requirePermission('*'), (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const { name, cron, action, command, enabled } = req.body;
    
    db.prepare(`
      UPDATE schedules 
      SET name = ?, cron = ?, action = ?, command = ?, enabled = ?
      WHERE id = ?
    `).run(name, cron, action, command || null, enabled ? 1 : 0, id);
    
    SchedulerService.reloadTask(id);
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete schedule
router.delete('/:id', requirePermission('*'), (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    
    db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    SchedulerService.removeTask(id);
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
