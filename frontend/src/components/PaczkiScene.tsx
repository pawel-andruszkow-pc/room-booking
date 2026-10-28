import { scatter } from '@/lib/scatter';
import { Drift, Illustration, SceneFrame, Shade } from './SceneParts';

const SUGAR = scatter(22, 41, [0.15, 0.35], [12, 20]);
const SPRINKLES = scatter(14, 43, [0.4, 0.7], [10, 15]);
const SPRINKLE_COLORS = ['#ff5fa2', '#ffe14d', '#4dd8ff', '#9dff6b', '#ffffff'];

/**
 * Fat Thursday (Tłusty Czwartek) on a busy room: the illustration (a board of
 * pączki, glazed, sprinkled and dusted with sugar, one bitten into its rose
 * jam, with faworki and hot chocolate beside them) filling the screen with
 * icing sugar and sprinkles falling over it. Sits behind the content and never
 * takes a tap; transforms and opacity only, like HalloweenScene.
 */
export function PaczkiScene() {
  return (
    <SceneFrame>
      <Illustration name="paczki" position="object-[50%_40%]" />
      {/* Pink icing and sugar under white text. */}
      <Shade rgb="60, 22, 8" tint={0.3} />
      <Drift pieces={SUGAR}>
        {() => <div className="aspect-square w-full rounded-full bg-white/85" />}
      </Drift>
      <Drift pieces={SPRINKLES}>
        {(_, i) => (
          <div
            className="h-[0.3em] w-full animate-flip rounded-full"
            style={{
              backgroundColor: SPRINKLE_COLORS[i % SPRINKLE_COLORS.length],
              animationDuration: `${1.6 + (i % 4) * 0.4}s`,
            }}
          />
        )}
      </Drift>
    </SceneFrame>
  );
}
