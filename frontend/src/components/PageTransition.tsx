import type { ReactNode } from 'react';
import { motion } from 'motion/react';

/**
 * Cheap route transition: opacity + a few px of translate (compositor-only),
 * on the way in only. The outgoing page is simply dropped — an exit animation
 * would have to finish before the new page can mount, and that wait is what a
 * tap on a wall tablet feels as lag.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="h-full"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.15, ease: 'easeOut' } }}
    >
      {children}
    </motion.div>
  );
}
