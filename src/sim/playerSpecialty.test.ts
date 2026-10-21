import assert from 'node:assert';
import { describe, test } from 'node:test';
import { faceoffRating, savingRating } from './playerSpecialty.ts';
import { generateRoster } from './generateRoster.ts';
import type { Player, Team } from '../types/sim.ts';

const team: Team = { id: 'spec', schoolName: 'Spec State', nickname: 'Specs', conferenceId: 'c', region: 'East', prestige: 70 };

describe('player specialties', () => {
  test('generated faceoff men and goalies are good at their own job, and only theirs', () => {
    const roster = generateRoster(team, 'specialty-roster');
    const fo = roster.find((p) => p.position === 'FO') as Player;
    const goalie = roster.find((p) => p.position === 'G') as Player;
    const attackers = roster.filter((p) => p.position === 'A');
    assert.ok(fo.faceoff != null && goalie.saving != null);
    assert.ok(attackers.every((p) => (p.faceoff ?? 0) < (fo.faceoff ?? 0)));
    assert.ok(attackers.every((p) => (p.saving ?? 0) < (goalie.saving ?? 0)));
  });

  test('older saved players fall back to the old engine blend', () => {
    const legacyGoalie: Player = {
      id: 'g', name: 'Old Keeper', position: 'G', year: 3, age: 21, skill: 70,
      shooting: 50, passing: 60, speed: 60, defense: 80, IQ: 70, stamina: 65, discipline: 70, overall: 65,
    };
    assert.strictEqual(savingRating(legacyGoalie), 77);
    assert.strictEqual(faceoffRating({ ...legacyGoalie, position: 'A' }), 47);
    assert.strictEqual(savingRating({ ...legacyGoalie, position: 'A' }), 40);
  });

  test('stored ratings win over the fallback', () => {
    const roster = generateRoster(team, 'specialty-stored');
    const fo = roster.find((p) => p.position === 'FO') as Player;
    assert.strictEqual(faceoffRating({ ...fo, faceoff: 91 }), 91);
  });
});
