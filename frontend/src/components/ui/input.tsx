import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-14 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-lg text-white',
        'placeholder:text-white/35 transition-colors',
        'focus:border-sky-400 focus:bg-white/10 focus:outline-none focus:ring-4 focus:ring-sky-400/20',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
