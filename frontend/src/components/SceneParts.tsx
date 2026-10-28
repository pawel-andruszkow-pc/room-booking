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
 * A season's illustration (a WebP in public/seasons) filling the screen like
 * `object-cover`; `position` is the `object-position` class that says which
 * part of it survives the crop.
 */
export function Illustration({ name, position }: { name: string; position: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}seasons/${name}.webp`}
      alt=""
      draggable={false}
      decoding="async"
      className={cn('absolute inset-0 size-full object-cover', position)}
    />
  );
}

/**
 * Keeps the white text readable over a bright illustration: a `tint` over the
 * whole picture, deeper shade behind the headline, the countdown and the
 * clock, and a gradient under the footer, all in one colour (`rgb`, as
 * "r, g, b") picked from the picture's own shadows.
 */
export function Shade({ rgb, tint = 0.25 }: { rgb: string; tint?: number }) {
  const shade = (alpha: number) => `rgba(${rgb}, ${alpha})`;
  return (
    <div
      className="absolute inset-0"
      style={{
        background: [
          `radial-gradient(50% 45% at 18% 52%, ${shade(0.5)}, transparent)`,
          `radial-gradient(28% 32% at 66% 50%, ${shade(0.45)}, transparent)`,
          `radial-gradient(22% 22% at 88% 12%, ${shade(0.55)}, transparent)`,
          `linear-gradient(to top, ${shade(0.7)}, transparent 30%)`,
          shade(tint),
        ].join(', '),
      }}
    />
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

/** A heart in a 32×29 box: the dip between the lobes at (16, 4.9), the point at (16, 29). */
const HEART_PATH = 'M16 29 3.4 16.6A8.6 8.6 0 0 1 16 4.9a8.6 8.6 0 0 1 12.6 11.7Z';

/** A heart, filled with `currentColor`. */
export function Heart({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 29" className={cn('w-full fill-current', className)}>
      <path d={HEART_PATH} />
    </svg>
  );
}

/**
 * A bat flapping across the screen from left to right; `className` sets its
 * height (top) and size (width).
 */
export function Bat({
  className,
  duration,
  delay,
}: {
  className: string;
  duration: number;
  delay: number;
}) {
  const style = { animationDuration: `${duration}s`, animationDelay: `${delay}s` } as CSSProperties;
  return (
    <div className={`absolute left-0 animate-bat-fly ${className}`} style={style}>
      <svg viewBox="0 0 64 32" className="w-full fill-[#120818]">
        <g className="origin-center animate-bat-flap [transform-box:fill-box]">
          <path d="M31 15C25 6 13 4 2 9c6 2 8 6 7 10 4-3 8-2 10 2 3-4 8-4 11-2Z" />
          <path d="M33 15c6-9 18-11 29-6-6 2-8 6-7 10-4-3-8-2-10 2-3-4-8-4-11-2Z" />
        </g>
        <ellipse cx="32" cy="17" rx="4" ry="6" />
        <path d="M29 12l1-4 2 3 2-3 1 4Z" />
      </svg>
    </div>
  );
}
