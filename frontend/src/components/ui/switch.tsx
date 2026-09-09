import * as SwitchPrimitive from '@radix-ui/react-switch';
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from 'react';
import { cn } from '@/lib/utils';

export const Switch = forwardRef<
  ComponentRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'relative inline-flex h-10 w-[4.5rem] shrink-0 cursor-pointer items-center rounded-full',
      'border-2 border-transparent bg-white/20 transition-colors duration-200',
      'data-[state=checked]:bg-emerald-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'block h-8 w-8 rounded-full bg-white shadow-md transition-transform duration-200 ease-out',
        'data-[state=checked]:translate-x-[2.1rem] data-[state=unchecked]:translate-x-0.5',
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';
