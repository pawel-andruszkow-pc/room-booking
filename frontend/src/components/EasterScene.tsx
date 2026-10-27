import { scatter } from '@/lib/scatter';
import { Drift, SceneFrame } from './SceneParts';

/**
 * The illustration: a laughing bunny hugging a painted egg on a spring meadow
 * with more eggs and daisies in the grass. A WebP in public/seasons.
 */
const ILLUSTRATION = `${import.meta.env.BASE_URL}seasons/easter.webp`;

const PETALS = scatter(12, 17, [0.5, 1], [18, 26]);
const PETAL_COLORS = ['#ffffff', '#ffd6dc', '#ffe58a'];

/**
 * Holy Week on a busy room: the illustration filling the screen with blossom
 * petals drifting down over it. Sits behind the content and never takes a
 * tap; transforms and opacity only, like HalloweenScene.
 */
export function EasterScene() {
  return (
    <SceneFrame>
      {/* Wider screens lose a strip off the bottom rather than the bunny's
          ears; narrower ones keep the bunny and lose some of the edges. */}
      <img
        src={ILLUSTRATION}
        alt=""
        draggable={false}
        decoding="async"
        className="absolute inset-0 size-full object-cover object-[40%_20%]"
      />
      {/* The egg and the daisies under the footer are as light as its
          labels: deepen the grass there so they stay readable. */}
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-[#1d5a2a]/70 to-transparent" />
      <Drift pieces={PETALS}>
        {(_, i) => (
          <div
            className="aspect-[3/4] w-full rounded-[60%_40%_60%_40%] opacity-80"
            style={{ backgroundColor: PETAL_COLORS[i % PETAL_COLORS.length] }}
          />
        )}
      </Drift>
    </SceneFrame>
  );
}
