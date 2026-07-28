/**
 * Deterministic ordering helpers for simulation code.
 *
 * `String.prototype.localeCompare` resolves collation from the host default
 * locale (and degrades in ICU-less runtimes), so the same seed could rank teams
 * or sign recruits differently across machines. Simulation tie-breakers must use
 * codepoint order instead, which is stable everywhere.
 */

/** Codepoint-ordered ascending comparator. Locale-independent by design. */
export function compareStringsAsc(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
