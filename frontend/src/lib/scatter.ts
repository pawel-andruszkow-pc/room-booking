/** One drifting piece: where it starts across the width, how big, how fast. */
export type Piece = {
  /** Percent of the screen width. */
  left: number;
  /** rem. */
  size: number;
  /** Seconds for one trip across the screen. */
  duration: number;
  /** Seconds into its trip on the first frame, so the screen starts full. */
  offset: number;
};

/**
 * `count` pieces spread evenly across the width with jitter from a fixed seed:
 * the same every render and every reload, no Math.random in render.
 */
export function scatter(
  count: number,
  seed: number,
  size: [number, number],
  duration: [number, number],
): Piece[] {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  return Array.from({ length: count }, (_, i) => {
    const d = duration[0] + rand() * (duration[1] - duration[0]);
    return {
      left: ((i + rand()) / count) * 100,
      size: size[0] + rand() * (size[1] - size[0]),
      duration: d,
      offset: rand() * d,
    };
  });
}
