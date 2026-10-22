import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Team } from '../types/sim.ts';
import { estimateWinChance } from './winEstimate.ts';
import { generateRoster } from './generateRoster.ts';
import { programStarters } from './programLedger.ts';
import { DEFAULT_TACTICS } from './tactics.ts';

const user: Team = { id: 'user', schoolName: 'User U', nickname: 'Us', conferenceId: 'c1', region: 'East', prestige: 70 };
const rival: Team = { id: 'rival', schoolName: 'Rival Tech', nickname: 'Them', conferenceId: 'c2', region: 'East', prestige: 70 };
const userRoster = generateRoster(user, 'estimate');
const side = (team: Team, roster = generateRoster(team, 'estimate')) => ({ team, roster, starterIds: programStarters(roster) });

const base = {
  user: side(user, userRoster),
  userTactics: DEFAULT_TACTICS,
  opponent: side(rival),
  opponentTactics: DEFAULT_TACTICS,
  isHome: true,
  seedKey: 'w3:user:rival',
  samples: 200,
};

describe('win estimate', () => {
  test('the same matchup always gives the same number', () => {
    assert.equal(estimateWinChance(base), estimateWinChance(base));
  });

  test('a much stronger opponent lowers it', () => {
    const strong = side({ ...rival, prestige: 95 });
    assert.ok(estimateWinChance({ ...base, opponent: strong }) < estimateWinChance(base) - 15);
  });

  test('home field helps and a neutral site takes it away', () => {
    const home = estimateWinChance(base);
    const away = estimateWinChance({ ...base, isHome: false });
    const neutral = estimateWinChance({ ...base, neutral: true });
    assert.ok(home > away, `home ${home} vs away ${away}`);
    assert.ok(neutral < home);
  });

  test('a scheme that counters the opponent raises it', () => {
    const zone = { ...DEFAULT_TACTICS, defensePackage: 'zone' as const };
    const invertOffense = { ...DEFAULT_TACTICS, offenseSet: 'invert' as const };
    const intoTheZone = estimateWinChance({ ...base, userTactics: invertOffense, opponentTactics: zone });
    const motionIntoZone = estimateWinChance({ ...base, userTactics: { ...DEFAULT_TACTICS, offenseSet: 'motion' }, opponentTactics: zone });
    assert.ok(motionIntoZone > intoTheZone, `motion ${motionIntoZone} vs invert ${intoTheZone} into a zone`);
  });

  test('stays a percentage', () => {
    const value = estimateWinChance({ ...base, samples: 10 });
    assert.ok(value >= 0 && value <= 100);
  });
});
