import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { cn } from '../lib/utils';

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export default function Modal({ title, onClose, children, size = 'md' }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={cn(sizeClasses[size], 'gap-0 p-0 flex flex-col')}>
        {title && (
          <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
            <DialogTitle className="text-lg font-semibold text-foreground">{title}</DialogTitle>
          </DialogHeader>
        )}
        <div className="px-6 py-5 overflow-y-auto overscroll-contain flex-1 min-h-0">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
