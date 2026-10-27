import { scatter } from '@/lib/scatter';
import { Drift, SceneFrame, Snowflake } from './SceneParts';

const SNOW = scatter(24, 11, [0.3, 0.8], [11, 18]);

const BULB_COLORS = ['#ff4d4d', '#ffd25e', '#7dff9b', '#5ec8ff'];
const BULBS = 15;
/** How far the light string sags in the middle, in rem. */
const SAG = 2.25;

/**
 * Christmas week on a busy room: a string of lights along the top, a decorated
 * tree with presents, and snow. Sits behind the content and never takes a tap;
 * transforms and opacity only, like HalloweenScene.
 */
export function ChristmasScene() {
  return (
    <SceneFrame>
      <Lights />
      <Drift pieces={SNOW}>{() => <Snowflake />}</Drift>
      {/* Snow on the ground */}
      <svg
        viewBox="0 0 1600 220"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-x-0 bottom-0 h-[clamp(5rem,12vh,8rem)] w-full fill-[#eef3fc]/90"
      >
        <path d="M0 220V150q400-60 800-12t800-18v100Z" />
      </svg>
      <Tree />
    </SceneFrame>
  );
}

/**
 * Lights on a wire hanging across the top. The wire is a quadratic curve, so a
 * bulb at `p` (0…1 across) hangs at 4·SAG·p(1−p) below the corners.
 */
function Lights() {
  return (
    <div className="absolute inset-x-0 top-0">
      <svg
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-0 w-full"
        style={{ height: `${SAG}rem` }}
      >
        <path
          d="M0 0Q50 20 100 0"
          stroke="#0b2a1e"
          strokeWidth="2"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {Array.from({ length: BULBS }, (_, i) => {
        const p = (i + 0.5) / BULBS;
        const color = BULB_COLORS[i % BULB_COLORS.length];
        return (
          <div
            key={i}
            className="absolute flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${p * 100}%`, top: `${4 * SAG * p * (1 - p) - 0.1}rem` }}
          >
            <div className="h-2 w-2.5 rounded-sm bg-[#334]" />
            <div
              className="h-[clamp(1rem,1.6vw,1.6rem)] w-[clamp(0.7rem,1.1vw,1.1rem)] animate-twinkle rounded-[50%_50%_45%_45%/40%_40%_60%_60%]"
              style={{
                backgroundColor: color,
                boxShadow: `0 0 14px 4px ${color}88`,
                animationDelay: `${-(i % 3) * 0.6 - (i % 2) * 0.35}s`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Ornaments: [cx, cy, color, twinkles]. */
const ORNAMENTS: [number, number, string, boolean][] = [
  [196, 82, '#ff4d4d', true],
  [226, 104, '#ffd25e', false],
  [178, 130, '#5ec8ff', true],
  [244, 148, '#ff4d4d', false],
  [208, 160, '#ffd25e', true],
  [160, 196, '#ff4d4d', false],
  [262, 208, '#5ec8ff', true],
  [214, 214, '#ffd25e', false],
];

/** Decorated tree on the right, with presents beside it and a star on top. */
function Tree() {
  return (
    <svg viewBox="0 0 320 260" className="absolute bottom-0 right-[3%] h-[clamp(12rem,32vh,20rem)]">
      {/* Presents */}
      <rect x="10" y="212" width="52" height="44" rx="3" fill="#d42a2a" />
      <path d="M36 212v44M10 232h52" stroke="#ffd25e" strokeWidth="6" />
      <path d="M36 212q-14-16-18-2q6 4 18 2q14-16 18-2q-6 4-18 2" fill="#ffd25e" />
      <rect x="70" y="228" width="40" height="28" rx="3" fill="#2f6fd6" />
      <path d="M90 228v28" stroke="#fff" strokeWidth="5" />
      {/* Tree */}
      <rect x="198" y="232" width="24" height="26" fill="#5b3a1e" />
      <path d="M210 32 150 110h30l-40 60h35l-45 66h160l-45-66h35l-40-60h30Z" fill="#1f7a4a" />
      <path
        d="M168 134q42 20 82-4M164 192q48 24 94-6"
        stroke="#ffd25e"
        strokeWidth="2.5"
        fill="none"
      />
      {ORNAMENTS.map(([cx, cy, fill, twinkles]) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r="6.5"
          fill={fill}
          className={twinkles ? 'animate-twinkle' : undefined}
          style={twinkles ? { animationDelay: `${-(cx % 7) * 0.3}s` } : undefined}
        />
      ))}
      {/* Star */}
      <circle cx="210" cy="24" r="22" fill="#ffd25e" opacity="0.3" className="animate-twinkle" />
      <path
        d="M210 6l4.7 9.5 10.5 1.5-7.6 7.4 1.8 10.4-9.4-4.9-9.4 4.9 1.8-10.4-7.6-7.4 10.5-1.5Z"
        fill="#ffd25e"
      />
    </svg>
  );
}
