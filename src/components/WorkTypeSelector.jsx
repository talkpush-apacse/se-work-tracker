import { Brain, Users, MessageSquare, ClipboardList } from 'lucide-react';
import { WORK_TYPES, WORK_TYPE_LABELS, WORK_TYPE_COLORS } from '../constants';

const ICONS = {
  deep_work: Brain,
  meetings:  Users,
  comms:     MessageSquare,
  admin:     ClipboardList,
};

export default function WorkTypeSelector({ value, onChange, size = 'md' }) {
  const isSmall = size === 'sm';

  return (
    <div className="grid grid-cols-4 gap-2">
      {WORK_TYPES.map(wt => {
        const Icon = ICONS[wt];
        const colors = WORK_TYPE_COLORS[wt];
        const selected = value === wt;

        return (
          <button
            key={wt}
            type="button"
            onClick={() => onChange(wt)}
            className={`
              flex flex-col items-center gap-1 rounded-xl border transition-all
              ${isSmall ? 'px-2 py-2' : 'px-3 py-3'}
              ${selected
                ? `${colors.bg} ${colors.border} ${colors.text} ring-1 ring-current/30`
                : 'border-border bg-card text-muted-foreground hover:border-border/80 hover:bg-muted/30'
              }
            `}
          >
            <Icon className={isSmall ? 'w-4 h-4' : 'w-5 h-5'} />
            <span className={`font-medium leading-tight text-center ${isSmall ? 'text-[10px]' : 'text-xs'}`}>
              {WORK_TYPE_LABELS[wt]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
