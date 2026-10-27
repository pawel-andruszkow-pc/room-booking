import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { Piece } from '@/lib/scatter';

/**
 * Shared pieces of the seasonal scenes (see HalloweenScene for the rules they
 * all follow): a frame that fades in behind the content and never takes a tap,
 * and things drifting across it. Transforms and opacity only.
 */
export function SceneFrame({ children }: { children: ReactNode }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Pieces falling from the top (snow, petals, confetti) or, with `rise`, floating
 * up from the bottom (hearts, balloons), each swaying on its own clock.
 */
export function Drift({
  pieces,
  rise,
  className,
  children,
}: {
  pieces: Piece[];
  rise?: boolean;
  className?: string;
  children: (piece: Piece, index: number) => ReactNode;
}) {
  return pieces.map((p, i) => {
    const style = {
      left: `${p.left}%`,
      width: `${p.size}rem`,
      animationDuration: `${p.duration}s`,
      animationDelay: `${-p.offset}s`,
    } as CSSProperties;
    return (
      <div
        key={i}
        className={cn('absolute top-0', rise ? 'animate-rise' : 'animate-fall', className)}
        style={style}
      >
        <div
          className="animate-sway"
          style={{ animationDuration: `${3 + (i % 4)}s`, animationDelay: `${-i * 0.7}s` }}
        >
          {children(p, i)}
        </div>
      </div>
    );
  });
}

/** A plain snowflake: a soft white dot. */
export function Snowflake() {
  return <div className="aspect-square w-full rounded-full bg-white/80 blur-[1px]" />;
}

/** A heart, filled with `currentColor`. */
export function Heart({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 29" className={cn('w-full fill-current', className)}>
      <path d="M16 29 3.4 16.6A8.6 8.6 0 0 1 16 4.9a8.6 8.6 0 0 1 12.6 11.7Z" />
    </svg>
  );
}
