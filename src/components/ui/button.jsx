import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75 shadow-sm',
        cta:         'bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75 shadow-sm',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80',
        outline:     'border border-border bg-card hover:bg-card-hover text-foreground active:bg-card-hover/80',
        secondary:   'bg-card border border-border text-foreground hover:bg-card-hover active:bg-card-hover/80',
        ghost:       'hover:bg-card-hover text-foreground active:bg-card-hover/80',
        link:        'border border-primary/30 text-primary hover:bg-primary/10 active:bg-primary/20',
        accent:      'bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75 shadow-sm',
        sage:        'bg-brand-sage text-foreground hover:bg-brand-sage/80 active:bg-brand-sage/60',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm:      'h-8 px-3 text-xs',
        lg:      'h-12 px-6 text-base',
        icon:    'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
