import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, FileText, Image as ImageIcon, File, Download, Trash2,
  Loader2, AlertCircle,
} from 'lucide-react';
import { uploadFile, deleteFile } from '../lib/api';
import ConfirmDialog from './ConfirmDialog';

// ── Allowed MIME types ───────────────────────────────────
const ALLOWED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
]);

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5 MB (Vercel serverless limit)

// ── Helpers ──────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(type) {
  return type?.startsWith('image/');
}

function getFileIcon(type) {
  if (isImageType(type)) return ImageIcon;
  if (type === 'application/pdf') return FileText;
  return File;
}

// ── Component ────────────────────────────────────────────
export default function FileAttachments({ attachments = [], onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const dragCountRef = useRef(0); // Track nested drag enter/leave
  const errorTimerRef = useRef(null);

  // Clean up error timeout on unmount
  useEffect(() => () => clearTimeout(errorTimerRef.current), []);

  // Show error for 4 seconds then auto-dismiss
  const showError = useCallback((msg) => {
    setError(msg);
    clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 4000);
  }, []);

  // ── Upload handler ──────────────────────────────────
  const handleUpload = useCallback(async (file) => {
    if (!file) return;

    // Validate type
    if (!ALLOWED_TYPES.has(file.type)) {
      showError(`File type not supported. Try images, PDFs, or documents.`);
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      showError(`File too large (max 4.5 MB). This file is ${formatFileSize(file.size)}.`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const result = await uploadFile(file, (pct) => setUploadProgress(pct));

      if (result?.url) {
        const newAttachment = {
          id: uid(),
          name: file.name,
          url: result.url,
          size: file.size,
          type: file.type,
          uploadedAt: new Date().toISOString(),
        };
        onUpdate([...attachments, newAttachment]);
      } else {
        showError('Upload failed. Please try again.');
      }
    } catch {
      showError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [attachments, onUpdate, showError]);

  // ── Delete handler ──────────────────────────────────
  const handleDelete = useCallback((att) => {
    // Update UI immediately, delete blob in background (best-effort)
    onUpdate(attachments.filter((a) => a.id !== att.id));
    deleteFile(att.url);
  }, [attachments, onUpdate]);

  // ── Drag-and-drop handlers ─────────────────────────
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current -= 1;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer?.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  // ── Render ──────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <AlertCircle size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Upload drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl px-4 py-3 text-center transition-colors ${
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-gray-700/50 hover:border-gray-600'
        }`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <Loader2 size={20} className="animate-spin text-indigo-400" />
            <div className="w-full max-w-[200px] bg-gray-800 rounded-full h-1.5">
              <div
                className="bg-indigo-500 h-1.5 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">{uploadProgress}%</span>
          </div>
        ) : (
          <label className="cursor-pointer flex flex-col items-center gap-1.5">
            <Upload size={18} className="text-gray-500" />
            <span className="text-xs text-gray-400">
              Drop file here or <span className="text-indigo-400 underline">browse</span>
            </span>
            <span className="text-[10px] text-gray-600">
              Images, PDFs, docs up to 4.5 MB
            </span>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={(e) => handleUpload(e.target.files?.[0])}
            />
          </label>
        )}
      </div>

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((att) => {
            const Icon = getFileIcon(att.type);
            return (
              <div
                key={att.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/50 border border-gray-700/40 group"
              >
                {/* Thumbnail or icon */}
                {isImageType(att.type) ? (
                  <img
                    src={att.url}
                    alt={att.name}
                    className="w-8 h-8 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-gray-700/50 flex items-center justify-center flex-shrink-0">
                    <Icon size={16} className="text-gray-400" />
                  </div>
                )}

                {/* Name + size */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-300 truncate">{att.name}</p>
                  <p className="text-[10px] text-gray-600">{formatFileSize(att.size)}</p>
                </div>

                {/* Download */}
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 text-gray-500 hover:text-indigo-400 transition-colors"
                  title="Download"
                >
                  <Download size={14} />
                </a>

                {/* Delete */}
                <button
                  onClick={() => setDeleteTarget(att)}
                  className="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Attachment"
          message={`Remove "${deleteTarget.name}"? The file will be permanently deleted.`}
          danger={true}
          onConfirm={() => { handleDelete(deleteTarget); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
