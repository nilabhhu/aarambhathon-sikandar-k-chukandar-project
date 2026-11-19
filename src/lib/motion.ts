/**
 * Global Motion Physics & Tactile Studio Constants for MixLearn Studio.
 * Paired with <MotionConfig reducedMotion="user"> at the application root.
 */

export const STUDIO_SPRING = {
  type: 'spring',
  stiffness: 380,
  damping: 30,
  mass: 0.8,
} as const;

export const TACTILE_TAP = {
  scale: 0.97,
  transition: { duration: 0.08, ease: [0.22, 1, 0.36, 1] },
} as const;

export const STUDIO_EASE = [0.22, 1, 0.36, 1] as const;

export const VIEWPORT_REVEAL = {
  once: true,
  amount: 'some',
} as const;
