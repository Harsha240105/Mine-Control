import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const MODRINTH_API = 'https://api.modrinth.com/v2';

// Search projects
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { q, loader, mc_version, page = 0 } = req.query;
    
    const facets = [];
    if (loader) facets.push(`["categories:${loader}"]`);
    if (mc_version) facets.push(`["versions:${mc_version}"]`);
    
    // We only want server-side plugins/mods
    facets.push('["server_side:required","server_side:optional"]');
    
    const params = new URLSearchParams({
      query: (q as string) || '',
      facets: `[${facets.join(',')}]`,
      limit: '20',
      offset: (Number(page) * 20).toString(),
    });
    
    const response = await fetch(`${MODRINTH_API}/search?${params.toString()}`);
    if (!response.ok) throw new Error(`Modrinth API error: ${response.statusText}`);
    const data = await response.json();
    
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get project details
router.get('/project/:id', authMiddleware, async (req, res) => {
  try {
    const response = await fetch(`${MODRINTH_API}/project/${req.params.id}`);
    if (!response.ok) throw new Error(`Modrinth API error: ${response.statusText}`);
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get project versions
router.get('/project/:id/versions', authMiddleware, async (req, res) => {
  try {
    const { loader, mc_version } = req.query;
    
    const params = new URLSearchParams();
    if (loader) params.append('loaders', `["${loader}"]`);
    if (mc_version) params.append('game_versions', `["${mc_version}"]`);
    
    const response = await fetch(`${MODRINTH_API}/project/${req.params.id}/version?${params.toString()}`);
    if (!response.ok) throw new Error(`Modrinth API error: ${response.statusText}`);
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
