import { Router } from 'express';
import { getDatabase } from '../database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import https from 'https';
import { storeCredential, getCredential, hasCredential } from '../services/encryption';

const router = Router();

const GITHUB_OWNER = 'Harsha240105';
const GITHUB_REPO = 'Mine-Control';

// GitHub Configuration

router.get('/config', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const ownerRow = db.prepare("SELECT value FROM server_config WHERE key = 'github_owner'").get() as any;
  const repoRow = db.prepare("SELECT value FROM server_config WHERE key = 'github_repo'").get() as any;
  res.json({
    owner: ownerRow?.value || '',
    repo: repoRow?.value || '',
    hasToken: hasCredential('github_token'),
  });
});

router.put('/config', authMiddleware, (req: AuthRequest, res) => {
  const { owner, repo, token } = req.body;
  const db = getDatabase();

  db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('github_owner', ?)").run(owner || '');
  db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('github_repo', ?)").run(repo || '');

  if (token && !token.includes('•')) {
    storeCredential('github_token', token);
  }

  res.json({ success: true });
});

router.post('/test-connection', authMiddleware, async (req: AuthRequest, res) => {
  const { owner, repo, token: inlineToken } = req.body;
  if (!owner || !repo) {
    return res.status(400).json({ error: 'Repository owner and name are required' });
  }

  const token = inlineToken || getCredential('github_token');
  if (!token) {
    return res.status(400).json({ error: 'No GitHub token configured. Save a token first.' });
  }

  try {
    const result = await new Promise<any>((resolve, reject) => {
      const req_gh = https.request({
        hostname: 'api.github.com',
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'MineControl-OS/1.0',
        },
      }, (response) => {
        let data = '';
        response.on('data', (chunk: string) => { data += chunk; });
        response.on('end', () => {
          try {
            if (response.statusCode === 200) {
              const parsed = JSON.parse(data);
              resolve({
                success: true,
                fullName: parsed.full_name,
                private: parsed.private,
                description: parsed.description,
              });
            } else if (response.statusCode === 401) {
              reject(new Error('Invalid token — authentication failed'));
            } else if (response.statusCode === 403) {
              reject(new Error('Token does not have access to this repository'));
            } else if (response.statusCode === 404) {
              reject(new Error(`Repository ${owner}/${repo} not found`));
            } else {
              const errData = JSON.parse(data);
              reject(new Error(errData.message || `GitHub API error (${response.statusCode})`));
            }
          } catch (e: any) {
            reject(new Error(`GitHub API error (${response.statusCode})`));
          }
        });
      });
      req_gh.on('error', (e) => reject(new Error(`Network error: ${e.message}`)));
      req_gh.end();
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

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
