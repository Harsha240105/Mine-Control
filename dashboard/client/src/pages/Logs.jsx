import React, { useRef, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { Terminal as TerminalIcon, Download, Trash2 } from 'lucide-react';

export default function Logs() {
  const { logs, setLogs } = useServer();
  const terminalRef = useRef(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const handleDownload = () => {
    const content = logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `server-log-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setLogs([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TerminalIcon className="w-6 h-6 text-accent-400" />
          <h2 className="text-xl font-bold text-white">Server Console</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleClear} className="btn-secondary flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
          <button onClick={handleDownload} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      </div>

      <div
        ref={terminalRef}
        className="terminal h-[70vh] overflow-auto bg-surface-950/95 text-sm"
      >
        {logs.length === 0 ? (
          <p className="text-surface-500 italic">Waiting for server logs...</p>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="text-surface-300 leading-relaxed hover:bg-surface-800/30 px-2 -mx-2 font-mono">
              <span className="text-surface-600 mr-2 select-none w-10 inline-block text-right">
                {String(i + 1).padStart(4, '0')}
              </span>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
