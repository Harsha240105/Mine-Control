import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { feedbackService } from '../services/feedback';

const router = Router();

router.get('/', authMiddleware, (_req: AuthRequest, res) => {
  const type = _req.query.type as string | undefined;
  const status = _req.query.status as string | undefined;
  const filters: { type?: string; status?: string } = {};
  if (type) filters.type = type;
  if (status) filters.status = status;
  const tickets = feedbackService.getTickets(filters);
  res.json(tickets);
});

router.post('/', authMiddleware, (req: AuthRequest, res) => {
  const { title, description, type, screenshots } = req.body;
  if (!title || !description || !type) {
    return res.status(400).json({ error: 'title, description, and type are required' });
  }
  if (type !== 'bug' && type !== 'feature') {
    return res.status(400).json({ error: 'type must be "bug" or "feature"' });
  }
  const ticket = feedbackService.createTicket({
    title,
    description,
    type,
    username: req.user!.username,
    screenshots: screenshots || [],
  });
  res.json(ticket);
});

router.get('/pending', authMiddleware, (_req: AuthRequest, res) => {
  const tickets = feedbackService.getPendingUploads();
  res.json(tickets);
});

router.get('/:id', (req, res) => {
  const ticket = feedbackService.getTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

router.put('/:id/status', authMiddleware, (req: AuthRequest, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });
  try {
    const ticket = feedbackService.updateTicketStatus(req.params.id, status, req.user!.username);
    res.json(ticket);
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

router.post('/:id/vote', (req, res) => {
  const ticket = feedbackService.voteTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

router.post('/:id/upload', authMiddleware, (req: AuthRequest, res) => {
  const { github_url } = req.body;
  if (!github_url) return res.status(400).json({ error: 'github_url is required' });
  const ticket = feedbackService.markUploaded(req.params.id, github_url);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

export default router;
