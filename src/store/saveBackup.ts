/**
 * Career backups: the save as a file the player keeps, and restoring one. The backup holds
 * the saved slices in exactly the form redux-persist stores them, so restoring is writing it
 * back and reloading; an older backup goes through the same migrations as an older save.
 */

/** Where redux-persist keeps the career (persist key 'root'). */
export const SAVE_STORAGE_KEY = 'persist:root';
/** The save format version; bump it with every new migration in store.ts. */
export const SAVE_VERSION = 4;
export const BACKUP_APP_ID = 'cl26-head-coach';

export interface BackupSummary {
  coachName: string | null;
  programName: string | null;
  year: number | null;
  /** 1-based week of the regular season, or null outside it. */
  week: number | null;
  phase: string | null;
}

export interface CareerBackup {
  app: typeof BACKUP_APP_ID;
  saveVersion: number;
  exportedAt: string;
  summary: BackupSummary;
  /** The value redux-persist keeps under SAVE_STORAGE_KEY. */
  persistRoot: string;
}

/** The persisted slices. Only the fields the summary reads are named; the rest are carried as is. */
type SavedSlices = {
  season: { year?: number; currentWeekIndex?: number; phase?: string };
  coach: { profile?: { name?: string } | null; selectedTeamId?: string | null };
  settings: object;
};

export function summarizeSave(slices: SavedSlices, programName?: string | null): BackupSummary {
  const phase = slices.season.phase ?? null;
  return {
    coachName: slices.coach.profile?.name ?? null,
    programName: programName ?? null,
    year: slices.season.year ?? null,
    week: phase === 'REGULAR' && slices.season.currentWeekIndex != null ? slices.season.currentWeekIndex + 1 : null,
    phase,
  };
}

/** The career as a backup file's contents. */
export function buildBackup(slices: SavedSlices, exportedAt: Date, programName?: string | null): CareerBackup {
  const persistRoot = JSON.stringify({
    season: JSON.stringify(slices.season),
    coach: JSON.stringify(slices.coach),
    settings: JSON.stringify(slices.settings),
    _persist: JSON.stringify({ version: SAVE_VERSION, rehydrated: true }),
  });
  return {
    app: BACKUP_APP_ID,
    saveVersion: SAVE_VERSION,
    exportedAt: exportedAt.toISOString(),
    summary: summarizeSave(slices, programName),
    persistRoot,
  };
}

/** "cl26-avery-stone-2027-week-4.json" */
export function backupFileName(summary: BackupSummary): string {
  const slug = (value: string | null) => (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const parts = ['cl26', slug(summary.coachName) || 'career', summary.year ? String(summary.year) : null, summary.week ? `week-${summary.week}` : slug(summary.phase)];
  return `${parts.filter(Boolean).join('-')}.json`;
}

export type ParsedBackup = { ok: true; backup: CareerBackup } | { ok: false; error: string };

/** Read a backup file's text, refusing anything that is not a CL26 career this build can load. */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not a CL26 backup (it is not readable JSON).' };
  }
  const backup = data as Partial<CareerBackup> | null;
  if (!backup || typeof backup !== 'object' || backup.app !== BACKUP_APP_ID || typeof backup.persistRoot !== 'string') {
    return { ok: false, error: 'That file is not a CL26 career backup.' };
  }
  if (typeof backup.saveVersion !== 'number' || backup.saveVersion > SAVE_VERSION) {
    return { ok: false, error: 'That backup comes from a newer version of the game. Update the game (reload it), then restore again.' };
  }
  let root: Record<string, unknown>;
  try {
    root = JSON.parse(backup.persistRoot) as Record<string, unknown>;
    for (const key of ['season', 'coach', '_persist']) {
      if (typeof root[key] !== 'string') throw new Error(key);
      JSON.parse(root[key] as string);
    }
  } catch {
    return { ok: false, error: 'That backup is damaged: its saved career could not be read.' };
  }
  return { ok: true, backup: backup as CareerBackup };
}
