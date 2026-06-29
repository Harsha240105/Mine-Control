import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { guideService } from '../services/guide';

const router = Router();

router.get('/sections', authMiddleware, (_req, res) => {
  try {
    const result = guideService.getSections();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/article/:sectionId/:articleId', authMiddleware, (req, res) => {
  try {
    const { sectionId, articleId } = req.params;
    const article = guideService.getArticle(sectionId, articleId);
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json(article);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/search', authMiddleware, (req, res) => {
  try {
    const query = (req.query.q as string) || '';
    const results = guideService.search(query);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/detections', authMiddleware, (_req, res) => {
  try {
    const detections = guideService.getTroubleshootingDetections();
    res.json(detections);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/bookmarks', authMiddleware, (_req, res) => {
  try {
    const bookmarks = guideService.getBookmarks();
    res.json(bookmarks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bookmarks', authMiddleware, (req, res) => {
  try {
    const { sectionId, articleId, title } = req.body;
    if (!sectionId || !articleId || !title) {
      return res.status(400).json({ error: 'sectionId, articleId, and title are required' });
    }
    const bookmarks = guideService.addBookmark(sectionId, articleId, title);
    res.json(bookmarks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/bookmarks/:sectionId/:articleId', authMiddleware, (req, res) => {
  try {
    const { sectionId, articleId } = req.params;
    const bookmarks = guideService.removeBookmark(sectionId, articleId);
    res.json(bookmarks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/recently-viewed', authMiddleware, (_req, res) => {
  try {
    const recent = guideService.getRecentlyViewed();
    res.json(recent);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/search-history', authMiddleware, (_req, res) => {
  try {
    const history = guideService.getSearchHistory();
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tutorial-progress', authMiddleware, (_req, res) => {
  try {
    const progress = guideService.getTutorialProgress();
    res.json(progress);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tutorial-progress', authMiddleware, (req, res) => {
  try {
    const { tutorialId, stepIndex, completed } = req.body;
    if (!tutorialId || stepIndex === undefined) {
      return res.status(400).json({ error: 'tutorialId and stepIndex are required' });
    }
    const progress = guideService.updateTutorialProgress(tutorialId, stepIndex, !!completed);
    res.json(progress);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/preferences', authMiddleware, (_req, res) => {
  try {
    const prefs = guideService.getPreferences();
    res.json(prefs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/preferences', authMiddleware, (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }
    guideService.setPreference(key, String(value));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/dashboard-widget', authMiddleware, (_req, res) => {
  try {
    const widget = guideService.getDashboardWidget();
    res.json(widget);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/random-tip', authMiddleware, (_req, res) => {
  try {
    const tip = guideService.getRandomTip();
    res.json(tip);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/release-notes', authMiddleware, (_req, res) => {
  try {
    const notes = guideService.getReleaseNotes();
    res.json(notes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/quick-start', authMiddleware, (_req, res) => {
  try {
    const articles = guideService.getQuickStartArticles();
    res.json(articles);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
