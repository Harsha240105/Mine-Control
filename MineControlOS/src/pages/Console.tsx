import React, { useEffect, useState, useRef } from 'react';
import { Terminal, Send, Download, Search, X, Trash2, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';

interface LogEntry {
  id?: number;
  text: string;
  level: 'info' | 'warn' | 'error' | 'fatal' | 'debug';
}

export default function Console() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [command, setCommand] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const consoleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { socket } = useSocket();

  useEffect(() => {
    loadLogs();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('server:output', (data: string) => {
      const entry = parseLogLine(data);
      setLogs((prev) => {
        const next = [...prev, entry];
        return next.slice(-1000);
      });
    });
    return () => {
      socket.off('server:output');
    };
  }, [socket]);

  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const loadLogs = async () => {
    try {
      const data: string[] = await api.getLogs(200);
      const parsed = data.map((line) => parseLogLine(line));
      setLogs(parsed);
    } catch {}
  };

  const parseLogLine = (line: string): LogEntry => {
    let level: LogEntry['level'] = 'info';
    if (line.includes('[WARN]') || line.toLowerCase().includes('warn')) level = 'warn';
    else if (line.includes('[ERROR]') || line.toLowerCase().includes('error') || line.includes('[STDERR]')) level = 'error';
    else if (line.includes('[FATAL]')) level = 'fatal';
    else if (line.includes('[DEBUG]')) level = 'debug';
    return { text: line, level, id: Date.now() + Math.random() };
  };

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    try {
      await api.sendCommand(command.trim());
      setCommand('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const results = await api.searchLogs(searchQuery);
      if (results.length === 0) {
        toast('No results found', { icon: '🔍' });
        return;
      }
      const parsed = results.map((line: string) => parseLogLine(line));
      setLogs(parsed);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDownload = () => {
    const text = logs.map((l) => l.text).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `server-log-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Logs downloaded');
  };

  const displayLogs = logs.filter((l) => {
    if (filterLevel !== 'all' && l.level !== filterLevel) return false;
    if (searchQuery && !l.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const levelColors: Record<string, string> = {
    info: 'text-gray-300',
    warn: 'text-yellow-400',
    error: 'text-red-400',
    fatal: 'text-red-500 font-bold',
    debug: 'text-gray-500',
  };

  const levelBadge = (level: string) => {
    switch (level) {
      case 'warn': return <span className="text-yellow-500 font-medium">WARN</span>;
      case 'error': return <span className="text-red-500 font-medium">ERROR</span>;
      case 'fatal': return <span className="text-red-600 font-bold">FATAL</span>;
      case 'debug': return <span className="text-gray-500">DEBUG</span>;
      default: return <span className="text-gray-400">INFO</span>;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Live Console</h2>
          <p className="text-sm text-gray-500 mt-0.5">Server command line interface</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter */}
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="text-xs bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-gray-300"
          >
            <option value="all">All Levels</option>
            <option value="info">INFO</option>
            <option value="warn">WARN</option>
            <option value="error">ERROR</option>
            <option value="fatal">FATAL</option>
            <option value="debug">DEBUG</option>
          </select>
          <button onClick={() => setShowSearch(!showSearch)} className="btn-ghost p-2" title="Search">
            <Search size={16} />
          </button>
          <button onClick={loadLogs} className="btn-ghost p-2" title="Refresh">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
          <button onClick={handleDownload} className="btn-ghost p-2" title="Download Logs">
            <Download size={16} />
          </button>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`btn-ghost p-2 ${autoScroll ? 'text-minecraft-400' : ''}`}
            title="Auto-scroll"
          >
            <ChevronDown size={16} />
          </button>
          <button
            onClick={() => setLogs([])}
            className="btn-ghost p-2 hover:text-red-400"
            title="Clear Console"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="mb-3 animate-slide-in">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="input pl-9 text-sm"
                placeholder="Search logs..."
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); loadLogs(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button onClick={handleSearch} className="btn-primary text-sm">Search</button>
          </div>
        </div>
      )}

      {/* Console Output */}
      <div
        ref={consoleRef}
        className="flex-1 card p-4 overflow-y-auto font-mono text-sm bg-surface-950/50 border-surface-800"
      >
        <div className="space-y-0.5">
          {displayLogs.map((log, i) => (
            <div key={log.id || i} className={`${levelColors[log.level]} hover:bg-surface-800/30 px-1 rounded`}>
              <span className="opacity-0 hover:opacity-100 text-gray-600 mr-2 select-none">{i}</span>
              <span className="mr-2">{levelBadge(log.level)}</span>
              <span>{log.text}</span>
            </div>
          ))}
          {displayLogs.length === 0 && (
            <div className="text-gray-500 text-center py-8">
              <Terminal size={32} className="mx-auto mb-2 opacity-30" />
              <p>Console output will appear here</p>
              <p className="text-xs mt-1">Start the server to begin receiving logs</p>
            </div>
          )}
        </div>
      </div>

      {/* Command Input */}
      <form onSubmit={handleSendCommand} className="mt-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-minecraft-500 font-mono text-sm">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="input pl-8 pr-12 font-mono text-sm bg-surface-900 border-surface-700"
            placeholder="Enter a command..."
          />
          <button
            type="submit"
            disabled={!command.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-minecraft-400 disabled:opacity-30 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
