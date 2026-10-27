import type { CSSProperties } from 'react';
import { scatter } from '@/lib/scatter';
import { Drift, SceneFrame } from './SceneParts';

const PETALS = scatter(18, 13, [0.6, 1.1], [12, 19]);
const PETAL_COLORS = ['#ffb3d1', '#ff7aa8', '#f5d0ff'];

/** Tulips: [left %, height (vh), bloom color, sway delay s]. */
const TULIPS: [number, number, string, number][] = [
  [2, 20, '#ff4f7b', 0],
  [6, 25, '#ffd23f', -1.1],
  [10, 18, '#c86bff', -0.4],
  [14, 23, '#ff4f7b', -2],
  [18, 17, '#ff8fb3', -1.5],
  [80, 18, '#ff8fb3', -0.8],
  [84, 24, '#ffd23f', -1.9],
  [88, 19, '#ff4f7b', -0.2],
  [92, 26, '#c86bff', -1.3],
  [96, 20, '#ff4f7b', -2.4],
];

/**
 * Women's Day (8 March) on a busy room: tulips swaying in both corners and
 * petals drifting down. Sits behind the content and never takes a tap;
 * transforms and opacity only, like HalloweenScene.
 */
export function WomensDayScene() {
  return (
    <SceneFrame>
      <Drift pieces={PETALS}>
        {(_, i) => (
          <div
            className="aspect-[3/4] w-full rounded-[60%_40%_60%_40%] opacity-80"
            style={{ backgroundColor: PETAL_COLORS[i % PETAL_COLORS.length] }}
          />
        )}
      </Drift>
      {TULIPS.map(([left, height, color, delay]) => (
        <Tulip key={left} left={left} height={height} color={color} delay={delay} />
      ))}
    </SceneFrame>
  );
}

function Tulip({
  left,
  height,
  color,
  delay,
}: {
  left: number;
  height: number;
  color: string;
  delay: number;
}) {
  const style = {
    left: `${left}%`,
    height: `${height}vh`,
    animationDelay: `${delay}s`,
  } as CSSProperties;
  return (
    <svg
      viewBox="0 0 40 120"
      preserveAspectRatio="xMidYMax meet"
      className="absolute bottom-0 origin-bottom -translate-x-1/2 animate-stem"
      style={style}
    >
      <path d="M20 120C20 90 18 70 20 36" stroke="#3f8f4a" strokeWidth="3" fill="none" />
      <path d="M20 112C6 98 4 80 8 66c8 14 12 28 12 46Z" fill="#4caf5a" />
      <path d="M10 20c0 18 20 18 20 0V5l-5 8-5-10-5 10-5-8Z" fill={color} />
    </svg>
  );
}
