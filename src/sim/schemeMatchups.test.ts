import assert from 'node:assert';
import { describe, test } from 'node:test';
import {
  DEFENSE_PACKAGES,
  OFFENSE_SETS,
  programTactics,
  schemeShotQualityEdge,
  scoutOpponent,
} from './schemeMatchups.ts';
import { DEFAULT_TACTICS } from './tactics.ts';
import leagueData from '../data/teams128.json' with { type: 'json' };
import type { Tactics, Team } from '../types/sim.ts';

const teams = leagueData.teams as Team[];
const withSet = (offenseSet: Tactics['offenseSet']): Tactics => ({ ...DEFAULT_TACTICS, offenseSet });
const withPackage = (defensePackage: Tactics['defensePackage']): Tactics => ({ ...DEFAULT_TACTICS, defensePackage });

describe('scheme matchups', () => {
  test('every offense set except balanced has a defense package that beats it', () => {
    for (const set of OFFENSE_SETS.filter((value) => value !== 'balanced')) {
      const worst = Math.min(...DEFENSE_PACKAGES.map((pkg) => schemeShotQualityEdge(withSet(set), withPackage(pkg))));
      assert.ok(worst < 0, `${set} has no bad matchup`);
    }
  });

  test('every defense package has an offense set that beats it', () => {
    for (const pkg of DEFENSE_PACKAGES) {
      const best = Math.max(...OFFENSE_SETS.map((set) => schemeShotQualityEdge(withSet(set), withPackage(pkg))));
      assert.ok(best > 0, `${pkg} has no counter`);
    }
  });

  test('the best offense set depends on the defense', () => {
    const bestAgainst = (pkg: Tactics['defensePackage']) =>
      [...OFFENSE_SETS].sort((a, b) => schemeShotQualityEdge(withSet(b), withPackage(pkg)) - schemeShotQualityEdge(withSet(a), withPackage(pkg)))[0];
    assert.notStrictEqual(bestAgainst('man'), bestAgainst('zone'));
    assert.strictEqual(bestAgainst('zone'), 'motion');
  });

  test('slide timing counters the offense set', () => {
    const early: Tactics = { ...DEFAULT_TACTICS, slideAggression: 'early' };
    const late: Tactics = { ...DEFAULT_TACTICS, slideAggression: 'late' };
    assert.ok(schemeShotQualityEdge(withSet('invert'), early) < schemeShotQualityEdge(withSet('invert'), late));
    assert.ok(schemeShotQualityEdge(withSet('motion'), early) > schemeShotQualityEdge(withSet('motion'), late));
  });

  test('unknown calls read as the neutral scheme', () => {
    const odd = { ...DEFAULT_TACTICS, slideAggression: 'aggressive', offenseSet: 'wishbone' } as unknown as Tactics;
    assert.strictEqual(schemeShotQualityEdge(odd, odd), 0);
  });
});

describe('program scheme identities', () => {
  test('a program keeps the same scheme every time it is asked', () => {
    for (const team of teams.slice(0, 20)) {
      assert.deepStrictEqual(programTactics(team), programTactics({ id: team.id }));
    }
  });

  test('the league plays a spread of schemes', () => {
    const schemes = teams.map((team) => programTactics(team));
    for (const set of OFFENSE_SETS) {
      assert.ok(schemes.filter((s) => s.offenseSet === set).length >= 15, `few ${set} offenses`);
    }
    for (const pkg of DEFENSE_PACKAGES) {
      assert.ok(schemes.filter((s) => s.defensePackage === pkg).length >= 15, `few ${pkg} defenses`);
    }
  });
});

describe('scouting report', () => {
  test('points an invert offense facing a zone toward motion', () => {
    const report = scoutOpponent(withSet('invert'), withPackage('zone'));
    assert.ok(report.offenseEdge < 0);
    assert.strictEqual(report.bestOffenseSet, 'motion');
    assert.ok(report.bestOffenseEdge > report.offenseEdge);
  });

  test('names the defense that handles their offense best', () => {
    const report = scoutOpponent(DEFAULT_TACTICS, withSet('crease'));
    assert.strictEqual(report.bestDefensePackage, 'zone');
    assert.ok(report.bestDefenseEdge > report.defenseEdge);
  });

  test('keeps the current call when nothing lines up better', () => {
    const report = scoutOpponent(withSet('motion'), withPackage('zone'));
    assert.strictEqual(report.bestOffenseSet, 'motion');
    assert.strictEqual(report.bestOffenseEdge, report.offenseEdge);
  });
});
