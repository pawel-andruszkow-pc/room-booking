import type { CSSProperties } from 'react';
import { scatter } from '@/lib/scatter';
import { Bat, Drift, SceneFrame } from './SceneParts';

/**
 * The illustration: a black cat on stone steps between jack-o'-lanterns and
 * candle lanterns, under a full moon over a lake, a village and a castle. A
 * WebP in public/seasons.
 */
const ILLUSTRATION = `${import.meta.env.BASE_URL}seasons/halloween.webp`;
/** Its width over its height (1584 × 993). */
const RATIO = 1584 / 993;
/** The cat's eyes in it, in percent of its width and height: centre, then a lid's size. */
const CAT_EYES = [
  { x: 23.96, y: 41.6, width: 2.2, height: 3.6 },
  { x: 26.89, y: 42.85, width: 2, height: 3.4 },
];
/** The cat's fur, which the lids are made of. */
const FUR = '#0b050a';

const LEAVES = scatter(12, 23, [0.7, 1.3], [16, 24]);
const LEAF_COLORS = ['#ff8a1f', '#e0561b', '#ffb347'];

/**
 * The picture's box, sized and placed the way `object-cover` with the
 * position 30% 20% would place the image (container units of the frame), so
 * whatever is drawn over the picture inside it stays on the spot it belongs
 * to at any screen size. Wider screens lose a strip off the bottom rather than
 * the moon; narrower ones keep the cat and lose some of the right edge.
 */
const coverStyle: CSSProperties = {
  width: `max(100cqw, 100cqh * ${RATIO})`,
  height: `max(100cqh, 100cqw / ${RATIO})`,
  left: `calc((100cqw - max(100cqw, 100cqh * ${RATIO})) * 0.3)`,
  top: `calc((100cqh - max(100cqh, 100cqw / ${RATIO})) * 0.2)`,
};

/**
 * Halloween week on a busy room: the illustration filling the screen with the
 * cat blinking now and then, bats flapping across the sky and autumn leaves
 * falling. Sits behind the content and never takes a tap.
 *
 * Everything moves on CSS transforms and opacity only (keyframes in
 * index.css), so the tablet composites it without repainting the page; the
 * global reduced-motion rule stills it.
 */
export function HalloweenScene() {
  return (
    <SceneFrame>
      <div className="absolute inset-0 [container-type:size]">
        <div className="absolute" style={coverStyle}>
          <img
            src={ILLUSTRATION}
            alt=""
            draggable={false}
            decoding="async"
            className="absolute inset-0 size-full"
          />
          {/* Lids of fur drop over the cat's eyes. */}
          {CAT_EYES.map((eye) => (
            <div
              key={eye.x}
              className="absolute origin-top -translate-1/2 animate-cat-blink rounded-full"
              style={{
                left: `${eye.x}%`,
                top: `${eye.y}%`,
                width: `${eye.width}%`,
                height: `${eye.height}%`,
                backgroundColor: FUR,
              }}
            />
          ))}
        </div>
      </div>

      <Bat className="top-[7%] w-[clamp(4.25rem,6.5vw,7rem)]" duration={20} delay={-4} />
      <Bat className="top-[15%] w-[clamp(3.25rem,4.5vw,5rem)]" duration={27} delay={-16} />
      <Bat className="top-[28%] w-[clamp(2.5rem,3.4vw,3.75rem)]" duration={33} delay={-25} />

      {/* The moon sits right behind the clock: dim the sky around the digits. */}
      <div className="absolute inset-0 bg-[radial-gradient(22%_20%_at_88%_15%,rgba(16,10,44,0.7),transparent)]" />
      {/* The leaves and the lit pumpkins under the footer are as bright as its
          labels: deepen them a little so they stay readable. */}
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-[#140b2e]/70 to-transparent" />
      <Drift pieces={LEAVES}>
        {(_, i) => (
          <div
            className="aspect-square w-full rounded-[0_70%_0_70%] opacity-85"
            style={{ backgroundColor: LEAF_COLORS[i % LEAF_COLORS.length] }}
          />
        )}
      </Drift>
    </SceneFrame>
  );
}
