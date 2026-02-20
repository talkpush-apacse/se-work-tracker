import { startOfWeek, endOfWeek, isWithinInterval, parseISO, format, subWeeks, startOfDay, endOfDay } from 'date-fns';

export function getThisWeekRange() {
  const now = new Date();
  return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
}

export function getLastWeekRange() {
  const now = new Date();
  const lastWeek = subWeeks(now, 1);
  return { start: startOfWeek(lastWeek, { weekStartsOn: 1 }), end: endOfWeek(lastWeek, { weekStartsOn: 1 }) };
}

export function isInRange(timestamp, start, end) {
  const d = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;
  return isWithinInterval(d, { start: startOfDay(start), end: endOfDay(end) });
}

export function filterPointsByRange(points, start, end) {
  return points.filter(p => isInRange(p.timestamp, start, end));
}

export function formatDate(ts) {
  if (!ts) return '—';
  return format(typeof ts === 'string' ? parseISO(ts) : ts, 'MMM d, yyyy');
}

export function formatDateTime(ts) {
  if (!ts) return '—';
  return format(typeof ts === 'string' ? parseISO(ts) : ts, 'MMM d, h:mm a');
}

export function formatRelative(ts) {
  if (!ts) return '—';
  const d = typeof ts === 'string' ? parseISO(ts) : ts;
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(ts);
}

export function getStreakDays(points) {
  if (!points.length) return 0;
  const days = [...new Set(points.map(p => format(parseISO(p.timestamp), 'yyyy-MM-dd')))].sort().reverse();
  let streak = 0;
  let current = format(new Date(), 'yyyy-MM-dd');
  for (const day of days) {
    if (day === current) { streak++; current = format(new Date(new Date(current).getTime() - 86400000), 'yyyy-MM-dd'); }
    else break;
  }
  return streak;
}
