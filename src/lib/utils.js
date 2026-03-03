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
