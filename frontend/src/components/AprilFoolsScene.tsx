import { scatter } from '@/lib/scatter';
import { Drift, SceneFrame } from './SceneParts';

/**
 * The illustration: an office after a round of pranks, with a rubber chicken
 * behind the monitor, a jester's hat by a spilt mug, confetti everywhere and
 * "April Fools!" scrawled on the glass. A WebP in public/seasons.
 */
const ILLUSTRATION = `${import.meta.env.BASE_URL}seasons/april-fools.webp`;

const CONFETTI = scatter(24, 3, [0.5, 0.9], [9, 14]);
const CONFETTI_COLORS = ['#ffe14d', '#ff5fa2', '#4dd8ff', '#9dff6b', '#ff8a3d', '#c48bff'];

/**
 * April Fools' Day on a busy room: the illustration filling the screen with
 * confetti tumbling down over it. Sits behind the content and never takes a
 * tap; transforms and opacity only, like HalloweenScene.
 */
export function AprilFoolsScene() {
  return (
    <SceneFrame>
      <img
        src={ILLUSTRATION}
        alt=""
        draggable={false}
        decoding="async"
        className="absolute inset-0 size-full object-cover object-[50%_30%]"
      />
      {/* A sunny, busy picture under white text: dim it all a little, and more
          behind the headline on the left, the footer along the bottom and the
          clock, which sits right on the "April Fools!" scrawled on the glass. */}
      <div className="absolute inset-0 bg-[#1a0f2e]/35" />
      <div className="absolute inset-0 bg-[radial-gradient(55%_50%_at_18%_52%,rgba(26,15,46,0.55),transparent),radial-gradient(26%_24%_at_87%_15%,rgba(26,15,46,0.8),transparent)]" />
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-[#1a0f2e]/70 to-transparent" />
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
    </SceneFrame>
  );
}
