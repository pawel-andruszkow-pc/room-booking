import { scatter } from '@/lib/scatter';
import { Drift, Illustration, SceneFrame, Shade, Snowflake } from './SceneParts';

const SNOW = scatter(24, 11, [0.3, 0.8], [11, 18]);

/**
 * Christmas week on a busy room: the illustration (a living room lit by a
 * decorated tree with presents under it, gingerbread and cocoa on the table, a
 * cat asleep on the sofa and a snowy village outside the window) filling the
 * screen with snow falling over it. Sits behind the content and never takes a
 * tap; transforms and opacity only, like HalloweenScene.
 */
export function ChristmasScene() {
  return (
    <SceneFrame>
      {/* Wider screens lose a strip off the bottom rather than the star. */}
      <Illustration name="christmas" position="object-[50%_20%]" />
      {/* A warm, light wall right behind the headline. */}
      <Shade rgb="40, 18, 8" tint={0.3} />
      <Drift pieces={SNOW}>{() => <Snowflake />}</Drift>
    </SceneFrame>
  );
}
