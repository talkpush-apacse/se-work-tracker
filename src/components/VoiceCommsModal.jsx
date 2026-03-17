import { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Mic, MicOff, RotateCcw, Copy, Check, Loader2,
  AlertCircle, Save, Sparkles, Bold, Italic,
} from 'lucide-react';
import Modal from './Modal';
import { Button } from './ui/button';
import { useAppStore } from '../context/StoreContext';
import { callClaude } from '../lib/api';

// ── System prompt (as specified) ─────────────────────────────────────────────
const VOICE_COMMS_PROMPT = `You are a professional communications assistant for a Solutions Engineer at a B2B SaaS company called Talkpush.
The user has just recorded a voice note describing something they want to communicate — it could be a client update, an internal message, a follow-up email, or a status update.
Your job is to turn that raw voice transcript into a clean, professional, and concise communication draft.
Rules:
- Preserve the intent and key details from the voice note exactly
- Write in a warm but direct tone — no filler phrases like "I hope this email finds you well"
- Format as an email if it sounds like one (include Subject: line), otherwise format as a short message
- Do not add information that wasn't in the voice note
- Keep it short — enterprise clients are busy
- Output only the final draft, no explanation or preamble`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function textToHtml(text) {
  return text
    .split(/\n{2,}/)
    .map(p => `<p>${p.trim().replace(/\n/g, '<br/>')}</p>`)
    .filter(p => p !== '<p></p>')
    .join('');
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function VoiceCommsModal({ onClose }) {
  const { customers, addAnnotation, aiSettings } = useAppStore();

  // step: 'recording' | 'transcribing' | 'confirming' | 'drafting' | 'editing' | 'error'
  const [step, setStep] = useState('recording');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const [duration, setDuration] = useState(0);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);
  const timerRef         = useRef(null);
  const streamRef        = useRef(null);
  const mimeTypeRef      = useRef('audio/webm');

  // TipTap editor — always initialized, rendered only in 'editing' step
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      UnderlineExt,
      Placeholder.configure({ placeholder: 'Your draft will appear here…' }),
    ],
    content: '',
    editorProps: {
      attributes: { class: 'focus:outline-none min-h-[160px]' },
    },
  });

  // Start recording immediately on mount
  useEffect(() => {
    startRecording();
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recording ──────────────────────────────────────────────────────────────
  async function startRecording() {
    setError(null);
    setDuration(0);
    audioChunksRef.current = [];

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    } catch {
      setError('Microphone access denied. Please allow microphone permission and try again.');
      setStep('error');
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    mimeTypeRef.current = mimeType;
    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      clearInterval(timerRef.current);
      stream.getTracks().forEach(t => t.stop());
      transcribeAudio();
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setStep('recording');

    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  }

  function stopRecording() {
    clearInterval(timerRef.current);
    setStep('transcribing');
    mediaRecorderRef.current?.stop();
  }

  // ── Transcription ──────────────────────────────────────────────────────────
  async function transcribeAudio() {
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
      const formData  = new FormData();
      formData.append('file', audioBlob, mimeTypeRef.current === 'audio/webm' ? 'voice.webm' : 'voice.mp4');
      formData.append('model', 'whisper-1');

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_API_SECRET}` },
        body: formData,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Transcription failed');
      }

      const { text } = await res.json();
      if (!text?.trim()) throw new Error('No speech detected. Try recording again.');

      setTranscript(text.trim());
      setStep('confirming');
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  }

  // ── AI drafting ────────────────────────────────────────────────────────────
  async function draftFromTranscript(text) {
    setStep('drafting');
    setError(null);

    const customer = customers.find(c => c.id === selectedCustomerId);
    const systemPrompt = customer
      ? `${VOICE_COMMS_PROMPT}\n\nThe client being referenced is ${customer.name}. You may use their name naturally in the draft where appropriate.`
      : VOICE_COMMS_PROMPT;

    try {
      const draftText = (await callClaude({
        model:      aiSettings?.claudeModel,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: text }],
        max_tokens: 800,
      })).trim();
      if (!draftText) throw new Error('No draft received from Claude.');

      editor?.commands.setContent(textToHtml(draftText));
      setStep('editing');
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  }

  // ── Re-record ──────────────────────────────────────────────────────────────
  function handleReRecord() {
    clearInterval(timerRef.current);
    setTranscript('');
    setError(null);
    setDuration(0);
    setCopied(false);
    setSaved(false);
    editor?.commands.setContent('');
    startRecording();
  }

  // ── Copy plain text ────────────────────────────────────────────────────────
  function handleCopy() {
    const text = editor?.getText({ blockSeparator: '\n\n' }) || '';
    navigator.clipboard.writeText(text.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Save to Knowledge ──────────────────────────────────────────────────────
  function handleSave() {
    const plainText = editor?.getText({ blockSeparator: '\n\n' }) || '';
    addAnnotation({
      text: `[Voice Draft]\n${plainText.trim()}\n\n[Transcript]\n${transcript}`,
      date: new Date().toISOString().slice(0, 10),
      tag: null,
      customerId: selectedCustomerId || null,
    });
    setSaved(true);
    setTimeout(onClose, 1200);
  }

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const showCustomerPicker = step === 'recording' || step === 'confirming' || step === 'editing';

  return (
    <Modal title="Voice Comms" onClose={onClose} size="lg">
      <div className="space-y-5">

        {/* ── Optional client context picker ── */}
        {showCustomerPicker && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Client context <span className="text-muted-foreground/50">(optional — helps Claude reference the right client)</span>
            </label>
            <select
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
              disabled={step === 'editing' && saved}
              className="w-full h-9 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            >
              <option value="">— No specific client —</option>
              {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Recording ── */}
        {step === 'recording' && (
          <div className="flex flex-col items-center gap-5 py-4">
            <div className="relative flex items-center justify-center w-24 h-24 rounded-full">
              <div className="absolute inset-0 rounded-full bg-red-500/15 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-red-500/10 border border-red-500/20" />
              <Mic size={36} className="text-red-400 relative z-10" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">Recording</p>
              <p className="text-3xl font-mono tabular-nums text-foreground">{formatDuration(duration)}</p>
            </div>
            <Button onClick={stopRecording} variant="destructive" className="gap-2 min-w-[140px]">
              <MicOff size={15} />
              Stop Recording
            </Button>
          </div>
        )}

        {/* ── Transcribing ── */}
        {step === 'transcribing' && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 size={28} className="animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Transcribing your note…</p>
          </div>
        )}

        {/* ── Transcript confirmation ── */}
        {step === 'confirming' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Transcript — edit if Whisper misheard anything
              </label>
              <textarea
                rows={4}
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                autoFocus
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReRecord} className="gap-1.5 shrink-0">
                <RotateCcw size={13} />
                Re-record
              </Button>
              <Button
                size="sm"
                onClick={() => draftFromTranscript(transcript)}
                disabled={!transcript.trim()}
                className="flex-1 gap-1.5"
              >
                <Sparkles size={13} />
                Draft this
              </Button>
            </div>
          </div>
        )}

        {/* ── Drafting ── */}
        {step === 'drafting' && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 size={28} className="animate-spin text-teal-500" />
            <p className="text-sm text-muted-foreground">Drafting your message…</p>
          </div>
        )}

        {/* ── Editing (TipTap) ── */}
        {step === 'editing' && (
          <div className="space-y-3">
            <div>
              {/* Header row: label + mini toolbar */}
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Draft
                  {selectedCustomer && (
                    <span className="ml-2 text-teal-500 font-normal">· {selectedCustomer.name}</span>
                  )}
                  <span className="ml-1.5 text-muted-foreground/50">(editable)</span>
                </label>
                {/* Mini formatting toolbar */}
                <div className="flex items-center gap-0.5">
                  <button
                    onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }}
                    className={`p-1.5 rounded transition-colors ${
                      editor?.isActive('bold')
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                    title="Bold"
                  >
                    <Bold size={13} />
                  </button>
                  <button
                    onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }}
                    className={`p-1.5 rounded transition-colors ${
                      editor?.isActive('italic')
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                    title="Italic"
                  >
                    <Italic size={13} />
                  </button>
                  <button
                    onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleUnderline().run(); }}
                    className={`p-1.5 rounded transition-colors text-[11px] font-medium ${
                      editor?.isActive('underline')
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                    title="Underline"
                  >
                    U̲
                  </button>
                </div>
              </div>

              {/* TipTap editor area */}
              <div
                className="bg-card border border-border rounded-xl px-4 py-3 cursor-text
                  [&_.ProseMirror]:outline-none
                  [&_.ProseMirror]:min-h-[160px]
                  [&_.ProseMirror_p]:text-sm
                  [&_.ProseMirror_p]:text-foreground
                  [&_.ProseMirror_p]:leading-relaxed
                  [&_.ProseMirror_p]:mb-2
                  [&_.ProseMirror_p:last-child]:mb-0"
                onClick={() => editor?.commands.focus()}
              >
                <EditorContent editor={editor} />
              </div>
            </div>

            {/* Actions */}
            {saved ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                <Check size={13} />
                Saved to Knowledge!
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleReRecord} className="gap-1.5 shrink-0">
                  <RotateCcw size={13} />
                  Re-record
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 shrink-0">
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  className="flex-1 gap-1.5 bg-teal-600 hover:bg-teal-500 text-white"
                >
                  <Save size={13} />
                  Save to Knowledge
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleReRecord} className="gap-1.5 w-full">
              <RotateCcw size={13} />
              Try again
            </Button>
          </div>
        )}

      </div>
    </Modal>
  );
}
