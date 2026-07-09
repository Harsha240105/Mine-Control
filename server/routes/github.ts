import { Router } from 'express';
import { getDatabase } from '../database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import https from 'https';
import { storeCredential, getCredential, hasCredential } from '../services/encryption';

const router = Router();

// All GitHub routes are Owner-only for privacy
router.use(authMiddleware, (req: AuthRequest, res, next) => {
  if (req.user?.role !== 'Owner') {
    return res.status(403).json({ error: 'Only the application owner can access GitHub features' });
  }
  next();
});

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
  const db = getDatabase();
  let { owner, repo, token: inlineToken } = req.body;

  // Use stored config if not provided
  if (!owner) {
    const ownerRow = db.prepare("SELECT value FROM server_config WHERE key = 'github_owner'").get() as any;
    owner = ownerRow?.value || GITHUB_OWNER;
  }
  if (!repo) {
    const repoRow = db.prepare("SELECT value FROM server_config WHERE key = 'github_repo'").get() as any;
    repo = repoRow?.value || GITHUB_REPO;
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
              reject(new Error('Invalid GitHub token. Generate a new token at GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens with Issues: Read & Write permission.'));
            } else if (response.statusCode === 403) {
              reject(new Error('Token does not have access to this repository. Ensure your token has Issues: Read and Write permissions.'));
            } else if (response.statusCode === 404) {
              reject(new Error(`Repository ${owner}/${repo} not found. Check the owner and repository name.`));
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

// GitHub Diagnostics
router.get('/diagnostics', authMiddleware, async (req: AuthRequest, res) => {
  const db = getDatabase();
  const ownerRow = db.prepare("SELECT value FROM server_config WHERE key = 'github_owner'").get() as any;
  const repoRow = db.prepare("SELECT value FROM server_config WHERE key = 'github_repo'").get() as any;
  const owner = ownerRow?.value || GITHUB_OWNER;
  const repo = repoRow?.value || GITHUB_REPO;
  const token = getCredential('github_token');

  const checks: any[] = [];
  let tokenValid = false;
  let repoReachable = false;
  let issuesPermission = false;
  let lastSync: string | null = null;

  // 1. Check if token exists
  if (!token) {
    checks.push({ name: 'GitHub Token', status: 'fail', message: 'No GitHub token configured. Save a token in Settings → GitHub.' });
  } else {
    checks.push({ name: 'GitHub Token', status: 'pass', message: 'Token is configured' });
  }

  // 2. Test API connection
  if (token && owner && repo) {
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
            'X-Last-Sync': lastSync || 'never',
          },
        }, (response) => {
          let data = '';
          response.on('data', (chunk: string) => { data += chunk; });
          response.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (response.statusCode === 200) {
                repoReachable = true;
                tokenValid = true;
                // Check if token has issues:write permission by trying to list issues
                resolve({ status: response.statusCode, body: parsed, ok: true });
              } else if (response.statusCode === 401) {
                resolve({ status: response.statusCode, body: 'Invalid token', ok: false });
              } else if (response.statusCode === 403) {
                resolve({ status: response.statusCode, body: parsed, ok: false });
              } else if (response.statusCode === 404) {
                resolve({ status: response.statusCode, body: 'Not found', ok: false });
              } else {
                resolve({ status: response.statusCode, body: parsed, ok: false });
              }
            } catch {
              resolve({ status: response.statusCode, body: data.slice(0, 500), ok: false });
            }
          });
        });
        req_gh.on('error', (e) => reject(new Error(`Network error: ${e.message}`)));
        req_gh.setTimeout(10000, () => { req_gh.destroy(); reject(new Error('Request timed out')); });
        req_gh.end();
      });

      if (result.ok && result.status === 200) {
        repoReachable = true;
        checks.push({ name: 'Repository Access', status: 'pass', message: `${owner}/${repo} is accessible` });

        // Test issues permission
        try {
          const issuesResult = await new Promise<any>((resolve, reject) => {
            const req2 = https.request({
              hostname: 'api.github.com',
              path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?per_page=1`,
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
                if (response.statusCode === 200) {
                  issuesPermission = true;
                  resolve({ ok: true });
                } else {
                  resolve({ ok: false, status: response.statusCode, body: data.slice(0, 200) });
                }
              });
            });
            req2.on('error', (e) => reject(e));
            req2.setTimeout(10000, () => { req2.destroy(); reject(new Error('Timeout')); });
            req2.end();
          });

          if (issuesPermission) {
            checks.push({ name: 'Issues Permission', status: 'pass', message: 'Token can create and list issues' });
          } else {
            checks.push({ name: 'Issues Permission', status: 'fail', message: 'Token does not have issues:write permission' });
          }
        } catch {
          checks.push({ name: 'Issues Permission', status: 'warn', message: 'Could not verify issues permission' });
        }
      } else if (result.status === 401) {
        tokenValid = false;
        checks.push({ name: 'Repository Access', status: 'fail', message: 'Invalid GitHub token. Generate a new token at GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens with Issues:Read+Write permission.' });
      } else if (result.status === 403) {
        tokenValid = false;
        const msg = result.body?.message || 'Token does not have access';
        checks.push({ name: 'Repository Access', status: 'fail', message: `Access denied: ${msg}. Ensure your token has Issues: Read and Write permissions.` });
      } else if (result.status === 404) {
        checks.push({ name: 'Repository Access', status: 'fail', message: `Repository ${owner}/${repo} not found. Check the owner and repo name.` });
      } else {
        checks.push({ name: 'Repository Access', status: 'fail', message: `GitHub API error (${result.status}): ${typeof result.body === 'string' ? result.body.slice(0, 200) : JSON.stringify(result.body).slice(0, 200)}` });
      }
    } catch (err: any) {
      checks.push({ name: 'GitHub API', status: 'fail', message: `Connection failed: ${err.message}` });
    }
  } else if (owner && repo) {
    checks.push({ name: 'Repository Access', status: 'warn', message: `${owner}/${repo} configured but no token to test` });
  } else {
    checks.push({ name: 'Repository Access', status: 'warn', message: 'No repository configured. Default: Harsha240105/Mine-Control' });
  }

  // 3. Sync queue stats
  const pendingCount = (db.prepare("SELECT COUNT(*) as c FROM sync_queue WHERE status = 'pending'").get() as any)?.c || 0;
  const failedCount = (db.prepare("SELECT status = 'failed' FROM sync_queue WHERE 1=1").get() as any)?.c || 0;
  // More accurate:
  const failedQueue = db.prepare("SELECT COUNT(*) as c FROM sync_queue WHERE status = 'failed'").get() as any;
  const failedCountAccurate = failedQueue?.c || 0;

  const lastSyncRow = db.prepare("SELECT MAX(completed_at) as last FROM sync_queue WHERE status = 'completed'").get() as any;
  lastSync = lastSyncRow?.last || null;

  // 4. Recent errors
  const recentErrors = db.prepare("SELECT ticket_id, error, last_attempt FROM sync_queue WHERE status = 'failed' ORDER BY last_attempt DESC LIMIT 10").all() as any[];

  const overall = checks.every(c => c.status === 'pass') ? 'pass' : checks.some(c => c.status === 'fail') ? 'fail' : 'warn';

  res.json({
    overall,
    checks,
    config: { owner, repo, hasToken: !!token },
    sync: {
      pending: pendingCount,
      failed: failedCountAccurate,
      lastSync,
      recentErrors,
    },
  });
});

router.post('/retry-failed', authMiddleware, async (_req: AuthRequest, res) => {
  const db = getDatabase();
  const failed = db.prepare("SELECT id FROM sync_queue WHERE status = 'failed'").all() as any[];
  for (const item of failed) {
    db.prepare("UPDATE sync_queue SET status = 'pending', retries = 0, error = NULL WHERE id = ?").run(item.id);
  }
  const { feedbackService } = require('../services/feedback');
  try {
    const result = await feedbackService.processSyncQueue();
    res.json({ success: true, retried: failed.length, result });
  } catch (err: any) {
    res.json({ success: true, retried: failed.length, message: 'Queue reset, but sync processing encountered errors' });
  }
});

export default router;
