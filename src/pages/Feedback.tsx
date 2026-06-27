import React, { useState } from 'react';
import { MessageCircle, Send, CheckCircle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

export default function Feedback() {
  const [type, setType] = useState<'bug' | 'feature' | 'general'>('general');
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      await api.post('/feedback', { type, message: message.trim(), title: title.trim() || undefined });
      toast.success('Feedback submitted! Thank you.');
      setMessage('');
      setTitle('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit feedback');
    }
    setSending(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <MessageCircle className="text-minecraft-500" size={24} />
          Feedback
        </h2>
        <p className="text-sm text-gray-500 mt-1">Help us improve MineControl OS by sharing your thoughts.</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
          <div className="flex gap-2">
            {(['bug', 'feature', 'general'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  type === t
                    ? 'bg-minecraft-600/20 text-minecraft-400 border border-minecraft-500/30'
                    : 'bg-surface-800 text-gray-400 border border-surface-700 hover:border-surface-600'
                }`}
              >
                {t === 'bug' ? 'Bug Report' : t === 'feature' ? 'Feature Request' : 'General'}
              </button>
            ))}
          </div>
        </div>

        {type === 'bug' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input w-full"
              placeholder="Brief summary of the bug..."
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="input w-full resize-y"
            placeholder="Describe your feedback, bug, or feature idea..."
            required
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sending || !message.trim()}
            className="btn-primary flex items-center gap-2"
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            {sending ? 'Sending...' : 'Submit Feedback'}
          </button>
        </div>
      </form>
    </div>
  );
}
