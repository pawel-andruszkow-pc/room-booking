import { scatter } from '@/lib/scatter';
import { Drift, SceneFrame } from './SceneParts';

const CONFETTI = scatter(30, 3, [0.5, 0.9], [7, 12]);
const CONFETTI_COLORS = ['#ffe14d', '#ff5fa2', '#4dd8ff', '#9dff6b', '#ff8a3d', '#c48bff'];

/**
 * April Fools' Day on a busy room: confetti, and a googly-eyed blob peeking up
 * from the bottom edge to look around. Sits behind the content and never takes
 * a tap; transforms and opacity only, like HalloweenScene.
 */
export function AprilFoolsScene() {
  return (
    <SceneFrame>
      <Drift pieces={CONFETTI}>
        {(_, i) => (
          <div
            className="h-[0.45em] w-full animate-flip rounded-[2px]"
            style={{
              backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animationDuration: `${1.4 + (i % 5) * 0.3}s`,
            }}
          />
        )}
      </Drift>
      <Peeker />
    </SceneFrame>
  );
}

/** A round blob with googly eyes, popping up from the bottom now and then. */
function Peeker() {
  return (
    <div className="absolute bottom-0 left-[60%] w-[clamp(9rem,14vw,15rem)] translate-y-[45%] animate-peek">
      <svg viewBox="0 0 160 120" className="w-full">
        <ellipse cx="80" cy="90" rx="78" ry="80" fill="#ff5fa2" />
        <ellipse cx="80" cy="90" rx="78" ry="80" fill="url(#fool-shine)" />
        <defs>
          <radialGradient id="fool-shine" cx="0.35" cy="0.2" r="0.6">
            <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <Eye cx={54} />
        <Eye cx={106} />
      </svg>
    </div>
  );
}

function Eye({ cx }: { cx: number }) {
  return (
    <g>
      <circle cx={cx} cy="46" r="22" fill="#fff" stroke="#2b1240" strokeWidth="3" />
      <g className="animate-look">
        <circle cx={cx} cy="50" r="10" fill="#2b1240" />
        <circle cx={cx - 3} cy="46" r="3" fill="#fff" />
      </g>
    </g>
  );
}
