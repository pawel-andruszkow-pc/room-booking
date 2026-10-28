import { scatter } from '@/lib/scatter';
import { Drift, Heart, Illustration, SceneFrame, Shade } from './SceneParts';

/** Hearts rising slowly through the air. */
const HEARTS = scatter(14, 9, [1.2, 2.8], [22, 32]);
const HEART_COLORS = ['text-white/35', 'text-[#ff9fb8]/60', 'text-[#f2577d]/50'];

/**
 * Valentine's Day on a busy room: the illustration (an office decked with
 * hearts, one colleague handing a paper heart across the desk to another)
 * filling the screen with hearts rising over it. Sits behind the content and
 * never takes a tap; transforms and opacity only, like HalloweenScene.
 */
export function ValentinesScene() {
  return (
    <SceneFrame>
      <Illustration name="valentines" position="object-[50%_30%]" />
      {/* A bright office under white text. */}
      <Shade rgb="90, 5, 30" />
      <Drift pieces={HEARTS} rise>
        {(_, i) => <Heart className={HEART_COLORS[i % HEART_COLORS.length]} />}
      </Drift>
    </SceneFrame>
  );
}
