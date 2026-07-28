/**
 * Lacrosse domain regression: the box score a game produces has to obey the
 * sport's rules and land in NCAA territory, not just be internally consistent.
 */
import assert from 'node:assert';
import { describe, test } from 'node:test';
import teamsData from '../data/teams128.json' with { type: 'json' };
import { generateRoster } from './generateRoster.ts';
import { simulateGame } from './matchEngine.ts';
import { buildDefaultStarters } from './rosterManagement.ts';
import { buildPositionNeedByPosition } from './recruiting.ts';
import {
  MEN_DEFAULT_LINEUP,
  MEN_ON_FIELD,
  PERIODS,
  POSITIONS,
  POSITION_MINIMUMS,
  ROSTER_POSITION_TARGETS,
  ROSTER_TARGET_SIZE,
  STARTER_SLOTS_BY_POSITION,
} from './gameRules.ts';
import type { Position, Tactics, Team, TeamGameStats } from '../types/sim.ts';

const teams = teamsData.teams as Team[];
const NEUTRAL: Tactics = {
  tempo: 'normal',
  rideClear: 'balanced',
  slideAggression: 'normal',
  offenseSet: 'balanced',
  defensePackage: 'man',
};

/** Simulate a league-wide sample and total every team-game stat line. */
function sampleTeamStats(gameCount = 200): TeamGameStats[] {
  const lines: TeamGameStats[] = [];
  for (let i = 0; i < gameCount; i += 1) {
    const home = teams[(i * 7) % teams.length];
    const away = teams[(i * 13 + 5) % teams.length];
    if (home.id === away.id) continue;
    const result = simulateGame(
      { team: home, roster: generateRoster(home, 'league-season-2026') },
      { team: away, roster: generateRoster(away, 'league-season-2026') },
      NEUTRAL,
      NEUTRAL,
      5000 + i,
    );
    lines.push(result.statsA, result.statsB);
  }
  return lines;
}

function mean(lines: TeamGameStats[], pick: (s: TeamGameStats) => number): number {
  return lines.reduce((sum, line) => sum + pick(line), 0) / lines.length;
}

describe('lacrosse box score integrity', () => {
  const lines = sampleTeamStats();

  test('shots on goal are a subset of shots, and goals a subset of shots on goal', () => {
    for (const line of lines) {
      const sog = line.shotsOnGoal ?? 0;
      assert.ok(sog <= line.shots, `SOG ${sog} exceeded shots ${line.shots}`);
      assert.ok(line.goals <= sog, `goals ${line.goals} exceeded SOG ${sog}`);
    }
  });

  test('every goal is either saved or scored — save totals reconcile across teams', () => {
    for (let i = 0; i < lines.length; i += 2) {
      const home = lines[i];
      const away = lines[i + 1];
      // Shots on goal the home team took were either saved by the away keeper or scored.
      assert.strictEqual(
        home.shotsOnGoal,
        home.goals + away.saves,
        'home SOG must equal home goals plus away saves',
      );
      assert.strictEqual(
        away.shotsOnGoal,
        away.goals + home.saves,
        'away SOG must equal away goals plus home saves',
      );
    }
  });

  test('clears and man-up chances never exceed their attempts', () => {
    for (const line of lines) {
      assert.ok((line.clearsSuccessful ?? 0) <= (line.clearsAttempted ?? 0));
      assert.ok((line.manUpGoals ?? 0) <= (line.manUpOpportunities ?? 0));
    }
  });

  test('both teams are credited the same number of faceoffs, one per quarter plus one per goal', () => {
    for (let i = 0; i < lines.length; i += 2) {
      const home = lines[i];
      const away = lines[i + 1];
      assert.strictEqual(home.faceoffsTaken, away.faceoffsTaken);
      assert.strictEqual((home.faceoffsWon ?? 0) + (away.faceoffsWon ?? 0), home.faceoffsTaken);
      // Regulation games draw once per quarter plus once after every goal.
      // Overtime adds more, so this is a floor rather than an equality.
      assert.ok(
        (home.faceoffsTaken ?? 0) >= PERIODS + home.goals + away.goals,
        `faceoffs ${home.faceoffsTaken} below quarters + goals`,
      );
    }
  });

  test('penalty minutes only accrue when penalties were called', () => {
    for (const line of lines) {
      if (line.penalties === 0) assert.strictEqual(line.penaltyMinutes ?? 0, 0);
      else assert.ok((line.penaltyMinutes ?? 0) > 0);
    }
  });

  test('team stat averages land in NCAA Division I territory', () => {
    const goals = mean(lines, (s) => s.goals);
    const shots = mean(lines, (s) => s.shots);
    const sog = mean(lines, (s) => s.shotsOnGoal ?? 0);
    const saves = mean(lines, (s) => s.saves);
    const groundBalls = mean(lines, (s) => s.groundBalls);
    const turnovers = mean(lines, (s) => s.turnovers);
    const causedTurnovers = mean(lines, (s) => s.causedTurnovers ?? 0);
    const penalties = mean(lines, (s) => s.penalties);
    const shootingPct = goals / shots;
    const savePct = saves / (saves + goals);
    const sogRate = sog / shots;

    assert.ok(goals > 9.5 && goals < 14, `goals/team ${goals.toFixed(1)} outside NCAA range`);
    assert.ok(shots > 30 && shots < 42, `shots/team ${shots.toFixed(1)} outside NCAA range`);
    assert.ok(shootingPct > 0.27 && shootingPct < 0.38, `shooting ${(shootingPct * 100).toFixed(1)}%`);
    assert.ok(savePct > 0.44 && savePct < 0.58, `save pct ${savePct.toFixed(3)}`);
    assert.ok(sogRate > 0.55 && sogRate < 0.75, `SOG rate ${(sogRate * 100).toFixed(0)}%`);
    assert.ok(groundBalls > 24 && groundBalls < 38, `ground balls ${groundBalls.toFixed(1)}`);
    assert.ok(turnovers > 11 && turnovers < 19, `turnovers ${turnovers.toFixed(1)}`);
    assert.ok(causedTurnovers < turnovers, 'not every turnover should be forced by the defense');
    assert.ok(penalties > 1.2 && penalties < 4, `penalties ${penalties.toFixed(1)}`);
  });

  test('a full game never ends in a tie', () => {
    for (let i = 0; i < lines.length; i += 2) {
      assert.notStrictEqual(lines[i].goals, lines[i + 1].goals, 'lacrosse games are played to a winner');
    }
  });

  test('highlights use real lacrosse fouls, never a phantom "early slide" penalty', () => {
    const home = teams[0];
    const away = teams[1];
    const allHighlights: string[] = [];
    for (let seed = 0; seed < 60; seed += 1) {
      const result = simulateGame(
        { team: home, roster: generateRoster(home, 'league-season-2026') },
        { team: away, roster: generateRoster(away, 'league-season-2026') },
        NEUTRAL,
        NEUTRAL,
        seed,
      );
      allHighlights.push(...result.highlights);
    }

    // Sliding early is a tactic, not an infraction — it must never be "called".
    assert.ok(
      !allHighlights.some((line) => /called for an early slide/i.test(line)),
      'an early slide is not a foul in lacrosse',
    );
    assert.ok(
      allHighlights.some((line) => /slashing|holding|cross-check|illegal body check|tripping/i.test(line)),
      'expected real lacrosse fouls to appear in highlights',
    );
  });
});

