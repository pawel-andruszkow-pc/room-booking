import type { ReactNode } from 'react';
import { motion } from 'motion/react';

/**
 * Cheap route transition: opacity + a few px of translate (compositor-only).
 *
 * The router runs these with `mode="wait"`, so the two halves are sequential
 * and their sum is what a tap actually costs. The outgoing page is therefore
 * the faster half — clearing it quickly is what makes the tap feel answered —
 * and the incoming one gets just enough time to not look like a hard cut.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="h-full"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.15, ease: 'easeOut' } }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.09, ease: 'easeIn' } }}
    >
      {children}
    </motion.div>
  );
}
