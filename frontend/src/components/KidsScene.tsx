import { scatter } from '@/lib/scatter';
import { Drift, Illustration, SceneFrame, Shade } from './SceneParts';

const BUBBLES = scatter(12, 37, [1.5, 3.5], [18, 28]);

/**
 * Children's Day (1 June) on a busy room: the illustration (children at play
 * in a sunny park, one bouncing on a space hopper, one throwing a paper plane,
 * one blowing bubbles) filling the screen with soap bubbles floating up over
 * it. Sits behind the content and never takes a tap; transforms and opacity
 * only, like HalloweenScene.
 */
export function KidsScene() {
  return (
    <SceneFrame>
      <Illustration name="kids" position="object-[50%_30%]" />
      {/* A bright sky and grass under white text. */}
      <Shade rgb="10, 35, 70" tint={0.2} />
      <Drift pieces={BUBBLES} rise>
        {() => (
          <div className="aspect-square w-full rounded-full border border-white/60 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.55),rgba(160,220,255,0.12)_45%,rgba(255,255,255,0.08))]" />
        )}
      </Drift>
    </SceneFrame>
  );
}
