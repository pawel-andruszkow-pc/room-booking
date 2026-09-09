import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-3 rounded-2xl font-semibold whitespace-nowrap select-none',
    'transition-[transform,background-color,opacity,box-shadow] duration-150 ease-out',
    'active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40',
    'disabled:pointer-events-none disabled:opacity-40',
  ],
  {
    variants: {
      variant: {
        /** Solid white — the single most important action on a coloured screen. */
        primary: 'bg-white text-ink shadow-lg shadow-black/10 hover:bg-white/90',
        /** Translucent — secondary actions on coloured screens. */
        secondary: 'bg-white/15 text-white backdrop-blur-sm hover:bg-white/25',
        outline: 'border-2 border-white/40 text-white hover:bg-white/10',
        ghost: 'text-white/80 hover:bg-white/10 hover:text-white',
        danger: 'bg-red-500 text-white shadow-lg shadow-red-900/30 hover:bg-red-400',
        success: 'bg-emerald-400 text-ink shadow-lg shadow-emerald-900/30 hover:bg-emerald-300',
        /** For dark neutral pages. */
        accent: 'bg-sky-400 text-ink hover:bg-sky-300',
      },
      size: {
        sm: 'h-11 px-4 text-base',
        md: 'h-14 px-6 text-lg',
        lg: 'h-[4.5rem] px-8 text-2xl',
        xl: 'h-24 px-12 text-3xl rounded-3xl',
        icon: 'h-14 w-14',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = 'button', ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
