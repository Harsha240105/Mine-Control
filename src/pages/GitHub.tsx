import React, { useState, useEffect } from 'react';
import { Github, Bug, Lightbulb, Send, Paperclip, List, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface Issue {
  id: string;
  title: string;
  description: string;
  type: 'bug' | 'feature';
  status: 'open' | 'accepted' | 'delayed' | 'completed';
  username: string;
  image_count: number;
  video_count: number;
  created_at: string;
}

export default function GitHub() {
  const [tab, setTab] = useState<'report' | 'request' | 'list'>('report');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [bugTitle, setBugTitle] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [bugLogs, setBugLogs] = useState('');
  const [bugImages, setBugImages] = useState<File[]>([]);
  const [bugVideos, setBugVideos] = useState<File[]>([]);
  const [featureTitle, setFeatureTitle] = useState('');
  const [featureDescription, setFeatureDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchIssues();
  }, []);

  const fetchIssues = async () => {
    try {
      const data = await api.getGitHubIssues();
      setIssues(data);
    } catch {}
  };

  const handleBugSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugTitle || !bugDescription) {
      toast.error('Title and description are required');
      return;
    }
    setSubmitting(true);
    try {
      await api.submitBugReport({
        title: bugTitle,
        description: bugDescription,
        logs: bugLogs,
        images: bugImages.map(f => f.name),
        videos: bugVideos.map(f => f.name),
      });
      toast.success('Bug report submitted!');
      setBugTitle(''); setBugDescription(''); setBugLogs(''); setBugImages([]); setBugVideos([]);
      fetchIssues();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  const handleFeatureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!featureTitle || !featureDescription) {
      toast.error('Title and description are required');
      return;
    }
    setSubmitting(true);
    try {
      await api.submitFeatureRequest({
        title: featureTitle,
        description: featureDescription,
      });
      toast.success('Feature request submitted!');
      setFeatureTitle(''); setFeatureDescription('');
      fetchIssues();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'open': return <AlertTriangle size={14} className="text-yellow-400" />;
      case 'accepted': return <CheckCircle size={14} className="text-green-400" />;
      case 'completed': return <CheckCircle size={14} className="text-blue-400" />;
      case 'delayed': return <Clock size={14} className="text-gray-400" />;
      default: return <AlertTriangle size={14} className="text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <Github className="text-minecraft-500" size={24} />
          GitHub Community
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Report bugs, request features, and track progress
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900 p-1 rounded-lg w-fit border border-surface-800">
        <button
          onClick={() => setTab('report')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
            tab === 'report' ? 'bg-red-500/20 text-red-400' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Bug size={14} /> Report Bug
        </button>
        <button
          onClick={() => setTab('request')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
            tab === 'request' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Lightbulb size={14} /> Feature Request
        </button>
        <button
          onClick={() => setTab('list')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
            tab === 'list' ? 'bg-minecraft-500/20 text-minecraft-400' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <List size={14} /> All Reports ({issues.length})
        </button>
      </div>

      {/* Bug Report Form */}
      {tab === 'report' && (
        <div className="card max-w-2xl">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <Bug size={16} className="text-red-400" />
            Submit a Bug Report
          </h3>
          <form onSubmit={handleBugSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Title *</label>
              <input
                type="text"
                value={bugTitle}
                onChange={(e) => setBugTitle(e.target.value)}
                className="input"
                placeholder="Brief description of the bug"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Description *</label>
              <textarea
                value={bugDescription}
                onChange={(e) => setBugDescription(e.target.value)}
                className="input min-h-[100px] resize-y"
                placeholder="Describe what happened, what you expected, and steps to reproduce..."
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Server Logs (optional)</label>
              <textarea
                value={bugLogs}
                onChange={(e) => setBugLogs(e.target.value)}
                className="input min-h-[80px] resize-y font-mono text-xs"
                placeholder="Paste relevant server logs here..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Attach Images (max 25 MB each)</label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setBugImages(Array.from(e.target.files || []))}
                className="text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-surface-800 file:text-gray-300 hover:file:bg-surface-700"
              />
              {bugImages.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">{bugImages.length} image(s) selected</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Attach Videos (max 100 MB each)</label>
              <input
                type="file"
                multiple
                accept="video/*"
                onChange={(e) => setBugVideos(Array.from(e.target.files || []))}
                className="text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-surface-800 file:text-gray-300 hover:file:bg-surface-700"
              />
              {bugVideos.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">{bugVideos.length} video(s) selected</p>
              )}
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary flex items-center gap-2"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {submitting ? 'Submitting...' : 'Submit Bug Report'}
            </button>
          </form>
        </div>
      )}

      {/* Feature Request Form */}
      {tab === 'request' && (
        <div className="card max-w-2xl">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <Lightbulb size={16} className="text-purple-400" />
            Submit a Feature Request
          </h3>
          <form onSubmit={handleFeatureSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Title *</label>
              <input
                type="text"
                value={featureTitle}
                onChange={(e) => setFeatureTitle(e.target.value)}
                className="input"
                placeholder="Name of the feature you want"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Description *</label>
              <textarea
                value={featureDescription}
                onChange={(e) => setFeatureDescription(e.target.value)}
                className="input min-h-[150px] resize-y"
                placeholder="Describe the feature in detail. Why would it be useful? How should it work?"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary flex items-center gap-2"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {submitting ? 'Submitting...' : 'Submit Feature Request'}
            </button>
          </form>
        </div>
      )}

      {/* Issues List */}
      {tab === 'list' && (
        <div className="space-y-2">
          {issues.length === 0 && (
            <div className="card p-8 text-center text-gray-500">
              <Github size={40} className="mx-auto mb-3 opacity-30" />
              <p>No reports yet</p>
              <p className="text-xs mt-1">Submit a bug report or feature request to see it here</p>
            </div>
          )}
          {issues.map((issue) => (
            <div key={issue.id} className="card-hover">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${
                  issue.type === 'bug' ? 'bg-red-500/10 text-red-400' : 'bg-purple-500/10 text-purple-400'
                }`}>
                  {issue.type === 'bug' ? <Bug size={16} /> : <Lightbulb size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-gray-200">{issue.title}</h3>
                    <span className={`text-xs px-1.5 py-0.5 rounded uppercase ${
                      issue.type === 'bug' ? 'text-red-400 bg-red-500/10' : 'text-purple-400 bg-purple-500/10'
                    }`}>
                      {issue.type}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      {statusIcon(issue.status)}
                      {issue.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{issue.description.replace(/^## .*\n\n/, '').slice(0, 200)}</p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                    <span>by {issue.username}</span>
                    <span>{new Date(issue.created_at).toLocaleDateString()}</span>
                    {issue.image_count > 0 && <span>{issue.image_count} image(s)</span>}
                    {issue.video_count > 0 && <span>{issue.video_count} video(s)</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
