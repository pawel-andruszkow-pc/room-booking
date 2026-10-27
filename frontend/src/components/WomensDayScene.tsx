import { scatter } from '@/lib/scatter';
import { Drift, Heart, SceneFrame } from './SceneParts';

/**
 * The illustration: a woman in profile with flowers in her long hair, more
 * flowers along the bottom and up the right edge. A WebP of the source PNG
 * next to it in public/seasons (1.7 MB → 80 KB).
 */
const ILLUSTRATION = `${import.meta.env.BASE_URL}seasons/womens-day.webp`;

const PETALS = scatter(12, 13, [0.7, 1.4], [18, 26]);
const PETAL_COLORS = ['#e8475f', '#f6a3ad', '#fcd3d3'];

/**
 * Women's Day (8 March) on a busy room: the illustration filling the screen,
 * her hair behind the "Busy" headline, with petals and little hearts drifting
 * down over it. Sits behind the content and never takes a tap; transforms and
 * opacity only, like HalloweenScene.
 */
export function WomensDayScene() {
  return (
    <SceneFrame>
      {/* Wider screens lose a strip off the bottom rather than the flowers in
          her hair; narrower ones keep her and lose some of the right edge. */}
      <img
        src={ILLUSTRATION}
        alt=""
        draggable={false}
        decoding="async"
        className="absolute inset-0 size-full object-cover object-[30%_20%]"
      />
      <Drift pieces={PETALS}>
        {(_, i) =>
          i % 3 === 2 ? (
            <Heart className="text-[#e8475f]/70" />
          ) : (
            <div
              className="aspect-[3/4] w-full rounded-[60%_40%_60%_40%] opacity-80"
              style={{ backgroundColor: PETAL_COLORS[i % PETAL_COLORS.length] }}
            />
          )
        }
      </Drift>
    </SceneFrame>
  );
}
