import { Router } from 'express';
import { getDatabase } from '../database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Get all UI state for current user
router.get('/state', authMiddleware, (req: any, res) => {
  const db = getDatabase();
  const rows = db.prepare('SELECT key, value FROM ui_state').all() as any[];
  const state: Record<string, string> = {};
  for (const row of rows) {
    state[row.key] = row.value;
  }
  res.json(state);
});

// Save UI state (batch)
router.post('/state', authMiddleware, (req: any, res) => {
  const db = getDatabase();
  const updates = req.body as Record<string, string>;
  const upsert = db.prepare(
    "INSERT OR REPLACE INTO ui_state (key, value, updated_at) VALUES (?, ?, datetime('now'))"
  );
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      upsert.run(key, value);
    }
  });
  tx();
  res.json({ success: true });
});

// Get a single UI state key
router.get('/state/:key', authMiddleware, (req: any, res) => {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM ui_state WHERE key = ?').get(req.params.key) as any;
  res.json({ key: req.params.key, value: row?.value || null });
});

export default router;
