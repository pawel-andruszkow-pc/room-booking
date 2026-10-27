import { scatter } from '@/lib/scatter';
import { Drift, Heart, SceneFrame } from './SceneParts';

const HEARTS = scatter(16, 5, [1, 2.6], [12, 20]);
const HEART_COLORS = ['text-[#ff8fb3]/70', 'text-[#ff4f8b]/60', 'text-[#ffc2d6]/55'];

/**
 * Valentine's Day on a busy room: hearts floating up past a big beating heart
 * with Cupid's arrow through it. Sits behind the content and never takes a
 * tap; transforms and opacity only, like HalloweenScene.
 */
export function ValentinesScene() {
  return (
    <SceneFrame>
      {/* Big heart, in the empty band between the room name and the clock. */}
      <div className="absolute left-[46%] top-[clamp(1.5rem,4vh,3rem)] w-[clamp(8rem,13vw,15rem)] -translate-x-1/2">
        <div className="absolute -inset-[60%] rounded-full bg-[radial-gradient(circle,rgba(255,120,170,0.25),transparent_62%)]" />
        <div className="relative animate-heartbeat">
          <Heart className="text-[#ff4f8b] drop-shadow-[0_0_40px_rgba(255,80,140,0.45)]" />
        </div>
        {/* Cupid's arrow */}
        <svg viewBox="0 0 200 100" className="absolute -inset-x-[30%] top-[10%] w-[160%]">
          <path d="M20 80 180 20" stroke="#ffe3a3" strokeWidth="3" strokeLinecap="round" />
          <path d="M180 20l-16 1 6 6 1 7Z" fill="#ffe3a3" />
          <path
            d="M20 80l-6-10M20 80l-12-2M28 77l-6-10M28 77l-12-2"
            stroke="#fff"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <Drift pieces={HEARTS} rise>
        {(_, i) => <Heart className={HEART_COLORS[i % HEART_COLORS.length]} />}
      </Drift>
    </SceneFrame>
  );
}
