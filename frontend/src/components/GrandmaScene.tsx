import { scatter } from '@/lib/scatter';
import { Drift, Heart, Illustration, SceneFrame, Shade } from './SceneParts';

const HEARTS = scatter(10, 31, [0.8, 1.6], [20, 30]);
const HEART_COLORS = ['text-[#e8475f]/60', 'text-[#ffc9b0]/70', 'text-white/45'];

/**
 * Grandma's and Grandpa's Days (21–22 January) on a busy room: the
 * illustration (grandparents with mugs under a tartan blanket in a sunny
 * living room, a cat on their laps and the dog asleep on the rug) filling the
 * screen with little hearts drifting down over it. Sits behind the content and
 * never takes a tap; transforms and opacity only, like HalloweenScene.
 */
export function GrandmaScene() {
  return (
    <SceneFrame>
      {/* Wider screens lose a strip off the bottom rather than their faces. */}
      <Illustration name="grandma" position="object-[40%_20%]" />
      {/* A warm, sunlit room under white text. */}
      <Shade rgb="70, 25, 10" />
      <Drift pieces={HEARTS}>
        {(_, i) => <Heart className={HEART_COLORS[i % HEART_COLORS.length]} />}
      </Drift>
    </SceneFrame>
  );
}
