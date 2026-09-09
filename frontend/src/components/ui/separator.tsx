import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef } from 'react';

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      className={cn(
        'shrink-0 bg-white/10',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}
