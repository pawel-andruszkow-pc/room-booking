import { scatter } from '@/lib/scatter';
import { Drift, SceneFrame, Snowflake } from './SceneParts';

/**
 * The illustration: Santa flying past with a sack of presents, waving, over
 * snowy hills with fir trees and a cottage. A WebP in public/seasons.
 */
const ILLUSTRATION = `${import.meta.env.BASE_URL}seasons/santa.webp`;

const SNOW = scatter(18, 7, [0.25, 0.6], [14, 22]);

/**
 * St Nicholas' Day (6 December) on a busy room: the illustration filling the
 * screen with snow falling over it. Sits behind the content and never takes a
 * tap; transforms and opacity only, like HalloweenScene.
 */
export function SantaScene() {
  return (
    <SceneFrame>
      {/* Wider screens lose a strip off the bottom rather than Santa's hat;
          narrower ones keep him and lose some of the right edge. */}
      <img
        src={ILLUSTRATION}
        alt=""
        draggable={false}
        decoding="async"
        className="absolute inset-0 size-full object-cover object-[30%_20%]"
      />
      {/* The snow in the picture is near white, like the footer labels:
          deepen it under the footer so they stay readable. */}
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-[#b01c2c]/70 to-transparent" />
      <Drift pieces={SNOW}>{() => <Snowflake />}</Drift>
    </SceneFrame>
  );
}
