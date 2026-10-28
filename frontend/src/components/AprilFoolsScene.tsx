import { scatter } from '@/lib/scatter';
import { Drift, Illustration, SceneFrame, Shade } from './SceneParts';

const CONFETTI = scatter(24, 3, [0.5, 0.9], [9, 14]);
const CONFETTI_COLORS = ['#ffe14d', '#ff5fa2', '#4dd8ff', '#9dff6b', '#ff8a3d', '#c48bff'];

/**
 * April Fools' Day on a busy room: the illustration (a team laughing round
 * their laptops in a dark office at night, a little robot waving among them
 * and a cat asleep on the desk) filling the screen with confetti tumbling down
 * over it. Sits behind the content and never takes a tap; transforms and
 * opacity only, like HalloweenScene.
 */
export function AprilFoolsScene() {
  return (
    <SceneFrame>
      <Illustration name="april-fools" position="object-[50%_30%]" />
      {/* A dark picture already, but busy under the text: shade it there. */}
      <Shade rgb="10, 20, 18" tint={0} />
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