describe('lacrosse positions and lineup', () => {
  test('the depth chart fields ten men plus the two rotating specialists', () => {
    const fieldSlots =
      STARTER_SLOTS_BY_POSITION.A +
      STARTER_SLOTS_BY_POSITION.M +
      STARTER_SLOTS_BY_POSITION.D +
      STARTER_SLOTS_BY_POSITION.G;

    assert.strictEqual(fieldSlots, MEN_ON_FIELD, 'A/M/D/G starters must equal the on-field count');
    assert.strictEqual(MEN_DEFAULT_LINEUP.total, MEN_ON_FIELD);
    assert.strictEqual(STARTER_SLOTS_BY_POSITION.A, MEN_DEFAULT_LINEUP.attackers);
    assert.strictEqual(STARTER_SLOTS_BY_POSITION.D, MEN_DEFAULT_LINEUP.defenders);
    assert.strictEqual(STARTER_SLOTS_BY_POSITION.G, MEN_DEFAULT_LINEUP.goalkeeper);
    // LSM and FOGO are specialists who rotate into a midfield slot, not extra fielders.
    assert.strictEqual(STARTER_SLOTS_BY_POSITION.LSM, 1);
    assert.strictEqual(STARTER_SLOTS_BY_POSITION.FO, 1);
  });

  test('a generated roster matches the target squad shape exactly', () => {
    const roster = generateRoster(teams[0], 'league-season-2026');
    const counts: Record<Position, number> = { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 };
    for (const player of roster) counts[player.position] += 1;

    assert.strictEqual(roster.length, ROSTER_TARGET_SIZE);
    for (const position of POSITIONS) {
      assert.strictEqual(
        counts[position],
        ROSTER_POSITION_TARGETS[position],
        `${position}: drew ${counts[position]}, target ${ROSTER_POSITION_TARGETS[position]}`,
      );
      assert.ok(counts[position] >= POSITION_MINIMUMS[position]);
    }
    // Carrying a single goalie is not a real roster — depth at the specialist spots matters.
    assert.ok(counts.G >= 2, 'a program carries a backup goalie');
    assert.ok(counts.FO >= 2, 'a program carries more than one faceoff man');
  });

  test('a full roster reports no recruiting position needs', () => {
    const roster = generateRoster(teams[0], 'league-season-2026');
    const needs = buildPositionNeedByPosition(roster);
    for (const position of POSITIONS) {
      assert.strictEqual(needs[position], 0, `${position} should not read as a need on a full squad`);
    }
  });

  test('default starters fill every position slot and nothing more', () => {
    const roster = generateRoster(teams[0], 'league-season-2026');
    const starters = buildDefaultStarters(roster);
    const byId = new Map(roster.map((player) => [player.id, player]));
    const counts: Record<Position, number> = { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 };
    for (const id of starters) {
      const player = byId.get(id);
      assert.ok(player, 'starter must be on the roster');
      counts[player.position] += 1;
    }
    for (const position of POSITIONS) {
      assert.strictEqual(counts[position], STARTER_SLOTS_BY_POSITION[position]);
    }
  });
});
