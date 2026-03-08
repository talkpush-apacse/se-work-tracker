import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Strip HTML tags and collapse whitespace — used for plain-text previews
 * of RichTextEditor content throughout the app.
 * @param {string} html - Raw HTML string
 * @returns {string} Plain text
 */
export function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Convert HTML to clean, structured plain text — preserves paragraphs,
 * line breaks, lists, and headings. Used for clipboard copy operations
 * so pasted output reads like properly formatted text, not raw HTML or
 * URL-encoded gibberish (%0A%20 etc.).
 * @param {string} html - Raw HTML string (e.g. from Tiptap getHTML())
 * @returns {string} Clean plain text with natural line breaks
 */
export function htmlToPlainText(html) {
  if (!html) return '';
  // If it's already plain text (no HTML tags), return as-is
  if (!/<[a-z][\s\S]*>/i.test(html)) return html.trim();

  let text = html;
  // Remove style/script blocks
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Convert block-level elements to line breaks
  text = text.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');       // paragraph boundaries
  text = text.replace(/<br\s*\/?>/gi, '\n');                // explicit line breaks
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');              // after headings
  text = text.replace(/<h[1-6][^>]*>/gi, '');               // remove opening heading tags
  text = text.replace(/<\/li>\s*<li[^>]*>/gi, '\n');        // between list items
  text = text.replace(/<li[^>]*>/gi, '• ');                 // bullet for list items
  text = text.replace(/<\/ul>|<\/ol>/gi, '\n');             // after lists
  text = text.replace(/<hr[^>]*>/gi, '\n---\n');            // horizontal rules
  text = text.replace(/<\/div>/gi, '\n');                   // div boundaries
  text = text.replace(/<\/blockquote>/gi, '\n');            // blockquote end
  // Decode HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&ldquo;/gi, '\u201C');
  text = text.replace(/&rdquo;/gi, '\u201D');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Clean up whitespace — collapse spaces per line, trim blank lines
  text = text.split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n');
  // Collapse 3+ consecutive newlines to 2
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
