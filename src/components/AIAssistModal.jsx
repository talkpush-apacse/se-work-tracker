import { useState, useRef } from 'react';
import { Mic, MicOff, Loader2, Check, Sparkles } from 'lucide-react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';
import { Button } from './ui/button';

// System prompt for standalone AI Assist (not task-specific)
const STANDALONE_SYSTEM_PROMPT = `You are a Solutions Engineer's assistant at Talkpush.
The user has recorded voice notes or typed context about work they did or need to do.
Help them draft a clear, professional internal action item or email draft based on their notes.
Be concise. Output plain text only — no markdown formatting. No asterisks, no bullet symbols, no bold or italic markers.`;

export default function AIAssistModal({ onClose }) {
  const { customers, addTask, aiSettings } = useAppStore();

  // Input
  const [userInput, setUserInput]     = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Generation
  const [isGenerating, setIsGenerating]     = useState(false);
  const [generatedText, setGeneratedText]   = useState('');
  const [editedText, setEditedText]         = useState('');

  // Task creation
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [taskDescription, setTaskDescription]       = useState('');

  // UI state
  const [error, setError]   = useState(null);
  const [saved, setSaved]   = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);

  // Resolve which AI provider to use (inherits 'message-draft' setting)
  const currentProvider = aiSettings?.providers?.['message-draft'] || 'openai';

  // ── Voice recording ──────────────────────────────────────────────────────
  const toggleListening = async () => {
    if (isListening) {
      mediaRecorderRef.current?.stop();
      setIsListening(false);
      return;
    }

    setError(null);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone access denied. Allow microphone permission and try again.');
      return;
    }

    audioChunksRef.current = [];
    const recorder = new MediaRecorder(stream);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      setIsTranscribing(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        formData.append('model', 'whisper-1');

        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { Authorization: `Bearer ${import.meta.env.VITE_API_SECRET}` },
          body: formData,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Transcription failed (${res.status})`);
        }
        const data = await res.json();
        setUserInput(prev => prev ? `${prev} ${data.text}` : data.text);
      } catch (err) {
        setError(`Transcription failed: ${err.message}`);
      } finally {
        setIsTranscribing(false);
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsListening(true);
  };

  // ── AI generation ────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!userInput.trim()) {
      setError('Add some notes or record your voice before generating.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedText('');
    setEditedText('');

    try {
      if (currentProvider === 'claude') {
        const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not set.');

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: aiSettings.claudeModel || 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: STANDALONE_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userInput.trim() }],
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Anthropic error ${res.status}`);
        }

        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        setGeneratedText(text);
        setEditedText(text);
        // Auto-fill task description from first line (up to 120 chars)
        if (!taskDescription) {
          const firstLine = text.split('\n')[0].slice(0, 120);
          setTaskDescription(firstLine);
        }
      } else {
        // OpenAI
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
        if (!apiKey) throw new Error('VITE_OPENAI_API_KEY is not set.');

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: aiSettings.openaiModel || 'gpt-4o',
            messages: [
              { role: 'system', content: STANDALONE_SYSTEM_PROMPT },
              { role: 'user', content: userInput.trim() },
            ],
            temperature: 0.7,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `OpenAI error ${res.status}`);
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || '';
        setGeneratedText(text);
        setEditedText(text);
        // Auto-fill task description from first line (up to 120 chars)
        if (!taskDescription) {
          const firstLine = text.split('\n')[0].slice(0, 120);
          setTaskDescription(firstLine);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Create task ──────────────────────────────────────────────────────────
  const handleCreateTask = () => {
    if (!selectedCustomerId) {
      setError('Please select a client first.');
      return;
    }

    const desc = taskDescription.trim() || userInput.trim().slice(0, 120) || 'AI Assist Task';
    addTask({
      customerId: selectedCustomerId,
      description: desc,
      taskType: 'focus-time',
      status: 'open',
    });

    setSaved(true);
    setTimeout(onClose, 1200);
  };

  const micBusy = isListening || isTranscribing;

  return (
    <Modal title="AI Assist" onClose={onClose}>
      <div className="space-y-4">

        {/* Success state */}
        {saved && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <Check size={13} />
            Task created!
          </div>
        )}

        {/* ── Notes / Voice input ── */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Notes or voice context
          </label>
          <div className="relative">
            <textarea
              rows={4}
              autoFocus
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              placeholder="Type your notes, or record your voice…"
              disabled={saved}
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
            />
            {/* Mic button — overlaid bottom-right of textarea */}
            <button
              type="button"
              onClick={toggleListening}
              disabled={isGenerating || saved}
              title={isListening ? 'Stop recording' : 'Record voice'}
              className={`absolute bottom-2 right-2 p-1.5 rounded-lg transition-colors ${
                isListening
                  ? 'text-red-400 bg-red-500/15 border border-red-500/30 animate-pulse'
                  : isTranscribing
                    ? 'text-amber-400 bg-amber-500/15 border border-amber-500/30'
                    : 'text-muted-foreground hover:text-foreground bg-secondary border border-border hover:border-ring'
              }`}
            >
              {isTranscribing
                ? <Loader2 size={13} className="animate-spin" />
                : isListening
                  ? <MicOff size={13} />
                  : <Mic size={13} />
              }
            </button>
          </div>
          {isListening && (
            <p className="mt-1 text-[10px] text-red-400 font-medium">Recording… click mic to stop</p>
          )}
          {isTranscribing && (
            <p className="mt-1 text-[10px] text-amber-400 font-medium">Transcribing…</p>
          )}
        </div>

        {/* ── Generate button ── */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleGenerate}
          disabled={!userInput.trim() || isGenerating || micBusy || saved}
          className="w-full"
        >
          {isGenerating
            ? <><Loader2 size={13} className="animate-spin mr-1.5" />Generating…</>
            : <><Sparkles size={13} className="mr-1.5" />Generate Draft</>
          }
        </Button>

        {/* ── Generated output (editable) ── */}
        {generatedText && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Generated draft <span className="text-muted-foreground/50">(editable)</span>
            </label>
            <textarea
              rows={6}
              value={editedText}
              onChange={e => setEditedText(e.target.value)}
              disabled={saved}
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none font-sans"
            />
          </div>
        )}

        {/* ── Task description ── */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Task description
          </label>
          <input
            type="text"
            value={taskDescription}
            onChange={e => setTaskDescription(e.target.value)}
            placeholder={userInput.trim().slice(0, 80) || 'Short description for this task…'}
            disabled={saved}
            className="w-full h-9 bg-card border border-border rounded-xl px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          />
        </div>

        {/* ── Assign to client ── */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Assign to client <span className="text-destructive">*</span>
          </label>
          <select
            value={selectedCustomerId}
            onChange={e => { setSelectedCustomerId(e.target.value); setError(null); }}
            disabled={saved}
            className="w-full h-9 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">— Select client —</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        {/* ── Actions ── */}
        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleCreateTask}
            disabled={!selectedCustomerId || saved}
            className="flex-1"
          >
            {saved ? <><Check size={13} className="mr-1.5" />Saved!</> : 'Create Task'}
          </Button>
        </div>

      </div>
    </Modal>
  );
}
