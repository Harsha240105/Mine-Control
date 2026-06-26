import { Router } from 'express';
import axios from 'axios';
import { requireAuth } from '../middleware/auth';

const router = Router();

const MODRINTH_API = 'https://api.modrinth.com/v2';

// Search projects
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { q, loader, mc_version, page = 0 } = req.query;
    
    const facets = [];
    if (loader) facets.push(`["categories:${loader}"]`);
    if (mc_version) facets.push(`["versions:${mc_version}"]`);
    
    // We only want server-side plugins/mods
    facets.push('["server_side:required","server_side:optional"]');
    
    const response = await axios.get(`${MODRINTH_API}/search`, {
      params: {
        query: q || '',
        facets: `[${facets.join(',')}]`,
        limit: 20,
        offset: Number(page) * 20,
      }
    });
    
    res.json(response.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get project details
router.get('/project/:id', requireAuth, async (req, res) => {
  try {
    const response = await axios.get(`${MODRINTH_API}/project/${req.params.id}`);
    res.json(response.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get project versions
router.get('/project/:id/versions', requireAuth, async (req, res) => {
  try {
    const { loader, mc_version } = req.query;
    
    const params: any = {};
    if (loader) params.loaders = `["${loader}"]`;
    if (mc_version) params.game_versions = `["${mc_version}"]`;
    
    const response = await axios.get(`${MODRINTH_API}/project/${req.params.id}/version`, {
      params
    });
    res.json(response.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
