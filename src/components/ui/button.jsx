import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75',
        cta:         'bg-accent text-foreground hover:bg-accent/80 active:bg-accent/60',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80',
        outline:     'border border-border bg-card hover:bg-secondary text-foreground active:bg-secondary/80',
        secondary:   'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/60',
        ghost:       'hover:bg-secondary text-muted-foreground hover:text-foreground active:bg-secondary/60',
        link:        'border border-accent text-accent-foreground hover:bg-accent/10 active:bg-accent/20',
        accent:      'bg-accent text-accent-foreground hover:bg-accent/80 active:bg-accent/60',
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
