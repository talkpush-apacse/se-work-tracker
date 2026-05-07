import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from '../lib/utils';

export default function DeleteTransferDialog({
  title,
  message,
  onDelete,
  onTransfer,
  onCancel,
  transferLabel,
  transferPlaceholder,
  transferOptions = [],
  summaryLines = [],
  deleteLabel = 'Delete Only',
  transferActionLabel = 'Transfer and Delete',
}) {
  const [targetId, setTargetId] = useState('');

  useEffect(() => {
    setTargetId(transferOptions[0]?.value || '');
  }, [transferOptions]);

  const canTransfer = !!targetId && typeof onTransfer === 'function';

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {message && (
            <AlertDialogDescription>{message}</AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {summaryLines.length > 0 && (
          <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Linked Data
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {summaryLines.map((line) => (
                <span
                  key={line}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground"
                >
                  {line}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Transfer before delete</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose another record to keep the linked data, then remove this one.
            </p>
          </div>

          {transferOptions.length > 0 ? (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {transferLabel}
              </label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder={transferPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {transferOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No alternate records are available for transfer.
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          {transferOptions.length > 0 && (
            <AlertDialogAction
              onClick={() => onTransfer(targetId)}
              disabled={!canTransfer}
              className={cn(
                'bg-secondary text-foreground hover:bg-secondary/80',
                !canTransfer && 'pointer-events-none opacity-50',
              )}
            >
              {transferActionLabel}
            </AlertDialogAction>
          )}
          <AlertDialogAction
            onClick={onDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
