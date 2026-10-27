import type { CSSProperties } from 'react';
import { motion } from 'motion/react';

/**
 * Night-time dressing for a busy room in Halloween week: a moon over a
 * graveyard, bats crossing it, a spider on its thread and a jack-o'-lantern on
 * the hill. Sits behind the content and never takes a tap.
 *
 * Everything moves on CSS transforms and opacity only (keyframes in
 * index.css), so the tablet composites it without repainting the page; the
 * global reduced-motion rule stills it.
 */
export function HalloweenScene() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9, ease: 'easeInOut' }}
    >
      {/* Moon, in the empty band between the room name and the clock. */}
      <div className="absolute left-[46%] top-[clamp(1.5rem,4vh,3rem)] size-[clamp(8rem,13vw,15rem)] -translate-x-1/2">
        <div className="absolute -inset-[60%] rounded-full bg-[radial-gradient(circle,rgba(255,214,140,0.22),transparent_62%)]" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_38%_35%,#fff6d8,#f6dc9a_55%,#e2b867)] shadow-[0_0_80px_rgba(255,210,130,0.35)]" />
        <div className="absolute left-[24%] top-[30%] size-[18%] rounded-full bg-[#d9b36a]/50" />
        <div className="absolute left-[56%] top-[52%] size-[12%] rounded-full bg-[#d9b36a]/45" />
        <div className="absolute left-[40%] top-[66%] size-[8%] rounded-full bg-[#d9b36a]/40" />
      </div>

      <Bat className="top-[9%] w-[clamp(3rem,4.5vw,5rem)]" duration={19} delay={-3} />
      <Bat className="top-[17%] w-[clamp(2.25rem,3.2vw,3.5rem)]" duration={25} delay={-14} />
      <Bat className="top-[26%] w-[clamp(1.75rem,2.4vw,2.75rem)]" duration={31} delay={-22} />

      <Spider />

      {/* Low fog drifting over the graves. */}
      <div className="absolute inset-x-[-10%] bottom-[8%] h-[22%] animate-fog bg-[radial-gradient(50%_60%_at_30%_70%,rgba(214,196,255,0.16),transparent_70%),radial-gradient(45%_55%_at_75%_80%,rgba(214,196,255,0.12),transparent_70%)]" />

      <Graveyard />
      <Tree />

      <JackOLantern />
    </motion.div>
  );
}

function Bat({
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

function Spider() {
  return (
    <div className="absolute left-[36%] top-0 flex animate-spider flex-col items-center">
      <div className="h-[clamp(5rem,12vh,9rem)] w-px bg-white/45" />
      <svg viewBox="0 0 40 36" className="-mt-1 w-[clamp(1.75rem,2.4vw,2.5rem)]">
        <g stroke="#120818" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M14 16 4 8M14 19 2 18M14 22 4 30M15 25 8 34" />
          <path d="M26 16l10-8M26 19l12-1M26 22l10 8M25 25l7 9" />
        </g>
        <ellipse cx="20" cy="20" rx="8" ry="9" fill="#120818" />
        <circle cx="20" cy="10" r="5" fill="#120818" />
        <circle cx="18" cy="9.5" r="1.1" fill="#ff7a1a" />
        <circle cx="22" cy="9.5" r="1.1" fill="#ff7a1a" />
      </svg>
    </div>
  );
}

/** Hills, headstones and a bare tree along the bottom edge. */
function Graveyard() {
  return (
    <svg
      viewBox="0 0 1600 220"
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-x-0 bottom-0 h-[clamp(9rem,22vh,15rem)] w-full fill-[#0f0716]"
    >
      <path d="M0 220V130q210-50 430-14t430-6q220-30 420 8t320-22v124Z" opacity="0.6" />
      <path d="M0 220V160q260-40 520-10t540-12q260-24 540 14v68Z" />
      {/* Headstones */}
      <path d="M180 170v-40a26 26 0 0 1 52 0v40Z" />
      <path d="M270 168v-28a18 18 0 0 1 36 0v28Z" />
      <path d="M1110 160v-44a30 30 0 0 1 60 0v44Z" />
      <path d="M1214 162h12v-38h22v-12h-22v-20h-12v20h-22v12h22Z" />
      <path d="M1290 164v-30a20 20 0 0 1 40 0v30Z" />
    </svg>
  );
}

/**
 * Bare tree on the right. Its own SVG: inside the graveyard's `slice` box the
 * crown would be cropped whenever the screen is wider than the hills.
 */
function Tree() {
  return (
    <svg viewBox="0 0 200 200" className="absolute bottom-0 right-[3%] h-[clamp(10rem,27vh,17rem)]">
      <g stroke="#0f0716" strokeLinecap="round" fill="none">
        <path d="M110 200c6-60 2-110-14-160" strokeWidth="18" />
        <path
          d="M100 105c-30-20-50-24-80-20M96 80c16-22 40-30 66-28M106 135c24-10 44-8 70 4M22 86c-10-14-14-26-12-40M160 54c10-10 22-14 36-12"
          strokeWidth="8"
        />
      </g>
    </svg>
  );
}

/** Pumpkin on the hill, its face lit from inside by a flickering candle. */
function JackOLantern() {
  return (
    <div className="absolute bottom-[clamp(1.5rem,4vh,3rem)] left-[60%] w-[clamp(5.5rem,8.5vw,9.5rem)]">
      <div className="absolute -inset-[70%] animate-candle rounded-full bg-[radial-gradient(circle,rgba(255,150,40,0.35),transparent_60%)]" />
      <svg viewBox="0 0 120 104" className="relative w-full">
        <path d="M58 22c0-8 2-15 8-20l6 4c-5 4-7 10-7 16Z" fill="#3f6212" />
        <ellipse cx="36" cy="62" rx="28" ry="36" fill="#c2410c" />
        <ellipse cx="84" cy="62" rx="28" ry="36" fill="#c2410c" />
        <ellipse cx="60" cy="62" rx="32" ry="40" fill="#f97316" />
        <path
          d="M60 24c-6 12-6 64 0 78M60 24c6 12 6 64 0 78"
          stroke="#ea580c"
          strokeWidth="2"
          fill="none"
        />
        <g className="animate-candle" fill="#ffd36b">
          <path d="M30 52l12-14 10 14Z" />
          <path d="M68 52l10-14 12 14Z" />
          <path d="M55 64l5-8 5 8Z" />
          <path d="M26 72q34 22 68 0l-6 4-6-6-7 8-7-7-7 7-7-8-6 6Z" />
        </g>
      </svg>
    </div>
  );
}
