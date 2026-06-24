import { Router } from 'express';
import { getDatabase } from '../database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import https from 'https';

const router = Router();

const GITHUB_OWNER = 'Harsha240105';
const GITHUB_REPO = 'Mine-Control';

router.post('/bug-report', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { title, description, logs, images, videos, username } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    let body = `## Bug Report\n\n**Reported by:** ${username || req.user?.username || 'Anonymous'}\n\n**Description:**\n${description}\n\n`;
    if (logs) body += `\n**Logs:**\n\`\`\`\n${logs.slice(0, 5000)}\n\`\`\`\n`;
    if (images?.length) body += `\n**Images attached:** ${images.length}\n`;
    if (videos?.length) body += `\n**Videos attached:** ${videos.length}\n`;

    const db = getDatabase();
    const report = {
      id: uuidv4(),
      title,
      description: body,
      type: 'bug',
      status: 'open',
      username: username || req.user?.username || 'Anonymous',
      image_count: images?.length || 0,
      video_count: videos?.length || 0,
      created_at: new Date().toISOString(),
    };
    db.prepare(
      'INSERT INTO github_issues (id, title, description, type, status, username, image_count, video_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(...Object.values(report));

    res.json({ success: true, message: 'Bug report submitted', id: report.id });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/feature-request', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { title, description, username } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const body = `## Feature Request\n\n**Requested by:** ${username || req.user?.username || 'Anonymous'}\n\n**Description:**\n${description}\n`;

    const db = getDatabase();
    const request = {
      id: uuidv4(),
      title,
      description: body,
      type: 'feature',
      status: 'open',
      username: username || req.user?.username || 'Anonymous',
      image_count: 0,
      video_count: 0,
      created_at: new Date().toISOString(),
    };
    db.prepare(
      'INSERT INTO github_issues (id, title, description, type, status, username, image_count, video_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(...Object.values(request));

    res.json({ success: true, message: 'Feature request submitted', id: request.id });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/issues', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const issues = db.prepare('SELECT * FROM github_issues ORDER BY created_at DESC').all();
  res.json(issues);
});

export default router;
