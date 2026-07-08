import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { marketplaceService } from '../services/marketplaceService';

const router = Router();

// Combined search across Modrinth + CurseForge
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { q, loader, mc_version, page = 0 } = req.query;
    const result = await marketplaceService.searchAll(
      (q as string) || '',
      loader as string,
      mc_version as string,
      Number(page)
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Modrinth-only search
router.get('/search/modrinth', authMiddleware, async (req, res) => {
  try {
    const { q, loader, mc_version, page = 0 } = req.query;
    const result = await marketplaceService.searchModrinth(
      (q as string) || '',
      loader as string,
      mc_version as string,
      Number(page)
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CurseForge-only search
router.get('/search/curseforge', authMiddleware, async (req, res) => {
  try {
    const { q, mc_version, page = 0 } = req.query;
    const result = await marketplaceService.searchCurseforge(
      (q as string) || '',
      mc_version as string,
      undefined,
      Number(page)
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// World templates search (Modrinth world category)
router.get('/world-templates', authMiddleware, async (req, res) => {
  try {
    const { q, page = 0 } = req.query;
    const result = await marketplaceService.searchWorldTemplates(
      (q as string) || '',
      Number(page)
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Project details (Modrinth)
router.get('/project/:id', authMiddleware, async (req, res) => {
  try {
    const data = await marketplaceService.getModrinthProject(req.params.id);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Project versions (Modrinth)
router.get('/project/:id/versions', authMiddleware, async (req, res) => {
  try {
    const { loader, mc_version } = req.query;
    const data = await marketplaceService.getModrinthVersions(
      req.params.id,
      loader as string,
      mc_version as string
    );
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CurseForge project details
router.get('/curseforge/:id', authMiddleware, async (req, res) => {
  try {
    const data = await marketplaceService.getCurseforgeProject(req.params.id);
    if (!data) return res.status(400).json({ error: 'CurseForge API key not configured. Set CURSEFORGE_API_KEY environment variable.' });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Server software presets
router.get('/presets', authMiddleware, async (req, res) => {
  const { useCase } = req.query;
  const presets = marketplaceService.getRecommendedPreset(useCase as string);
  res.json(presets);
});

export default router;
