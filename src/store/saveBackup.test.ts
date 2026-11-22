import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { BACKUP_APP_ID, backupFileName, buildBackup, parseBackup, SAVE_VERSION } from './saveBackup.ts';

const slices = {
  season: { year: 2027, currentWeekIndex: 3, phase: 'REGULAR', gameResults: [{ id: 'g1' }] },
  coach: { profile: { name: 'Avery Stone' }, selectedTeamId: 't010', managedRoster: [{ id: 'p1', overall: 80 }] },
  settings: { theme: 'dark', teamOverrides: { t010: { nickname: 'Comets' } } },
};

describe('career backups', () => {
  test('a backup holds the save exactly as redux-persist stores it', () => {
    const backup = buildBackup(slices, new Date('2026-11-22T12:00:00Z'), 'Hilltop University');
    const root = JSON.parse(backup.persistRoot);
    assert.deepEqual(JSON.parse(root.season), slices.season);
    assert.deepEqual(JSON.parse(root.coach), slices.coach);
    assert.deepEqual(JSON.parse(root.settings), slices.settings);
    assert.deepEqual(JSON.parse(root._persist), { version: SAVE_VERSION, rehydrated: true });
    assert.deepEqual(backup.summary, { coachName: 'Avery Stone', programName: 'Hilltop University', year: 2027, week: 4, phase: 'REGULAR' });
    assert.equal(backupFileName(backup.summary), 'cl26-avery-stone-2027-week-4.json');
  });

  test('a backup reads back, and outside the regular season it names the phase', () => {
    const backup = buildBackup({ ...slices, season: { ...slices.season, phase: 'OFFSEASON' } }, new Date(0));
    const parsed = parseBackup(JSON.stringify(backup));
    assert.ok(parsed.ok);
    assert.equal(parsed.ok && parsed.backup.summary.week, null);
    assert.equal(backupFileName(backup.summary), 'cl26-avery-stone-2027-offseason.json');
  });

  test('anything that is not a loadable CL26 career is refused with a reason', () => {
    const good = buildBackup(slices, new Date(0));
    const reason = (text: string) => { const parsed = parseBackup(text); return parsed.ok ? 'accepted' : parsed.error; };
    assert.match(reason('not json'), /not readable/);
    assert.match(reason(JSON.stringify({ app: 'other-game', persistRoot: '{}' })), /not a CL26/);
    assert.match(reason(JSON.stringify({ ...good, saveVersion: SAVE_VERSION + 1 })), /newer version/);
    assert.match(reason(JSON.stringify({ ...good, persistRoot: '{"season":"{"}' })), /damaged/);
    assert.equal(reason(JSON.stringify({ ...good, saveVersion: 1 })), 'accepted', 'older backups load and migrate');
    assert.equal(good.app, BACKUP_APP_ID);
  });

  test('the save version matches the newest migration in the store', () => {
    const store = readFileSync(new URL('./store.ts', import.meta.url), 'utf8');
    const migrations = [...store.matchAll(/^\s{6}(\d+): \(state\)/gm)].map((match) => Number(match[1]));
    assert.ok(migrations.length > 0, 'found the migrations');
    assert.equal(SAVE_VERSION, Math.max(...migrations), 'bump SAVE_VERSION with each new migration');
  });
});
