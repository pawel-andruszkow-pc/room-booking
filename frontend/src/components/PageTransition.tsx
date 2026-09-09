import type { ReactNode } from 'react';
import { motion } from 'motion/react';

/** Cheap route transition: opacity + a few px of translate (compositor-only). */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
