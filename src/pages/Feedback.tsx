import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageCircle, Bug, Lightbulb, Gauge, AlertTriangle, Send, X, Image, Plus, FileText,
  Search, Filter, ChevronDown, ChevronUp, Clock, CheckCircle, XCircle, Loader2,
  RefreshCw, Upload, Trash2, Eye, EyeOff, History, ExternalLink, Camera, Ban,
  ArrowUpDown, Wifi, WifiOff, List, BarChart3, Download, Shield,
} from 'lucide-react';
import { api } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import { useActiveServer } from '../hooks/useActiveServer';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

type IssueType = 'bug' | 'feature' | 'performance' | 'crash' | 'general';
type TicketStatus = 'open' | 'pending' | 'in_review' | 'resolved' | 'closed' | 'rejected';
type Priority = 'low' | 'normal' | 'high' | 'critical';
type ViewMode = 'create' | 'list' | 'detail' | 'queue';

const ISSUE_TYPES: { value: IssueType; label: string; icon: any; color: string; description: string }[] = [
  { value: 'bug', label: 'Bug Report', icon: Bug, color: 'text-red-400 bg-red-500/10 border-red-500/30', description: 'Report something not working correctly' },
  { value: 'feature', label: 'Feature Request', icon: Lightbulb, color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', description: 'Suggest a new feature or improvement' },
  { value: 'performance', label: 'Performance Issue', icon: Gauge, color: 'text-orange-400 bg-orange-500/10 border-orange-500/30', description: 'Report lag, slow response, or resource issues' },
  { value: 'crash', label: 'Crash Report', icon: AlertTriangle, color: 'text-red-500 bg-red-600/10 border-red-600/30', description: 'Report a server or application crash' },
  { value: 'general', label: 'General Feedback', icon: MessageCircle, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30', description: 'Share general thoughts or suggestions' },
];

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; dot: string }> = {
  open: { label: 'Open', color: 'text-green-400 bg-green-500/10 border-green-500/30', dot: 'bg-green-500' },
  pending: { label: 'Pending', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', dot: 'bg-yellow-500' },
  in_review: { label: 'In Review', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30', dot: 'bg-blue-500' },
  resolved: { label: 'Resolved', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30', dot: 'bg-purple-500' },
  closed: { label: 'Closed', color: 'text-gray-400 bg-gray-500/10 border-gray-500/30', dot: 'bg-gray-500' },
  rejected: { label: 'Rejected', color: 'text-red-400 bg-red-500/10 border-red-500/30', dot: 'bg-red-500' },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'text-gray-400' },
  normal: { label: 'Normal', color: 'text-blue-400' },
  high: { label: 'High', color: 'text-orange-400' },
  critical: { label: 'Critical', color: 'text-red-400' },
};

const TEMPLATES: Record<IssueType, { summary: string; description: string; fields: { key: string; label: string; type: string; required?: boolean }[] }> = {
  bug: {
    summary: 'Bug Report',
    description: 'Describe the bug...',
    fields: [
      { key: 'expected', label: 'What was expected?', type: 'text', required: true },
      { key: 'actual', label: 'What actually happened?', type: 'text', required: true },
      { key: 'reproduce', label: 'Steps to reproduce', type: 'textarea', required: true },
      { key: 'frequency', label: 'How often does it occur?', type: 'text' },
    ],
  },
  feature: {
    summary: 'Feature Request',
    description: 'Describe the feature...',
    fields: [
      { key: 'problem', label: 'What problem does this solve?', type: 'textarea', required: true },
      { key: 'solution', label: 'Describe your ideal solution', type: 'textarea', required: true },
      { key: 'alternatives', label: 'Alternatives you\'ve considered', type: 'textarea' },
    ],
  },
  performance: {
    summary: 'Performance Issue',
    description: 'Describe the performance issue...',
    fields: [
      { key: 'impact', label: 'What is the impact?', type: 'textarea', required: true },
      { key: 'when', label: 'When does it happen?', type: 'text', required: true },
      { key: 'metrics', label: 'Any relevant metrics (TPS, RAM, CPU)', type: 'text' },
    ],
  },
  crash: {
    summary: 'Crash Report',
    description: 'Describe what happened before the crash...',
    fields: [
      { key: 'beforeCrash', label: 'What were you doing before the crash?', type: 'textarea', required: true },
      { key: 'repeatable', label: 'Can you reproduce the crash?', type: 'text' },
      { key: 'errorMessage', label: 'Error message (if visible)', type: 'text' },
    ],
  },
  general: {
    summary: 'General Feedback',
    description: 'Share your thoughts...',
    fields: [
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'details', label: 'Details', type: 'textarea', required: true },
    ],
  },
};

interface ScreenshotPreview {
  data: string;
  name: string;
}

interface Ticket {
  id: string;
  ticket_id: string;
  issue_type: IssueType;
  summary: string;
  description: string;
  status: TicketStatus;
  username: string;
  server_id: string | null;
  server_name: string;
  diagnostic_data: Record<string, any> | null;
  screenshot_paths: string[];
  attachment_paths: { id: string; filePath: string; fileName: string; type: string }[];
  log_snapshots: Record<string, string[]>;
  error_stack_trace: string;
  github_url: string | null;
  issue_tracker_url: string;
  issue_tracker_id: string;
  sync_status: 'local' | 'pending' | 'synced' | 'failed';
  sync_retries: number;
  sync_error: string;
  votes: number;
  priority: Priority;
  developer_notes: string;
  created_at: string;
  updated_at: string;
}

function getTicketUrl(ticket: Ticket): string {
  if (ticket.github_url) return ticket.github_url;
  if (ticket.issue_tracker_url) return ticket.issue_tracker_url;
  return '';
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

function PrivacyNotice({ diagnostics, onClose }: { diagnostics: Record<string, any> | null; onClose: () => void }) {
  if (!diagnostics) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-700 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-surface-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-green-400" />
            <h3 className="text-sm font-semibold text-gray-200">Data Privacy Review</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-gray-400">The following diagnostic data will be included with your report. No passwords, tokens, or sensitive credentials are uploaded.</p>
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-xs text-green-400">
            <CheckCircle size={14} className="inline mr-1" />
            All sensitive values have been automatically masked
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(diagnostics).filter(([k]) => !['recent_console_logs', 'server_log_tail', 'crash_reports', 'app_log_tail'].includes(k)).map(([key, value]) => (
              <div key={key} className="bg-surface-800 rounded p-2 border border-surface-700">
                <span className="text-gray-500 block mb-0.5 capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="text-gray-200 font-mono text-[10px] break-all">
                  {typeof value === 'object' ? JSON.stringify(value).slice(0, 100) : String(value).slice(0, 100)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 border-t border-surface-700 flex justify-end">
          <button onClick={onClose} className="btn-primary text-xs px-4 py-2">I Understand</button>
        </div>
      </div>
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [issueType, setIssueType] = useState<IssueType>('bug');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [screenshots, setScreenshots] = useState<ScreenshotPreview[]>([]);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Record<string, any> | null>(null);
  const [sending, setSending] = useState(false);
  const [templateFields, setTemplateFields] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const template = TEMPLATES[issueType];

  const handleTypeChange = (t: IssueType) => {
    setIssueType(t);
    setSummary(template.summary);
    setDescription(template.description);
    setTemplateFields({});
  };

  useEffect(() => {
    setSummary(template.summary);
    setDescription(template.description);
  }, [issueType]);

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 10MB)`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as string;
        setScreenshots((prev) => [...prev, { data, name: file.name }]);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeScreenshot = (index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const descParts = [description];
    for (const field of template.fields) {
      const val = templateFields[field.key]?.trim();
      if (val) {
        descParts.push(`\n**${field.label}:** ${val}`);
      }
    }
    const finalDescription = descParts.join('\n');
    if (!finalDescription.trim()) {
      toast.error('Please provide a description');
      return;
    }

    setSending(true);
    try {
      const ticket = await api.createFeedbackTicket({
        summary: summary.trim() || template.summary,
        description: finalDescription.trim(),
        issue_type: issueType,
        priority,
        screenshots: screenshots.map((s) => ({ data: s.data, name: s.name })),
      });

      setDiagnostics(ticket.diagnostic_data);
      toast.success(`Ticket ${ticket.ticket_id} created`);
      setSummary('');
      setDescription('');
      setScreenshots([]);
      setTemplateFields({});
      setPriority('normal');
      onCreated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit');
    }
    setSending(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {showPrivacy && diagnostics && <PrivacyNotice diagnostics={diagnostics} onClose={() => setShowPrivacy(false)} />}

      {/* Issue Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">Issue Type</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ISSUE_TYPES.map((t) => {
            const Icon = t.icon;
            const isActive = issueType === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => handleTypeChange(t.value)}
                className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                  isActive ? t.color : 'bg-surface-800 text-gray-400 border-surface-700 hover:border-surface-600'
                }`}
              >
                <Icon size={18} className="mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-sm font-medium block">{t.label}</span>
                  <span className="text-[10px] opacity-70">{t.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Summary</label>
        <input
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="input w-full"
          placeholder="Brief summary of the issue..."
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="input w-full resize-y"
          placeholder={template.description}
          required
        />
      </div>

      {/* Template Fields */}
      {template.fields.map((field) => (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            {field.label} {field.required && <span className="text-red-400">*</span>}
          </label>
          {field.type === 'textarea' ? (
            <textarea
              value={templateFields[field.key] || ''}
              onChange={(e) => setTemplateFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
              rows={3}
              className="input w-full resize-y"
              placeholder={`Enter ${field.label.toLowerCase()}...`}
              required={field.required}
            />
          ) : (
            <input
              type="text"
              value={templateFields[field.key] || ''}
              onChange={(e) => setTemplateFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
              className="input w-full"
              placeholder={`Enter ${field.label.toLowerCase()}...`}
              required={field.required}
            />
          )}
        </div>
      ))}

      {/* Priority */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Priority</label>
        <div className="flex gap-2">
          {(Object.entries(PRIORITY_CONFIG) as [Priority, typeof PRIORITY_CONFIG[Priority]][]).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPriority(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                priority === key
                  ? `${cfg.color} bg-opacity-20 border-current`
                  : 'text-gray-400 border-surface-700 bg-surface-800 hover:border-surface-600'
              }`}
            >
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Screenshots */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <Camera size={14} className="inline mr-1" />
          Screenshots
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {screenshots.map((s, i) => (
            <div key={i} className="relative group">
              <img src={s.data} alt={s.name} className="w-20 h-20 object-cover rounded-lg border border-surface-700" />
              <button
                type="button"
                onClick={() => removeScreenshot(i)}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} />
              </button>
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center cursor-pointer"
                onClick={() => window.open(s.data, '_blank')}>
                <Eye size={16} className="text-white" />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-xs text-minecraft-400 hover:text-minecraft-300 flex items-center gap-1"
        >
          <Plus size={12} /> Add Screenshot
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleScreenshot} />
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between pt-2 border-t border-surface-700/50">
        <button
          type="button"
          onClick={async () => {
            const fakeTicket = await api.createFeedbackTicket({
              summary: 'Preview',
              description: 'Preview diagnostics',
              issue_type: issueType,
              priority,
            });
            setDiagnostics(fakeTicket.diagnostic_data);
            setShowPrivacy(true);
          }}
          className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
        >
          <Shield size={12} />
          Review data before submitting
        </button>
        <button
          type="submit"
          disabled={sending}
          className="btn-primary flex items-center gap-2"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {sending ? 'Submitting...' : 'Submit Report'}
        </button>
      </div>
    </form>
  );
}

function TicketCard({ ticket, onClick, compact }: { ticket: Ticket; onClick: () => void; compact?: boolean }) {
  const typeInfo = ISSUE_TYPES.find((t) => t.value === ticket.issue_type);
  const TypeIcon = typeInfo?.icon || MessageCircle;
  const statusCfg = STATUS_CONFIG[ticket.status];
  const priorityCfg = PRIORITY_CONFIG[ticket.priority];
  const trackerUrl = getTicketUrl(ticket);

  return (
    <div
      onClick={onClick}
      className="card-hover p-4 cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${typeInfo?.color || 'text-gray-400 bg-gray-500/10 border-gray-500/30'}`}>
          <TypeIcon size={compact ? 14 : 16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-minecraft-400 bg-minecraft-500/10 px-1.5 py-0.5 rounded">{ticket.ticket_id}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            <span className={`text-[10px] ${priorityCfg.color}`}>{priorityCfg.label}</span>
            {ticket.sync_status !== 'synced' && (
              <span className={`text-[10px] flex items-center gap-0.5 ${ticket.sync_status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
                {ticket.sync_status === 'failed' ? <XCircle size={10} /> : <WifiOff size={10} />}
                {ticket.sync_status === 'failed' ? 'Failed' : 'Pending'}
              </span>
            )}
            {trackerUrl && (
              <a href={trackerUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5">
                <ExternalLink size={10} /> Open
              </a>
            )}
          </div>
          <h4 className={`font-medium text-gray-200 ${compact ? 'text-xs' : 'text-sm'} truncate`}>{ticket.summary}</h4>
          {!compact && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ticket.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
            <span>{ticket.username}</span>
            <span className="flex items-center gap-1"><Clock size={10} /> {formatDateShort(ticket.created_at)}</span>
            {ticket.screenshot_paths.length > 0 && (
              <span className="flex items-center gap-1"><Image size={10} /> {ticket.screenshot_paths.length}</span>
            )}
            {ticket.votes > 0 && (
              <span className="flex items-center gap-1">+{ticket.votes}</span>
            )}
          </div>
        </div>
        <ChevronDown size={14} className="text-gray-600 mt-1 flex-shrink-0 rotate-[-90deg]" />
      </div>
    </div>
  );
}

function TicketDetail({ ticketId, onBack, onUpdated }: { ticketId: string; onBack: () => void; onUpdated: () => void }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusNote, setStatusNote] = useState('');
  const [notes, setNotes] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const { user } = useAuth() as any;

  const fetchTicket = useCallback(async () => {
    try {
      const [t, h] = await Promise.all([
        api.getFeedbackTicket(ticketId),
        api.getFeedbackTicketHistory(ticketId),
      ]);
      setTicket(t);
      setHistory(h);
      setNotes(t.developer_notes || '');
    } catch { toast.error('Failed to load ticket'); }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  if (loading || !ticket) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-minecraft-500" />
      </div>
    );
  }

  const typeInfo = ISSUE_TYPES.find((t) => t.value === ticket.issue_type);
  const TypeIcon = typeInfo?.icon || MessageCircle;
  const statusCfg = STATUS_CONFIG[ticket.status];
  const trackerUrl = getTicketUrl(ticket);

  const handleStatusChange = async (newStatus: TicketStatus) => {
    try {
      await api.updateFeedbackTicketStatus(ticket.id, newStatus, statusNote);
      toast.success(`Status changed to ${newStatus}`);
      setStatusNote('');
      fetchTicket();
      onUpdated();
    } catch (err: any) { toast.error(err.message); }
  };

  const handlePriorityChange = async (newPriority: Priority) => {
    try {
      await api.updateFeedbackTicketPriority(ticket.id, newPriority);
      toast.success(`Priority changed to ${newPriority}`);
      fetchTicket();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSaveNotes = async () => {
    try {
      await api.updateFeedbackTicketNotes(ticket.id, notes);
      toast.success('Notes saved');
      fetchTicket();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleVote = async () => {
    try {
      await api.voteFeedbackTicket(ticket.id);
      fetchTicket();
    } catch {}
  };

  const handleSync = async () => {
    try {
      await api.triggerSync();
      toast.success('Sync triggered');
      fetchTicket();
    } catch {}
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Back button */}
      <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
        <ChevronUp size={14} className="rotate-[-90deg]" /> Back to list
      </button>

      {/* Header */}
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl ${typeInfo?.color || 'text-gray-400 bg-gray-500/10 border-gray-500/30'}`}>
            <TypeIcon size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-mono text-minecraft-400 bg-minecraft-500/10 px-2 py-0.5 rounded">{ticket.ticket_id}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusCfg.color}`}>{statusCfg.label}</span>
              <span className={`text-xs ${PRIORITY_CONFIG[ticket.priority].color}`}>{PRIORITY_CONFIG[ticket.priority].label} Priority</span>
            </div>
            <h3 className="text-lg font-bold text-gray-100">{ticket.summary}</h3>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
              <span>Reported by <strong className="text-gray-300">{ticket.username}</strong></span>
              <span>{formatDate(ticket.created_at)}</span>
              {ticket.server_name && <span>Server: {ticket.server_name}</span>}
              <span className={`flex items-center gap-1 ${
                ticket.sync_status === 'synced' ? 'text-green-400' :
                ticket.sync_status === 'failed' ? 'text-red-400' : 'text-yellow-400'
              }`}>
                {ticket.sync_status === 'synced' ? <Wifi size={12} /> :
                 ticket.sync_status === 'failed' ? <XCircle size={12} /> : <WifiOff size={12} />}
                {ticket.sync_status === 'synced' ? 'Synced' :
                 ticket.sync_status === 'failed' ? `Sync Failed (${ticket.sync_retries} retries)` : 'Pending Sync'}
              </span>
              {trackerUrl && (
                <a href={trackerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  <ExternalLink size={12} /> View on Issue Tracker
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleVote} className="flex items-center gap-1 px-2 py-1 rounded bg-surface-800 border border-surface-700 text-xs text-gray-400 hover:text-minecraft-400">
              <ChevronUp size={12} /> {ticket.votes}
            </button>
          </div>
        </div>
      </div>

      {/* Description & Attachments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-5">
            <h4 className="text-sm font-semibold text-gray-200 mb-3">Description</h4>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* Screenshots */}
          {ticket.screenshot_paths.length > 0 && (
            <div className="card p-5">
              <h4 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                <Image size={14} /> Screenshots ({ticket.screenshot_paths.length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ticket.screenshot_paths.map((path, i) => (
                  <img key={i} src={`/api/feedback/attachment-file?path=${encodeURIComponent(path)}`}
                    alt={`Screenshot ${i + 1}`}
                    className="rounded-lg border border-surface-700 object-cover h-32 w-full cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => window.open(`/api/feedback/attachment-file?path=${encodeURIComponent(path)}`, '_blank')}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Diagnostics */}
          {ticket.diagnostic_data && (
            <div className="card p-5">
              <button
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="flex items-center justify-between w-full"
              >
                <h4 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                  <FileText size={14} /> Diagnostic Data
                </h4>
                {showDiagnostics ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showDiagnostics && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(ticket.diagnostic_data).map(([key, value]) => (
                    <div key={key} className="bg-surface-800 rounded p-2 border border-surface-700">
                      <span className="text-gray-500 block mb-0.5 capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className="text-gray-200 font-mono text-[10px] break-all">
                        {typeof value === 'object' ? JSON.stringify(value).slice(0, 200) : String(value).slice(0, 200)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Log Snapshots */}
          {ticket.log_snapshots && Object.keys(ticket.log_snapshots).length > 0 && (
            <div className="card p-5">
              <h4 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                <FileText size={14} /> Collected Logs
              </h4>
              {Object.entries(ticket.log_snapshots).map(([key, lines]) => (
                <details key={key} className="mb-2">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300 capitalize">{key.replace(/_/g, ' ')} ({lines.length} lines)</summary>
                  <pre className="mt-2 p-3 bg-surface-900 rounded-lg text-[10px] text-gray-400 overflow-x-auto max-h-48 overflow-y-auto custom-scrollbar font-mono">
                    {lines.join('\n')}
                  </pre>
                </details>
              ))}
            </div>
          )}

          {/* History */}
          <div className="card p-5">
            <h4 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
              <History size={14} /> History
            </h4>
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-xs text-gray-500">No history recorded</p>
              ) : (
                history.map((h: any) => (
                  <div key={h.id} className="flex items-start gap-2 text-xs bg-surface-800 rounded p-2 border border-surface-700">
                    <div className="w-1.5 h-1.5 rounded-full bg-minecraft-500 mt-1.5 flex-shrink-0" />
                    <div>
                      <span className="text-gray-300">{h.changed_by}</span>
                      <span className="text-gray-500"> changed <strong>{h.field}</strong></span>
                      {h.old_value && <span className="text-gray-500"> from "{h.old_value.slice(0, 50)}"</span>}
                      <span className="text-gray-500"> to "{h.new_value.slice(0, 50)}"</span>
                      {h.note && <p className="text-gray-400 mt-0.5">{h.note}</p>}
                      <p className="text-gray-600 mt-0.5">{formatDateShort(h.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status Management */}
          <div className="card p-4">
            <h4 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider">Change Status</h4>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(STATUS_CONFIG) as [TicketStatus, typeof STATUS_CONFIG[TicketStatus]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => handleStatusChange(key)}
                  disabled={key === ticket.status}
                  className={`text-[10px] px-2 py-1 rounded-full border transition-all ${
                    key === ticket.status
                      ? cfg.color + ' cursor-default'
                      : 'text-gray-500 border-surface-700 hover:border-gray-600'
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              className="input w-full mt-2 text-xs"
              placeholder="Optional note for status change..."
            />
          </div>

          {/* Priority Management */}
          <div className="card p-4">
            <h4 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider">Priority</h4>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(PRIORITY_CONFIG) as [Priority, typeof PRIORITY_CONFIG[Priority]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => handlePriorityChange(key)}
                  disabled={key === ticket.priority}
                  className={`text-[10px] px-2 py-1 rounded-full border transition-all ${
                    key === ticket.priority
                      ? cfg.color + ' border-current bg-opacity-10 cursor-default'
                      : 'text-gray-500 border-surface-700 hover:border-gray-600'
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Developer Notes */}
          {user?.role === 'Owner' && (
            <div className="card p-4">
              <h4 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider">Developer Notes</h4>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="input w-full resize-y text-xs"
                placeholder="Internal notes..."
              />
              <button onClick={handleSaveNotes} className="btn-primary text-xs mt-2 w-full">Save Notes</button>
            </div>
          )}

          {/* Sync */}
          <div className="card p-4">
            <h4 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider">Synchronization</h4>
            <div className="text-xs text-gray-400 space-y-2">
              <div className="flex justify-between">
                <span>Status</span>
                <span className={ticket.sync_status === 'synced' ? 'text-green-400' : ticket.sync_status === 'failed' ? 'text-red-400' : 'text-yellow-400'}>
                  {ticket.sync_status}
                </span>
              </div>
              {ticket.sync_retries > 0 && (
                <div className="flex justify-between">
                  <span>Retries</span>
                  <span>{ticket.sync_retries}</span>
                </div>
              )}
              {ticket.sync_error && (
                <div className="text-red-400 text-[10px] break-all">{ticket.sync_error}</div>
              )}
              <button onClick={handleSync} className="text-minecraft-400 hover:text-minecraft-300 flex items-center gap-1 text-[10px]">
                <RefreshCw size={10} /> Trigger Sync
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SyncQueue() {
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchQueue = useCallback(async () => {
    try { setQueue(await api.getSyncQueue()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api.triggerSync();
      toast.success(`Synced: ${result.synced}, Failed: ${result.failed}`);
      fetchQueue();
    } catch (err: any) { toast.error(err.message); }
    setSyncing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Upload size={16} /> Pending Uploads
        </h3>
        <button
          onClick={handleSync}
          disabled={syncing || queue.length === 0}
          className="btn-primary text-xs flex items-center gap-1"
        >
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {syncing ? 'Syncing...' : `Sync All (${queue.length})`}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-minecraft-500" />
        </div>
      ) : queue.length === 0 ? (
        <div className="card p-8 text-center">
          <Upload size={32} className="mx-auto text-gray-600 mb-2" />
          <p className="text-sm text-gray-500">No pending uploads</p>
          <p className="text-xs text-gray-600 mt-1">All tickets are synchronized</p>
        </div>
      ) : (
        <div className="space-y-2">
          {queue.map((item: any) => (
            <div key={item.id} className="card-hover p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${
                  item.status === 'completed' ? 'bg-green-500' :
                  item.status === 'failed' ? 'bg-red-500' :
                  item.status === 'processing' ? 'bg-yellow-500 animate-pulse' : 'bg-yellow-500'
                }`} />
                <div>
                  <span className="text-xs text-gray-200 font-mono">{item.ticket_id}</span>
                  <span className="text-xs text-gray-500 ml-2 capitalize">{item.action}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                <span>{item.status}</span>
                {item.retries > 0 && <span className="ml-2">({item.retries} retries)</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Feedback() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const { socket } = useSocket();
  const { server } = useActiveServer();

  // Filters
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFilters, setShowFilters] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      const params: any = {};
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (searchQuery) params.search = searchQuery;
      if (sortField) params.sort = sortField;
      if (sortOrder) params.order = sortOrder;
      params.limit = 100;
      setTickets(await api.getFeedbackTickets(params));
    } catch {}
    setLoading(false);
  }, [filterType, filterStatus, filterPriority, searchQuery, sortField, sortOrder]);

  const fetchStats = useCallback(async () => {
    try { setStats(await api.getFeedbackStats()); } catch {}
  }, []);

  useEffect(() => {
    fetchTickets();
    fetchStats();
  }, [fetchTickets, fetchStats]);

  useEffect(() => {
    if (!socket) return;
    const handler = () => { fetchTickets(); fetchStats(); };
    socket.on('feedback:update', handler);
    socket.on('feedback:created', handler);
    return () => {
      socket.off('feedback:update', handler);
      socket.off('feedback:created', handler);
    };
  }, [socket, fetchTickets, fetchStats]);

  const handleViewTicket = (id: string) => {
    setSelectedTicketId(id);
    setViewMode('detail');
  };

  if (viewMode === 'create') {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
              <MessageCircle className="text-minecraft-500" size={24} />
              Submit Feedback
            </h2>
            <p className="text-sm text-gray-500 mt-1">All reports are stored locally. No GitHub account needed.</p>
          </div>
          <button onClick={() => setViewMode('queue')} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
            <Upload size={12} /> Pending Uploads
          </button>
        </div>
        <CreateForm onCreated={() => { setViewMode('list'); fetchTickets(); fetchStats(); }} />
      </div>
    );
  }

  if (viewMode === 'detail' && selectedTicketId) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <TicketDetail
          ticketId={selectedTicketId}
          onBack={() => setViewMode('list')}
          onUpdated={() => { fetchTickets(); fetchStats(); }}
        />
      </div>
    );
  }

  if (viewMode === 'queue') {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <Upload className="text-minecraft-500" size={24} />
            Sync Queue
          </h2>
          <button onClick={() => setViewMode('list')} className="text-xs text-gray-500 hover:text-gray-300">
            Back to tickets
          </button>
        </div>
        <SyncQueue />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <MessageCircle className="text-minecraft-500" size={24} />
            Feedback & Issue Center
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {stats?.totalTickets || 0} total tickets · {stats?.pendingUploads || 0} pending uploads
            {stats?.crashReports > 0 && ` · ${stats.crashReports} crash reports`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewMode('queue')} className="btn-ghost text-xs flex items-center gap-1">
            <Upload size={14} />
            Queue
            {stats?.pendingUploads > 0 && (
              <span className="bg-yellow-500 text-black text-[9px] px-1.5 py-0.5 rounded-full font-bold">{stats.pendingUploads}</span>
            )}
          </button>
          <button onClick={() => setViewMode('create')} className="btn-primary text-sm flex items-center gap-2">
            <Plus size={16} />
            New Report
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card-hover p-3 text-center">
            <div className="text-2xl font-bold text-gray-100">{stats.totalTickets}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Total Tickets</div>
          </div>
          <div className="card-hover p-3 text-center">
            <div className="text-2xl font-bold text-green-400">{stats.byStatus?.open || 0}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Open</div>
          </div>
          <div className="card-hover p-3 text-center">
            <div className="text-2xl font-bold text-purple-400">{stats.resolvedReports}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Resolved/Closed</div>
          </div>
          <div className="card-hover p-3 text-center">
            <div className="text-2xl font-bold text-red-400">{stats.crashReports}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Crash Reports</div>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full pl-8 text-sm"
              placeholder="Search by ID, summary, or description..."
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-ghost text-xs flex items-center gap-1 ${showFilters ? 'text-minecraft-400' : ''}`}
          >
            <Filter size={14} /> Filters
          </button>
          <button
            onClick={() => {
              setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
            }}
            className="btn-ghost text-xs flex items-center gap-1"
          >
            <ArrowUpDown size={14} />
            {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-surface-700">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="input w-full text-xs"
              >
                <option value="">All Types</option>
                {ISSUE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="input w-full text-xs"
              >
                <option value="">All Statuses</option>
                {(Object.entries(STATUS_CONFIG) as [string, typeof STATUS_CONFIG[TicketStatus]][]).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="input w-full text-xs"
              >
                <option value="">All Priorities</option>
                {(Object.entries(PRIORITY_CONFIG) as [string, typeof PRIORITY_CONFIG[Priority]][]).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Tickets List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-minecraft-500" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="card p-12 text-center">
          <MessageCircle size={48} className="mx-auto text-gray-700 mb-3" />
          <h3 className="text-lg font-semibold text-gray-300 mb-1">No tickets yet</h3>
          <p className="text-sm text-gray-500 mb-4">Be the first to submit feedback or report an issue.</p>
          <button onClick={() => setViewMode('create')} className="btn-primary text-sm">
            Create Report
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onClick={() => handleViewTicket(ticket.id || ticket.ticket_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
