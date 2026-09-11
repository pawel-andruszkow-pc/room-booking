import { useEffect, useState } from 'react';
import { Bug, ChevronDown, ChevronUp, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A wall tablet has nobody to press reload, so the page reloads itself
 * after this long. Long enough for someone standing there to read the
 * message and try the gentler "try again" first.
 */
const AUTO_RELOAD_S = 60;

interface ErrorPageProps {
  error: Error;
  /** Drops the error and re-renders the app in place, keeping its state. */
  onRetry: () => void;
}

/**
 * Shown by `ErrorBoundary` in place of the app. Deliberately router- and
 * store-free: it has to render when those are exactly what broke.
 *
 * Same shape as the room screen — one big word, a line under it, actions at
 * the bottom — so it reads as part of the app rather than a browser crash.
 * The technical details stay behind a button: a passer-by needs "reload",
 * only whoever maintains the tablet needs the stack.
 */
export function ErrorPage({ error, onRetry }: ErrorPageProps) {
  const [left, setLeft] = useState(AUTO_RELOAD_S);
  const [details, setDetails] = useState(false);

  // Someone reading the stack is fixing something; do not pull the page away.
  useEffect(() => {
    if (details) return;
    if (left <= 0) {
      window.location.reload();
      return;
    }
    const t = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left, details]);

  const message = error.message || 'Unknown error';

  return (
    <div className="relative flex h-full flex-col bg-ink px-16 py-10 text-white">
      {/* Soft amber glow behind the icon, so the dark page does not read as "off". */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[50vh] w-[50vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-attention/15 blur-3xl"
      />

      {/* The hero shrinks when the details open so the stack gets the room. */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center text-center">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-3xl bg-attention text-ink shadow-2xl shadow-attention/30 transition-all duration-300',
            details ? 'mb-4 h-16 w-16' : 'mb-8 h-24 w-24',
          )}
        >
          <Bug className={details ? 'h-9 w-9' : 'h-14 w-14'} strokeWidth={1.75} />
        </div>
        <h1
          className={cn(
            'shrink-0 font-extrabold leading-[0.95] tracking-tight',
            details ? 'text-5xl' : 'text-[clamp(4rem,7vw,6rem)]',
          )}
        >
          Oops
        </h1>
        {!details && (
          <p className="mt-5 max-w-2xl shrink-0 text-2xl text-white/70">
            Something went wrong on this screen. Reloading usually fixes it.
          </p>
        )}

        {details && (
          <div className="mt-6 flex min-h-0 w-full max-w-5xl flex-1 flex-col rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-left">
            <p className="shrink-0 break-words text-xl font-semibold text-attention">
              {error.name}: {message}
            </p>
            {error.stack && (
              <pre className="scroll-thin mt-3 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all font-mono text-sm leading-relaxed text-white/50">
                {error.stack}
              </pre>
            )}
            <p className="mt-3 shrink-0 text-sm text-white/30">Build {__APP_BUILD_ID__}</p>
          </div>
        )}
      </div>

      <footer className="relative mt-8 flex shrink-0 flex-wrap items-center gap-5">
        <Button size="lg" onClick={() => window.location.reload()}>
          <RefreshCw className="h-7 w-7" />
          Reload
        </Button>
        <Button size="lg" variant="secondary" onClick={onRetry}>
          <RotateCcw className="h-7 w-7" />
          Try again
        </Button>
        <Button
          size="md"
          variant="ghost"
          onClick={() => setDetails((d) => !d)}
          aria-expanded={details}
        >
          {details ? <ChevronUp className="h-6 w-6" /> : <ChevronDown className="h-6 w-6" />}
          {details ? 'Hide details' : 'Show details'}
        </Button>
        <p
          className={cn(
            'tabular ml-auto text-xl text-white/50 transition-opacity',
            details && 'opacity-0',
          )}
        >
          Reloading in {left}s
        </p>
      </footer>
    </div>
  );
}
