/**
 * Resolve after the browser has painted the current frame. Await it after setting a busy
 * state and before heavy synchronous work (a week of league games), so "Working…" shows
 * at once instead of the click looking dead until the work is done.
 */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0);
      return;
    }
    // rAF runs just before the paint; the timeout lands just after it.
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}
