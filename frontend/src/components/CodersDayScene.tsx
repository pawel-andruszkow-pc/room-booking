import { scatter } from '@/lib/scatter';
import { Drift, Illustration, SceneFrame, Shade } from './SceneParts';

const GLYPHS = scatter(18, 53, [1, 1.8], [16, 26]);
const GLYPH_TEXT = ['0', '1', '</>', '{ }', '0', '1', ';'];
const GLYPH_COLORS = ['text-[#9dffb0]/55', 'text-[#c48bff]/55', 'text-white/40'];

/**
 * Programmers' Day (the 256th day of the year) on a busy room: the
 * illustration (a desk at dusk with code on the monitor, a mug of coffee, a
 * doughnut and a ginger cat asleep by the laptop) filling the screen with bits
 * of code drifting down over it. Sits behind the content and never takes a
 * tap; transforms and opacity only, like HalloweenScene.
 */
export function CodersDayScene() {
  return (
    <SceneFrame>
      <Illustration name="coders-day" position="object-[50%_30%]" />
      {/* A sunset and a light desk under white text. */}
      <Shade rgb="20, 13, 46" />
      <Drift pieces={GLYPHS}>
        {(p, i) => (
          <span
            className={`block text-center whitespace-nowrap font-mono font-bold ${GLYPH_COLORS[i % GLYPH_COLORS.length]}`}
            style={{ fontSize: `${p.size}rem` }}
          >
            {GLYPH_TEXT[i % GLYPH_TEXT.length]}
          </span>
        )}
      </Drift>
    </SceneFrame>
  );
}
