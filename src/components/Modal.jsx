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
      <DialogContent className={cn(sizeClasses[size], 'gap-0 p-0')}>
        {title && (
          <DialogHeader className="px-6 py-4 border-b border-border">
            <DialogTitle className="text-lg font-semibold text-foreground">{title}</DialogTitle>
          </DialogHeader>
        )}
        <div className="px-6 py-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
