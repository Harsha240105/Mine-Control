import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json([]);
});

router.post('/', (_req, res) => {
  res.json({ success: true });
});

router.put('/:id', (_req, res) => {
  res.json({ success: true });
});

router.delete('/:id', (_req, res) => {
  res.json({ success: true });
});

export default router;
