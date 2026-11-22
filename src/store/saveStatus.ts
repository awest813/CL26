/**
 * Whether the career is actually being saved. redux-persist swallows write errors (it only
 * logs them), and falls back to storage that keeps nothing when the browser blocks it, so a
 * player could keep playing for hours and lose all of it on reload. The persist storage
 * reports every write here, and the layout shows a banner while saves are failing.
 */
export type SaveProblem = 'full' | 'blocked' | 'failed';

export interface SaveStatus {
  /** Null while saves are going through. */
  problem: SaveProblem | null;
}

let status: SaveStatus = { problem: null };
const listeners = new Set<() => void>();

function set(next: SaveStatus) {
  if (next.problem === status.problem) return;
  status = next;
  listeners.forEach((listener) => listener());
}

/** Classify a failed write: a full quota, storage the browser refuses, or anything else. */
export function saveProblemFor(error: unknown): SaveProblem {
  const name = (error as { name?: string } | null)?.name ?? '';
  const code = (error as { code?: number } | null)?.code;
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014) return 'full';
  if (name === 'SecurityError') return 'blocked';
  return 'failed';
}

export function reportSaveFailure(error: unknown): void {
  set({ problem: saveProblemFor(error) });
}

export function reportSaveOk(): void {
  // Storage the browser blocks outright never recovers within the session.
  if (status.problem === 'blocked') return;
  set({ problem: null });
}

/** At startup: can this page write to localStorage at all? If not, nothing will be kept. */
export function checkStorageAvailable(storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined = typeof window !== 'undefined' ? safeLocalStorage() : null): boolean {
  if (!storage) {
    set({ problem: 'blocked' });
    return false;
  }
  try {
    const probe = '__cl26_save_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch (error) {
    // A full quota at startup still means saving is failing; a refusal means blocked.
    set({ problem: saveProblemFor(error) === 'full' ? 'full' : 'blocked' });
    return false;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getSaveStatus(): SaveStatus {
  return status;
}

export function subscribeSaveStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test hook: back to a clean slate. */
export function resetSaveStatus(): void {
  status = { problem: null };
}
