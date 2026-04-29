import { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY = 'debug-overlay';
const MAX_ENTRIES = 30;

function getTs() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0'))
    .join(':');
}

function formatMsg(args) {
  return args
    .map(a => {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(' ');
}

export default function DebugOverlay() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) === 'on');
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState([]);
  const [copied, setCopied] = useState(false);
  const entriesRef = useRef([]);

  // Handle ?debug=1 / ?debug=0 URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      localStorage.setItem(STORAGE_KEY, 'on');
      params.delete('debug');
      const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
      window.location.replace(clean);
    } else if (params.get('debug') === '0') {
      localStorage.removeItem(STORAGE_KEY);
      params.delete('debug');
      const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
      window.location.replace(clean);
    }
  }, []);

  // Wire up console interception and global error listeners
  useEffect(() => {
    if (!enabled) return;

    const push = (level, args) => {
      const entry = { id: Date.now() + Math.random(), ts: getTs(), level, msg: formatMsg(args) };
      const next = [...entriesRef.current, entry].slice(-MAX_ENTRIES);
      entriesRef.current = next;
      setEntries(next);
    };

    // Console interception
    const orig = {
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      log: console.log.bind(console),
    };

    console.error = (...args) => { push('ERROR', args); orig.error(...args); };
    console.warn  = (...args) => { push('WARN',  args); orig.warn(...args); };
    console.log   = (...args) => { push('LOG',   args); orig.log(...args); };

    // Global error listeners
    const onError = (event) => {
      const msg = event.error
        ? (event.error.message || String(event.error)) + (event.error.stack ? '\n' + event.error.stack : '')
        : event.message || 'Unknown error';
      push('ERROR', [`[window.onerror] ${msg}`]);
    };

    const onUnhandledRejection = (event) => {
      const reason = event.reason;
      const msg = reason instanceof Error
        ? (reason.message || String(reason)) + (reason.stack ? '\n' + reason.stack : '')
        : String(reason ?? 'Unknown rejection');
      push('ERROR', [`[unhandledrejection] ${msg}`]);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      console.error = orig.error;
      console.warn  = orig.warn;
      console.log   = orig.log;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [enabled]);

  const handleCopy = useCallback(() => {
    const text = entriesRef.current.map(e => `[${e.ts}] ${e.level}: ${e.msg}`).join('\n');
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleClear = useCallback(() => {
    entriesRef.current = [];
    setEntries([]);
  }, []);

  if (!enabled) return null;

  const errorCount = entries.filter(e => e.level === 'ERROR').length;

  // Collapsed chip
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{ zIndex: 9999 }}
        className={`fixed bottom-4 right-4 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-mono font-bold text-white shadow-lg ${
          errorCount > 0 ? 'bg-red-600' : 'bg-gray-700'
        }`}
      >
        {errorCount > 0 ? `⚠ ${errorCount} err` : `● ${entries.length} log`}
      </button>
    );
  }

  // Expanded panel
  return (
    <div
      style={{ zIndex: 9999 }}
      className="fixed bottom-4 right-4 w-[90vw] max-w-sm rounded-xl bg-black/85 shadow-2xl border border-white/10 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10">
        <span className="text-xs font-bold text-white font-mono">
          Debug {errorCount > 0 && <span className="text-red-400">({errorCount} err)</span>}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="text-[11px] text-white/50 hover:text-white transition-colors"
          >
            Clear
          </button>
          <button
            onClick={handleCopy}
            className="text-[11px] text-white/50 hover:text-white transition-colors"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="text-white/50 hover:text-white transition-colors text-base leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div className="overflow-y-auto max-h-[45vh] p-2 space-y-1">
        {entries.length === 0 ? (
          <p className="text-white/30 text-[11px] font-mono text-center py-4">No entries yet</p>
        ) : (
          [...entries].reverse().map(entry => (
            <div
              key={entry.id}
              className={`text-[11px] font-mono leading-snug break-all whitespace-pre-wrap ${
                entry.level === 'ERROR' ? 'text-red-400' :
                entry.level === 'WARN'  ? 'text-yellow-300' :
                'text-white/70'
              }`}
            >
              <span className="text-white/30">[{entry.ts}]</span>{' '}
              <span className="font-bold">{entry.level}</span>{' '}
              {entry.msg}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
