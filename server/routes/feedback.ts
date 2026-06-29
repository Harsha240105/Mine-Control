import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { feedbackService } from '../services/feedback';

const router = Router();

router.get('/', authMiddleware, (req: AuthRequest, res) => {
  const { type, status, search, sort, order, sync_status, priority, from_date, to_date, limit, offset } = req.query as any;
  const filters: Record<string, any> = {};
  if (type) filters.type = type;
  if (status) filters.status = status;
  if (search) filters.search = search;
  if (sort) filters.sort = sort;
  if (order) filters.order = order;
  if (sync_status) filters.sync_status = sync_status;
  if (priority) filters.priority = priority;
  if (from_date) filters.from_date = from_date;
  if (to_date) filters.to_date = to_date;
  if (limit) filters.limit = parseInt(limit);
  if (offset) filters.offset = parseInt(offset);
  const tickets = feedbackService.getTickets(filters);
  res.json(tickets);
});

router.get('/counts', authMiddleware, (_req: AuthRequest, res) => {
  res.json(feedbackService.getTicketCounts());
});

router.get('/stats', authMiddleware, (_req: AuthRequest, res) => {
  res.json(feedbackService.getDashboardStats());
});

router.get('/pending', authMiddleware, (_req: AuthRequest, res) => {
  const tickets = feedbackService.getPendingUploads();
  res.json(tickets);
});

router.get('/sync-queue', authMiddleware, (_req: AuthRequest, res) => {
  const queue = feedbackService.getSyncQueue();
  res.json(queue);
});

router.post('/sync', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const result = await feedbackService.processSyncQueue();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tracker-config', authMiddleware, (req: AuthRequest, res) => {
  const serverId = req.query.server_id as string;
  if (!serverId) return res.status(400).json({ error: 'server_id is required' });
  const config = feedbackService.getIssueTrackerConfig(serverId);
  res.json(config || {});
});

router.post('/tracker-config', authMiddleware, (req: AuthRequest, res) => {
  const { server_id, provider, url, api_token, repository, project_key, enabled, auto_sync } = req.body;
  if (!server_id) return res.status(400).json({ error: 'server_id is required' });
  const config = feedbackService.saveIssueTrackerConfig(server_id, {
    provider: provider || 'github',
    url: url || '',
    api_token,
    repository,
    project_key,
    enabled,
    auto_sync,
  });
  res.json(config);
});

router.post('/', authMiddleware, (req: AuthRequest, res) => {
  const { summary, description, issue_type, screenshots, attachments, priority, error_stack_trace } = req.body;
  const finalType = issue_type || 'general';
  const validTypes = ['bug', 'feature', 'performance', 'crash', 'general'];
  if (!validTypes.includes(finalType)) {
    return res.status(400).json({ error: `Invalid issue_type. Must be one of: ${validTypes.join(', ')}` });
  }
  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }
  const safeScreenshots = Array.isArray(screenshots) ? screenshots.filter((s: any) => s && s.data && s.name) : undefined;
  const safeAttachments = Array.isArray(attachments) ? attachments.filter((a: any) => a && a.data && a.name) : undefined;
  const ticket = feedbackService.createTicket({
    summary: summary || `${finalType.charAt(0).toUpperCase() + finalType.slice(1)} Report`,
    description,
    issue_type: finalType,
    username: req.user!.username,
    screenshots: safeScreenshots,
    attachments: safeAttachments,
    priority: priority || 'normal',
    error_stack_trace,
  });

  feedbackService.addToSyncQueue(ticket.id, 'create');
  res.json(ticket);
});

router.get('/:id', authMiddleware, (req: AuthRequest, res) => {
  const ticket = feedbackService.getTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

router.get('/:id/history', authMiddleware, (req: AuthRequest, res) => {
  const ticket = feedbackService.getTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const history = feedbackService.getTicketHistory(ticket.id);
  res.json(history);
});

router.get('/:id/attachments', authMiddleware, (req: AuthRequest, res) => {
  const ticket = feedbackService.getTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const attachments = feedbackService.getAttachments(ticket.id);
  res.json(attachments);
});

router.put('/:id/status', authMiddleware, (req: AuthRequest, res) => {
  const { status, note } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });
  try {
    const ticket = feedbackService.updateTicketStatus(req.params.id, status, req.user!.username, note);
    res.json(ticket);
  } catch (err: any) {
    res.status(err.message.includes('Invalid') ? 400 : 403).json({ error: err.message });
  }
});

router.put('/:id/priority', authMiddleware, (req: AuthRequest, res) => {
  const { priority } = req.body;
  if (!priority) return res.status(400).json({ error: 'priority is required' });
  try {
    const ticket = feedbackService.updatePriority(req.params.id, priority, req.user!.username);
    res.json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/notes', authMiddleware, (req: AuthRequest, res) => {
  const { notes } = req.body;
  if (notes === undefined) return res.status(400).json({ error: 'notes is required' });
  try {
    const ticket = feedbackService.updateDeveloperNotes(req.params.id, notes, req.user!.username);
    res.json(ticket);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/:id/vote', authMiddleware, (req: AuthRequest, res) => {
  const ticket = feedbackService.voteTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

router.post('/:id/sync', authMiddleware, (req: AuthRequest, res) => {
  const { issue_tracker_url, issue_tracker_id } = req.body;
  if (!issue_tracker_url) return res.status(400).json({ error: 'issue_tracker_url is required' });
  const ticket = feedbackService.markSynced(req.params.id, issue_tracker_url, issue_tracker_id || '');
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

router.get('/attachment-file', (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  };
  const mime = mimeMap[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.sendFile(filePath);
});

router.delete('/:id/attachments/:attachmentId', authMiddleware, (req: AuthRequest, res) => {
  feedbackService.deleteAttachment(req.params.attachmentId);
  res.json({ success: true });
});

export default router;
