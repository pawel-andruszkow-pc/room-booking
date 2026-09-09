import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'bg-white/15 text-white',
        success: 'bg-emerald-400/20 text-emerald-300',
        warning: 'bg-amber-400/20 text-amber-300',
        danger: 'bg-red-400/20 text-red-300',
        info: 'bg-sky-400/20 text-sky-300',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
