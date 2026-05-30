/**
 * StatCard — reusable metric tile used in Dashboard and PomosView.
 * Extracted here to avoid a circular import (Dashboard ↔ PomosView).
 */
const COLORS = {
  indigo:  'text-brand-lavender bg-brand-lavender/10',
  violet:  'text-purple-700 bg-purple-50',
  amber:   'text-brand-amber bg-amber-500/10',
  emerald: 'text-brand-sage bg-brand-sage/10',
  rose:    'text-red-700 bg-red-50',
};

function looksNumeric(v) {
  if (typeof v === 'number') return true;
  return /^[\d\-—+]/.test(String(v));
}

export function StatCard({ icon: Icon, label, value, sub, color = 'indigo' }) {
  const cls = COLORS[color] || COLORS.indigo;
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className={`inline-flex p-2 rounded-xl mb-3 ${cls}`}>
        <Icon size={18} className={cls.split(' ')[0]} />
      </div>
      <p className={`text-2xl font-bold text-foreground ${looksNumeric(value) ? 'font-mono' : 'font-sans'}`}>{value}</p>
      <p className="text-sm font-sans text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
