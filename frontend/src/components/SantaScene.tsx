import { scatter } from '@/lib/scatter';
import { Drift, SceneFrame, Snowflake } from './SceneParts';

const SNOW = scatter(26, 7, [0.35, 0.85], [10, 17]);

/** Stars: [left %, top %, delay s]. */
const STARS: [number, number, number][] = [
  [8, 14, 0],
  [21, 6, -1.3],
  [31, 22, -0.6],
  [58, 9, -2.1],
  [67, 27, -0.9],
  [79, 12, -1.7],
  [90, 31, -0.3],
  [14, 34, -2.4],
];

/**
 * St Nicholas' Day (6 December) on a busy room: a winter night over snowy
 * rooftops, with Santa's sleigh crossing the moon. Sits behind the content and
 * never takes a tap; transforms and opacity only, like HalloweenScene.
 */
export function SantaScene() {
  return (
    <SceneFrame>
      {STARS.map(([left, top, delay]) => (
        <div
          key={`${left}-${top}`}
          className="absolute size-1.5 animate-twinkle rounded-full bg-white"
          style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }}
        />
      ))}

      {/* Moon, in the empty band between the room name and the clock. */}
      <div className="absolute left-[46%] top-[clamp(1.5rem,4vh,3rem)] size-[clamp(7rem,11vw,13rem)] -translate-x-1/2">
        <div className="absolute -inset-[60%] rounded-full bg-[radial-gradient(circle,rgba(200,220,255,0.2),transparent_62%)]" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_38%_35%,#ffffff,#e6ecf7_55%,#c3cee3)] shadow-[0_0_80px_rgba(190,210,255,0.35)]" />
      </div>

      <div className="absolute left-0 top-[12%] w-[clamp(14rem,22vw,24rem)] animate-sleigh">
        <div className="animate-bob">
          <Sleigh />
        </div>
      </div>

      <Drift pieces={SNOW}>{() => <Snowflake />}</Drift>

      <Rooftops />
    </SceneFrame>
  );
}

/** Santa in his sleigh, pulled by two reindeer — Rudolph in front. */
function Sleigh() {
  return (
    <svg viewBox="0 0 260 80" className="w-full">
      {/* Reins */}
      <path d="M58 32Q120 26 214 30" stroke="#e5d3a0" strokeWidth="1.2" fill="none" />
      <Reindeer x={160} y={46} />
      <Reindeer x={218} y={42} rudolph />
      {/* Sack of presents */}
      <ellipse cx="26" cy="36" rx="11" ry="13" fill="#7a4b2a" />
      {/* Santa */}
      <circle cx="50" cy="36" r="11" fill="#d42a2a" />
      <circle cx="50" cy="21" r="6.5" fill="#f6d2b5" />
      <path d="M44 22q6 12 12 0q-2 6-6 6t-6-6Z" fill="#fff" />
      <path d="M43 18 50 5l9 10Z" fill="#d42a2a" />
      <path d="M43 18h14" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="59" cy="15" r="2.6" fill="#fff" />
      {/* Sleigh */}
      <path d="M10 62 4 36h18l6 12h42l8-16h7l-5 30Z" fill="#c81e1e" />
      <path d="M8 48h70" stroke="#f5c542" strokeWidth="2" />
      <path
        d="M4 70h76q10 0 14-9"
        stroke="#e7cf86"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M20 62v8M66 62v8" stroke="#e7cf86" strokeWidth="2.5" />
    </svg>
  );
}

function Reindeer({ x, y, rudolph }: { x: number; y: number; rudolph?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g stroke="#6b4423" strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M19-17l-4-9m1.6 4-4.5-1M24-17l1-10m-.5 4.5 4.5-2.5" />
      </g>
      <g stroke="#8a5a33" strokeWidth="3" strokeLinecap="round">
        <path d="M-10 5-17 15M-4 6-6 17M8 5l8 9M12 4l10 6" />
      </g>
      <ellipse cx="0" cy="0" rx="16" ry="7" fill="#8a5a33" />
      <path d="M9-3l8-10 5 3-6 10Z" fill="#8a5a33" />
      <ellipse cx="22" cy="-14" rx="6.5" ry="4" fill="#8a5a33" />
      <path d="M-15-2l-5-3" stroke="#8a5a33" strokeWidth="3" strokeLinecap="round" />
      {rudolph ? (
        <>
          <circle
            cx="29"
            cy="-13"
            r="4"
            fill="#ff3b3b"
            opacity="0.35"
            className="animate-twinkle"
          />
          <circle cx="29" cy="-13" r="2" fill="#ff3b3b" />
        </>
      ) : (
        <circle cx="28.5" cy="-13" r="1.5" fill="#3b2412" />
      )}
    </g>
  );
}

/** Snow-capped houses with lit windows along the bottom edge. */
function Rooftops() {
  const house = '#0a1433';
  const snow = '#eef3fc';
  const light = '#ffd27a';
  return (
    <svg
      viewBox="0 0 1600 220"
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-x-0 bottom-0 h-[clamp(9rem,22vh,15rem)] w-full"
    >
      {/* Left house */}
      <rect x="226" y="86" width="26" height="44" fill={house} />
      <rect x="222" y="82" width="34" height="9" rx="4.5" fill={snow} />
      <path d="M60 140 180 80l120 60Z" fill={house} />
      <path d="M56 142 180 78l124 64-10 4L180 90 66 146Z" fill={snow} />
      <rect x="80" y="140" width="200" height="80" fill={house} />
      <rect x="110" y="160" width="34" height="30" fill={light} />
      <rect x="216" y="160" width="34" height="30" fill={light} />
      {/* Right house */}
      <rect x="1360" y="70" width="28" height="48" fill={house} />
      <rect x="1356" y="66" width="36" height="9" rx="4.5" fill={snow} />
      <path d="M1180 130 1310 60l130 70Z" fill={house} />
      <path d="M1176 132 1310 58l134 74-10 4-124-66-124 66Z" fill={snow} />
      <rect x="1200" y="130" width="220" height="90" fill={house} />
      <rect x="1236" y="152" width="36" height="32" fill={light} />
      <rect x="1350" y="152" width="36" height="32" fill={light} />
      {/* Small house at the edge */}
      <path d="M1450 160 1525 120l75 40Z" fill={house} />
      <path d="M1446 162 1525 118l79 44-8 4-71-38-71 38Z" fill={snow} />
      <rect x="1464" y="160" width="136" height="60" fill={house} />
      <rect x="1500" y="174" width="26" height="24" fill={light} />
      {/* Snow on the ground */}
      <path d="M0 220v-24q400-30 800-6t800-4v34Z" fill={snow} />
    </svg>
  );
}
