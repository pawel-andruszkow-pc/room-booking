import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Clock } from '@/components/Clock';
import { cn } from '@/lib/utils';

interface PageShellProps {
  title: string;
  subtitle?: string;
  /** Where the back button goes (defaults to the room screen). */
  backTo?: string;
  actions?: ReactNode;
  timezone?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Layout for every page except the room screen: sticky header with a large
 * back button, always-visible clock, and a scrollable content column. Pages
 * replace modals in this app — a wall tablet is easier to use with full
 * screens than with stacked dialogs.
 */
export function PageShell({
  title,
  subtitle,
  backTo = '/',
  actions,
  timezone = 'Europe/Warsaw',
  children,
  className,
}: PageShellProps) {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col bg-ink">
      <header className="flex shrink-0 items-center gap-6 border-b border-white/10 px-12 py-6">
        <Button
          variant="secondary"
          size="icon"
          className="h-16 w-16 rounded-2xl"
          onClick={() => navigate(backTo)}
          aria-label="Back"
        >
          <ArrowLeft className="h-8 w-8" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-4xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 truncate text-lg text-white/60">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
        <Clock
          timezone={timezone}
          size="sm"
          showDate={false}
          className="ml-4 shrink-0 text-white/80"
        />
      </header>
      <main className={cn('scroll-thin min-h-0 flex-1 overflow-y-auto px-12 py-10', className)}>
        {/* A flex column so a page can claim the leftover height with flex-1
            and distribute it; pages that do not stay their natural height. */}
        <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col">{children}</div>
      </main>
    </div>
  );
}
