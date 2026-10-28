import type { CSSProperties } from 'react';
import { scatter } from '@/lib/scatter';
import { Drift, Illustration, SceneFrame, Shade, Snowflake } from './SceneParts';

/** Its width over its height (1584 × 993). */
const RATIO = 1584 / 993;

/**
 * The picture's box, sized and placed the way `object-cover` with the position
 * 50% 25% places the image (container units of the frame), so the weather
 * drawn inside it stays on its side of the curtain at any screen size.
 */
const coverStyle: CSSProperties = {
  width: `max(100cqw, 100cqh * ${RATIO})`,
  height: `max(100cqh, 100cqw / ${RATIO})`,
  left: `calc((100cqw - max(100cqw, 100cqh * ${RATIO})) * 0.5)`,
  top: `calc((100cqh - max(100cqh, 100cqw / ${RATIO})) * 0.25)`,
};

/**
 * The winter side: the left 54% of the picture, cut along the curtain's left
 * edge (in percent of that strip), which leans in from the top, runs down past
 * the girl's hands and sweeps back left towards the bottom.
 */
const WINTER_CLIP =
  'polygon(0 0, 81.5% 0, 100% 10%, 96.3% 20%, 92.6% 27%, 92.6% 45%, 88.9% 55%, 83.3% 63%, 77.8% 75%, 74.1% 85%, 74.1% 100%, 0 100%)';

const SNOW = scatter(12, 19, [0.25, 0.55], [14, 22]);

/**
 * The first day of spring (21 March) on a busy room: the illustration (two
 * children peeling winter back like a curtain while a girl runs out into a
 * spring meadow with an armful of tulips) filling the screen, with snow still
 * falling on the winter side and the spring one left clear. Sits behind the
 * content and never takes a tap; transforms and opacity only, like
 * HalloweenScene.
 */
export function SpringScene() {
  return (
    <SceneFrame>
      <Illustration name="spring" position="object-[50%_25%]" />
      {/* Snow on the left and a sunny meadow under white text. */}
      <Shade rgb="15, 40, 60" tint={0.2} />
      <div className="absolute inset-0 [container-type:size]">
        <div className="absolute" style={coverStyle}>
          {/* Snow only behind the curtain, never past it. */}
          <div className="absolute inset-y-0 left-0 w-[54%]" style={{ clipPath: WINTER_CLIP }}>
            <Drift pieces={SNOW}>{() => <Snowflake />}</Drift>
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}
