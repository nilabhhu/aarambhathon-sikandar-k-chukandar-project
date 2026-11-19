/**
 * Swiss Neo-Brutalist Mechanical Motion Physics for MixLearn Studio.
 * Paired with <MotionConfig reducedMotion="user"> at the application root.
 */

export const BRUT_EASE = [0.16, 1, 0.3, 1] as const;

export const BRUT_SPRING = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
} as const;

export const TACTILE_TAP = {
  scale: 0.985,
  transition: { duration: 0.06, ease: [0.16, 1, 0.3, 1] },
} as const;

export const VIEWPORT_REVEAL = {
  once: true,
  amount: 'some',
} as const;

// Preserved aliases for downstream components
export const STUDIO_EASE = BRUT_EASE;
export const STUDIO_SPRING = BRUT_SPRING;
