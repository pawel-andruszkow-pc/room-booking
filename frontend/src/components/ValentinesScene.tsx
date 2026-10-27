import { useId, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { scatter } from '@/lib/scatter';
import { Drift, HEART_PATH, Heart, SceneFrame } from './SceneParts';

/** Faint hearts rising slowly through the air. */
const FAINT_HEARTS = scatter(14, 9, [2.5, 5.5], [26, 38]);

/**
 * Valentine's Day on a busy room: paper hearts swinging on their strings,
 * faint hearts rising on a gentle wave, and pink clouds along the bottom with
 * a red heart in each bank. Sits behind the content and never takes a tap;
 * transforms and opacity only, like HalloweenScene.
 */
export function ValentinesScene() {
  return (
    <SceneFrame>
      <Drift pieces={FAINT_HEARTS} rise>
        {() => <Heart className="text-white/10" />}
      </Drift>

      {/* In the empty band between the room name and the clock. */}
      <PaperHeart
        className="left-[44%] w-[clamp(7rem,15vw,18rem)]"
        string="clamp(3rem,10vh,7rem)"
        duration={4.2}
      />
      <PaperHeart
        className="left-[56.5%] w-[clamp(3.5rem,7.5vw,9rem)]"
        string="clamp(9rem,23vh,17rem)"
        duration={3.4}
        delay={-1.6}
      />

      <CloudsLeft />
      <CloudsRight />
    </SceneFrame>
  );
}

/**
 * A paper heart hanging from the top edge on a string, swinging from where the
 * string is tied. `className` places it (left, width); `string` is how far
 * below the top edge it hangs.
 */
function PaperHeart({
  className,
  string,
  duration,
  delay = 0,
}: {
  className: string;
  string: string;
  duration: number;
  delay?: number;
}) {
  const id = useId();
  const style = {
    animationDuration: `${duration}s`,
    animationDelay: `${delay}s`,
  } as CSSProperties;
  return (
    <div
      className={cn('absolute top-0 origin-top -translate-x-1/2 animate-swing', className)}
      style={style}
    >
      <div className="mx-auto w-px bg-white/55" style={{ height: string }} />
      {/* Pulled up so the string meets the dip between the lobes. */}
      <svg
        viewBox="0 0 32 29"
        className="-mt-[15%] w-full drop-shadow-[0_1.2rem_1.5rem_rgba(110,0,30,0.35)]"
      >
        <defs>
          {/* Lit from the upper left, like the room's own light. */}
          <radialGradient id={id} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffd8e2" />
            <stop offset="0.55" stopColor="#ff9fb8" />
            <stop offset="1" stopColor="#f2577d" />
          </radialGradient>
        </defs>
        <path d={HEART_PATH} fill={`url(#${id})`} />
      </svg>
    </div>
  );
}

type Puff = [cx: number, cy: number, r: number];

/**
 * One layer of cloud: overlapping puffs on a solid base, filled with a single
 * gradient across the whole layer (light at its top, deeper at the bottom) so
 * the puffs merge into one bank instead of reading as separate discs.
 */
function CloudLayer({
  puffs,
  base,
  width,
  height,
  colors,
  shadow,
}: {
  puffs: Puff[];
  /** Where the solid fill under the puffs starts. */
  base: number;
  width: number;
  height: number;
  colors: [top: string, bottom: string];
  /** Shade cast up onto the layer behind. */
  shadow?: boolean;
}) {
  const id = useId();
  const top = Math.min(...puffs.map(([, cy, r]) => cy - r));
  return (
    <g style={shadow ? { filter: 'drop-shadow(0 -0.4rem 0.8rem rgba(140,0,40,0.22))' } : undefined}>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={height}>
          <stop offset="0" stopColor={colors[0]} />
          <stop offset="1" stopColor={colors[1]} />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`}>
        {puffs.map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} />
        ))}
        <rect x={0} y={base} width={width} height={height - base} />
      </g>
    </g>
  );
}

const BACK: [string, string] = ['#f45f80', '#e43a63'];
const FRONT: [string, string] = ['#ffadc0', '#f76a8a'];

/** A red heart nestled in a cloud bank. */
function CloudHeart({ x, y, size }: { x: number; y: number; size: number }) {
  const id = useId();
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5a7c" />
          <stop offset="1" stopColor="#d3173f" />
        </linearGradient>
      </defs>
      <path
        d={HEART_PATH}
        transform={`translate(${x} ${y}) scale(${size / 32})`}
        fill={`url(#${id})`}
      />
    </>
  );
}

/** Low clouds under the buttons on the left. */
function CloudsLeft() {
  return (
    <svg
      viewBox="0 0 600 300"
      className="absolute bottom-0 left-0 w-[46%] overflow-visible"
      preserveAspectRatio="xMinYMax meet"
    >
      <CloudLayer
        width={600}
        height={300}
        base={220}
        colors={BACK}
        puffs={[
          [30, 150, 105],
          [170, 150, 80],
          [290, 180, 75],
          [410, 215, 70],
          [530, 255, 60],
          [650, 280, 60],
        ]}
      />
      <CloudHeart x={190} y={60} size={130} />
      <CloudLayer
        width={600}
        height={300}
        base={270}
        colors={FRONT}
        shadow
        puffs={[
          [-10, 245, 110],
          [140, 250, 80],
          [260, 270, 75],
          [380, 290, 70],
          [500, 305, 60],
          [620, 320, 60],
        ]}
      />
    </svg>
  );
}

/** A taller bank rising towards the right edge, behind Timer and Today. */
function CloudsRight() {
  return (
    <svg
      viewBox="0 0 800 500"
      className="absolute bottom-0 right-0 w-[56%] overflow-visible"
      preserveAspectRatio="xMaxYMax meet"
    >
      <CloudLayer
        width={800}
        height={500}
        base={400}
        colors={BACK}
        puffs={[
          [40, 410, 70],
          [170, 350, 85],
          [320, 310, 95],
          [480, 270, 100],
          [630, 225, 105],
          [790, 200, 105],
        ]}
      />
      <CloudHeart x={540} y={200} size={140} />
      <CloudLayer
        width={800}
        height={500}
        base={385}
        colors={FRONT}
        shadow
        puffs={[
          [-20, 440, 80],
          [110, 440, 85],
          [260, 420, 95],
          [420, 410, 95],
          [570, 395, 90],
          [720, 330, 105],
          [840, 290, 100],
        ]}
      />
    </svg>
  );
}
