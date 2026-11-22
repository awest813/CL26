import { useCallback, useEffect, useState } from 'react';

/**
 * Reveal a game goal by goal: how many of `total` scoring plays are showing. When `active`
 * is false everything shows at once. A new `revealKey` starts the reveal over; `skip`
 * jumps to the final.
 */
export function useGameReveal(total: number, active: boolean, msPerGoal: number, revealKey: string) {
  const [shown, setShown] = useState(active ? 0 : total);

  useEffect(() => {
    if (!active || total === 0) {
      setShown(total);
      return undefined;
    }
    setShown(0);
    const timer = window.setInterval(() => {
      setShown((count) => {
        if (count + 1 >= total) {
          window.clearInterval(timer);
          return total;
        }
        return count + 1;
      });
    }, msPerGoal);
    return () => window.clearInterval(timer);
  }, [active, total, msPerGoal, revealKey]);

  const skip = useCallback(() => setShown(total), [total]);
  return { shown, revealing: active && shown < total, skip };
}

/** True when the visitor asked the system for less motion: reveals then show at once. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
