import { scatter } from '@/lib/scatter';
import { Drift, Illustration, SceneFrame, Shade, Snowflake } from './SceneParts';

const SNOW = scatter(18, 7, [0.25, 0.6], [14, 22]);

/**
 * St Nicholas' Day (6 December) on a busy room: the illustration (Santa
 * laughing over a sack of presents with two children cheering at his sides, a
 * Christmas tree and a reindeer in the snow) filling the screen with snow
 * falling over it. Sits behind the content and never takes a tap; transforms
 * and opacity only, like HalloweenScene.
 */
export function SantaScene() {
  return (
    <SceneFrame>
      {/* Wider screens lose a strip off the bottom rather than Santa's hat. */}
      <Illustration name="santa" position="object-[50%_20%]" />
      {/* A pale winter sky under white text. */}
      <Shade rgb="90, 5, 20" />
      <Drift pieces={SNOW}>{() => <Snowflake />}</Drift>
    </SceneFrame>
  );
}
