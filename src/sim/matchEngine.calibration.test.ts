import assert from 'node:assert';
import { describe, test } from 'node:test';
import { fatigueWear, homeFieldScale, lateGameAdjustment, simulateGame } from './matchEngine.ts';
import { generateRoster } from './generateRoster.ts';
import { programStarters } from './programLedger.ts';
import { DEFAULT_TACTICS } from './tactics.ts';
import leagueData from '../data/teams128.json' with { type: 'json' };
import type { Player, Tactics, Team } from '../types/sim.ts';
import { DEFENSE_PACKAGES, OFFENSE_SETS, programTactics } from './schemeMatchups.ts';
import { buildCoachGamePlan } from './coachEffects.ts';

/**
 * League-wide box-score bands, so engine changes cannot drift away from a
 * D-I-like game without a test noticing. Run `bun scripts/calibrate-engine.ts`
 * for the full table these bands come from.
 */
const teams = leagueData.teams as Team[];
const GAMES = 1000;

interface Totals {
  games: number;
  goals: number;
  shots: number;
  shotsOnGoal: number;
  saves: number;
  groundBalls: number;
  turnovers: number;
  penalties: number;
  homeWins: number;
  overtimeGames: number;
  extraManGoals: number;
  extraManOpportunities: number;
}

function playLeagueSample(): Totals {
  const totals: Totals = { games: 0, goals: 0, shots: 0, shotsOnGoal: 0, saves: 0, groundBalls: 0, turnovers: 0, penalties: 0, homeWins: 0, overtimeGames: 0, extraManGoals: 0, extraManOpportunities: 0 };
  for (let i = 0; i < GAMES; i += 1) {
    const home = teams[(i * 37) % teams.length];
    const away = teams[(i * 53 + 11) % teams.length];
    if (home.id === away.id) continue;
    const rosterSeed = `calibration-${i % 4}`;
    // The league fields every CPU program with its staff's depth chart.
    const homeRoster = generateRoster(home, rosterSeed);
    const awayRoster = generateRoster(away, rosterSeed);
    const result = simulateGame(
      { team: home, roster: homeRoster, starterIds: programStarters(homeRoster) },
      { team: away, roster: awayRoster, starterIds: programStarters(awayRoster) },
      DEFAULT_TACTICS,
      DEFAULT_TACTICS,
      i * 7919 + 3,
    );
    totals.games += 1;
    for (const stats of [result.statsA, result.statsB]) {
      totals.goals += stats.goals;
      totals.shots += stats.shots;
      totals.shotsOnGoal += stats.shotsOnGoal ?? 0;
      totals.saves += stats.saves;
      totals.groundBalls += stats.groundBalls;
      totals.turnovers += stats.turnovers;
      totals.penalties += stats.penalties;
      totals.extraManGoals += stats.extraManGoals ?? 0;
      totals.extraManOpportunities += stats.extraManOpportunities ?? 0;
    }
    if (result.scoreA > result.scoreB) totals.homeWins += 1;
    if (result.highlights.some((line) => /overtime/i.test(line))) totals.overtimeGames += 1;
  }
  return totals;
}

function assertBand(label: string, value: number, min: number, max: number): void {
  assert.ok(value >= min && value <= max, `${label} ${value.toFixed(3)} outside [${min}, ${max}]`);
}

describe('match engine calibration bands', () => {
  const totals = playLeagueSample();
  const teamGames = totals.games * 2;

  test('scoring volume looks like a D-I game', () => {
    assertBand('goals per team', totals.goals / teamGames, 10, 13.5);
    assertBand('shots per team', totals.shots / teamGames, 32, 42);
    assertBand('shooting pct', totals.goals / totals.shots, 0.27, 0.35);
    assertBand('save pct on shots on goal', totals.saves / totals.shotsOnGoal, 0.45, 0.58);
  });

  test('possession battles look like a D-I game', () => {
    assertBand('ground balls per team', totals.groundBalls / teamGames, 24, 34);
    assertBand('turnovers per team', totals.turnovers / teamGames, 10, 16);
    assertBand('penalties per team', totals.penalties / teamGames, 2, 4.5);
  });

  test('man-up chances convert at a D-I rate', () => {
    assertBand('man-up chances per team', totals.extraManOpportunities / teamGames, 1.8, 4);
    assertBand('man-up conversion', totals.extraManGoals / totals.extraManOpportunities, 0.25, 0.45);
  });

  test('home field and overtime rates stay believable', () => {
    assertBand('home win pct', totals.homeWins / totals.games, 0.51, 0.6);
    assertBand('overtime rate', totals.overtimeGames / totals.games, 0.03, 0.12);
  });
});

const alpha: Team = { id: 'alpha', schoolName: 'Alpha State', nickname: 'Arrows', conferenceId: 'c1', region: 'East', prestige: 70 };
const beta: Team = { id: 'beta', schoolName: 'Beta Tech', nickname: 'Breakers', conferenceId: 'c2', region: 'West', prestige: 70 };

describe('match engine event model', () => {
  test('faceoff percentage is the share of draws actually won', () => {
    const rosterA = generateRoster(alpha, 'fo-model');
    const rosterB = generateRoster(beta, 'fo-model');
    for (let seed = 1; seed <= 40; seed += 1) {
      const result = simulateGame({ team: alpha, roster: rosterA }, { team: beta, roster: rosterB }, DEFAULT_TACTICS, DEFAULT_TACTICS, seed);
      const taken = result.statsA.faceoffsTaken ?? 0;
      assert.strictEqual(taken, result.statsB.faceoffsTaken);
      assert.strictEqual((result.statsA.faceoffWins ?? 0) + (result.statsB.faceoffWins ?? 0), taken);
      // One draw to open each regulation quarter and one after every goal, except a goal that ends a period or the game.
      assert.ok(taken >= 4 && taken <= 4 + result.scoreA + result.scoreB + 30, `seed ${seed}: ${taken} draws`);
      assert.ok(Math.abs(result.statsA.faceoffPct - ((result.statsA.faceoffWins ?? 0) / taken) * 100) < 0.11);
    }
  });

  test('shots on goal split into goals and saves', () => {
    const rosterA = generateRoster(alpha, 'sog-model');
    const rosterB = generateRoster(beta, 'sog-model');
    for (let seed = 1; seed <= 40; seed += 1) {
      const result = simulateGame({ team: alpha, roster: rosterA }, { team: beta, roster: rosterB }, DEFAULT_TACTICS, DEFAULT_TACTICS, seed);
      assert.strictEqual(result.statsA.shotsOnGoal, result.scoreA + result.statsB.saves);
      assert.strictEqual(result.statsB.shotsOnGoal, result.scoreB + result.statsA.saves);
      assert.ok((result.statsA.shotsOnGoal ?? 0) <= result.statsA.shots);
    }
  });

  test('a star shooter leads his team in goals', () => {
    const rosterA = generateRoster(alpha, 'star-model');
    const rosterB = generateRoster(beta, 'star-model');
    const starIndex = rosterA.findIndex((player) => player.position === 'A');
    const star: Player = { ...rosterA[starIndex], shooting: 99, IQ: 95 };
    const roster = rosterA.map((player, index) => (index === starIndex ? star : player));

    const goalsByPlayer = new Map<string, number>();
    for (let seed = 1; seed <= 300; seed += 1) {
      const result = simulateGame({ team: alpha, roster }, { team: beta, roster: rosterB }, DEFAULT_TACTICS, DEFAULT_TACTICS, seed);
      for (const row of result.topPlayersA) {
        goalsByPlayer.set(row.playerId, (goalsByPlayer.get(row.playerId) ?? 0) + row.goals);
      }
    }
    const leader = [...goalsByPlayer.entries()].sort((a, b) => b[1] - a[1])[0];
    assert.strictEqual(leader[0], star.id);
  });

  test('overtime is sudden death: the first goal ends it', () => {
    const rosterA = generateRoster(alpha, 'ot-model');
    const rosterB = generateRoster(beta, 'ot-model');
    let overtimeGames = 0;
    for (let seed = 1; seed <= 600 && overtimeGames < 10; seed += 1) {
      const result = simulateGame({ team: alpha, roster: rosterA }, { team: beta, roster: rosterB }, DEFAULT_TACTICS, DEFAULT_TACTICS, seed);
      if (!result.highlights.some((line) => /wins in overtime/.test(line))) continue;
      overtimeGames += 1;
      assert.strictEqual(Math.abs(result.scoreA - result.scoreB), 1, `seed ${seed} OT margin`);
      assert.ok(!result.highlights.some((line) => /sudden-death winner/.test(line)), `seed ${seed} needed the deadlock fallback`);
    }
    assert.ok(overtimeGames > 0);
  });

  test('same inputs give the same game', () => {
    const rosterA = generateRoster(alpha, 'determinism');
    const rosterB = generateRoster(beta, 'determinism');
    const first = simulateGame({ team: alpha, roster: rosterA }, { team: beta, roster: rosterB }, DEFAULT_TACTICS, DEFAULT_TACTICS, 4242);
    const second = simulateGame({ team: alpha, roster: rosterA }, { team: beta, roster: rosterB }, DEFAULT_TACTICS, DEFAULT_TACTICS, 4242);
    assert.deepStrictEqual(first, second);
  });

  test('highlights only describe events from the game', () => {
    const rosterA = generateRoster(alpha, 'highlight-model');
    const rosterB = generateRoster(beta, 'highlight-model');
    const result = simulateGame({ team: alpha, roster: rosterA }, { team: beta, roster: rosterB }, DEFAULT_TACTICS, DEFAULT_TACTICS, 99);
    const names = new Set([...rosterA, ...rosterB].map((player) => player.name));
    const goalLines = result.highlights.filter((line) => /, (Alpha State|Beta Tech), /.test(line));
    assert.ok(goalLines.length > 0);
    for (const line of goalLines) {
      const scorer = line.split(' — ')[1].split(',')[0];
      assert.ok(names.has(scorer), `unknown scorer in "${line}"`);
    }
    assert.ok(result.highlights.some((line) => line.startsWith('Halftime')));
  });
});

describe('match engine specialists and penalties', () => {
  const rosterA = generateRoster(alpha, 'specialists');
  const rosterB = generateRoster(beta, 'specialists');
  const withSpecialty = (position: Player['position'], patch: Partial<Player>) =>
    rosterA.map((player) => (player.position === position ? { ...player, ...patch } : player));

  function sample(roster: Player[], games = 200) {
    let faceoffWins = 0;
    let faceoffs = 0;
    let saves = 0;
    let shotsOnGoalAgainst = 0;
    let wins = 0;
    for (let seed = 1; seed <= games; seed += 1) {
      const result = simulateGame({ team: alpha, roster }, { team: beta, roster: rosterB }, DEFAULT_TACTICS, DEFAULT_TACTICS, seed, { homeAdvantageForA: seed % 2 === 0 });
      faceoffWins += result.statsA.faceoffWins ?? 0;
      faceoffs += result.statsA.faceoffsTaken ?? 0;
      saves += result.statsA.saves;
      shotsOnGoalAgainst += result.statsB.shotsOnGoal ?? 0;
      if (result.scoreA > result.scoreB) wins += 1;
    }
    return { faceoffPct: faceoffWins / faceoffs, savePct: saves / shotsOnGoalAgainst, winPct: wins / games };
  }

  test('a better faceoff man wins more draws', () => {
    const strong = sample(withSpecialty('FO', { faceoff: 95 }));
    const weak = sample(withSpecialty('FO', { faceoff: 50 }));
    assert.ok(strong.faceoffPct > weak.faceoffPct + 0.05, `${strong.faceoffPct} vs ${weak.faceoffPct}`);
    assert.ok(strong.faceoffPct < 0.72, 'one faceoff man should not own the X');
  });

  test('a better goalie saves more shots on goal', () => {
    const strong = sample(withSpecialty('G', { saving: 95 }));
    const weak = sample(withSpecialty('G', { saving: 50 }));
    assert.ok(strong.savePct > weak.savePct + 0.04, `${strong.savePct} vs ${weak.savePct}`);
  });

  test('an undisciplined team hands the other side more man-up chances', () => {
    const sloppy = rosterA.map((player) => ({ ...player, discipline: 45 }));
    const clean = rosterA.map((player) => ({ ...player, discipline: 90 }));
    let sloppyChances = 0;
    let cleanChances = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      sloppyChances += simulateGame({ team: alpha, roster: sloppy }, { team: beta, roster: rosterB }, DEFAULT_TACTICS, DEFAULT_TACTICS, seed).statsB.extraManOpportunities ?? 0;
      cleanChances += simulateGame({ team: alpha, roster: clean }, { team: beta, roster: rosterB }, DEFAULT_TACTICS, DEFAULT_TACTICS, seed).statsB.extraManOpportunities ?? 0;
    }
    assert.ok(sloppyChances > cleanChances * 1.3, `${sloppyChances} vs ${cleanChances}`);
  });
});

describe('no scheme to always run', () => {
  // Same matchup, same seeds: each candidate against a field of opponent schemes, compared with the default scheme.
  const rosterA = generateRoster(alpha, 'scheme-field');
  const rosterB = generateRoster(beta, 'scheme-field');
  const GAMES_PER_PAIR = 250;
  const opponents: Tactics[] = OFFENSE_SETS.flatMap((offenseSet) =>
    DEFENSE_PACKAGES.map((defensePackage) => ({ ...DEFAULT_TACTICS, offenseSet, defensePackage })),
  );

  function winRate(tactics: Tactics, opponent: Tactics): number {
    let wins = 0;
    for (let i = 0; i < GAMES_PER_PAIR; i += 1) {
      const result = simulateGame({ team: alpha, roster: rosterA }, { team: beta, roster: rosterB }, tactics, opponent, i * 31 + 5, { homeAdvantageForA: i % 2 === 0 });
      if (result.scoreA > result.scoreB) wins += 1;
    }
    return wins / GAMES_PER_PAIR;
  }

  const baseline = opponents.map((opponent) => winRate(DEFAULT_TACTICS, opponent));
  const candidates: Record<string, Tactics> = {
    'all aggressive': { tempo: 'fast', rideClear: 'aggressive', slideAggression: 'late', offenseSet: 'invert', defensePackage: 'pressure' },
    'all patient': { tempo: 'slow', rideClear: 'conservative', slideAggression: 'normal', offenseSet: 'motion', defensePackage: 'zone' },
    motion: { ...DEFAULT_TACTICS, offenseSet: 'motion' },
    invert: { ...DEFAULT_TACTICS, offenseSet: 'invert' },
    crease: { ...DEFAULT_TACTICS, offenseSet: 'crease' },
    zone: { ...DEFAULT_TACTICS, defensePackage: 'zone' },
    pressure: { ...DEFAULT_TACTICS, defensePackage: 'pressure' },
    'motion zone early': { ...DEFAULT_TACTICS, offenseSet: 'motion', defensePackage: 'zone', slideAggression: 'early' },
  };

  for (const [name, tactics] of Object.entries(candidates)) {
    test(`${name} has an opponent it gains little or nothing against`, () => {
      const edges = opponents.map((opponent, index) => winRate(tactics, opponent) - baseline[index]);
      const worst = Math.min(...edges);
      assert.ok(worst <= 0.05, `${name} beats default by at least ${(worst * 100).toFixed(1)} pp against every opponent`);
    });
  }
});

describe('fatigue and the late game', () => {
  test('wear builds through the game and costs more at a fast pace', () => {
    assert.strictEqual(fatigueWear(0, 1, DEFAULT_TACTICS), 0);
    const half = fatigueWear(1800, 1, DEFAULT_TACTICS);
    const full = fatigueWear(3600, 1, DEFAULT_TACTICS);
    assert.ok(half > 0 && full > half * 2, 'wear should build faster late');
    assert.ok(fatigueWear(3600, 1, { ...DEFAULT_TACTICS, tempo: 'fast' }) > full);
    assert.ok(fatigueWear(3600, 1, { ...DEFAULT_TACTICS, tempo: 'slow' }) < full);
    assert.ok(fatigueWear(3600, 0.6, DEFAULT_TACTICS) < full);
  });

  test('a lead late means stalling, a deficit late means hurrying, earlier nothing changes', () => {
    const neutral = lateGameAdjustment(2, 900);
    assert.strictEqual(neutral.setupScale, 1);
    const ahead = lateGameAdjustment(2, 200);
    const behind = lateGameAdjustment(-2, 200);
    assert.ok(ahead.setupScale > 1 && ahead.shotAttemptDelta < 0);
    assert.ok(behind.setupScale < 1 && behind.turnoverDelta > 0);
    assert.strictEqual(lateGameAdjustment(0, 100).setupScale, 1);
  });

  test('a team with fresher legs and a real second line wins more', () => {
    const rosterA = generateRoster(alpha, 'legs');
    const rosterB = generateRoster(beta, 'legs');
    const startersA = programStarters(rosterA);
    const startersB = programStarters(rosterB);
    const withStamina = (stamina: number) => rosterA.map((player) => ({ ...player, stamina }));
    let fresh = 0;
    let tired = 0;
    const games = 1500;
    for (let seed = 1; seed <= games; seed += 1) {
      const opts = { homeAdvantageForA: seed % 2 === 0 };
      const opponent = { team: beta, roster: rosterB, starterIds: startersB };
      const freshResult = simulateGame({ team: alpha, roster: withStamina(92), starterIds: startersA }, opponent, DEFAULT_TACTICS, DEFAULT_TACTICS, seed, opts);
      if (freshResult.scoreA > freshResult.scoreB) fresh += 1;
      const tiredResult = simulateGame({ team: alpha, roster: withStamina(45), starterIds: startersA }, opponent, DEFAULT_TACTICS, DEFAULT_TACTICS, seed, opts);
      if (tiredResult.scoreA > tiredResult.scoreB) tired += 1;
    }
    assert.ok(fresh > tired + games * 0.015, `fresh legs won ${fresh}, tired legs ${tired} of ${games}`);
  });
});

describe('weekly installs', () => {
  const installRates = (fatigue: number) => {
    const roster = generateRoster(alpha, 'installs');
    const starters = programStarters(roster);
    const opponents = (leagueData.teams as Team[]).slice(40, 70);
    return (['OFFENSE', 'DEFENSE', 'CONDITIONING', 'DISCIPLINE'] as const).map((focus) => {
      const plan = buildCoachGamePlan({ baseTactics: DEFAULT_TACTICS, practiceFocus: focus, fatigue, archetype: 'RECRUITER', coachSkill: 72 });
      let wins = 0;
      let games = 0;
      for (const opponent of opponents) {
        const opponentRoster = generateRoster(opponent, 'installs');
        const opponentStarters = programStarters(opponentRoster);
        for (let seed = 1; seed <= 60; seed += 1) {
          const result = simulateGame(
            { team: alpha, roster, starterIds: starters, gameplan: plan.modifiers },
            { team: opponent, roster: opponentRoster, starterIds: opponentStarters },
            plan.tactics,
            programTactics(opponent),
            seed,
            { homeAdvantageForA: seed % 2 === 0 },
          );
          if (result.scoreA > result.scoreB) wins += 1;
          games += 1;
        }
      }
      return { focus, rate: wins / games };
    });
  };

  test('no install is a clear best on game day', () => {
    const rates = installRates(30);
    const spread = Math.max(...rates.map((row) => row.rate)) - Math.min(...rates.map((row) => row.rate));
    assert.ok(spread <= 0.06, `installs span ${(spread * 100).toFixed(1)} pp: ${JSON.stringify(rates)}`);
  });

  test('with fresh legs, each working install outplays a conditioning week', () => {
    // Conditioning is the recovery week: running it every week should not be the best plan.
    const rates = installRates(20);
    const conditioning = rates.find((row) => row.focus === 'CONDITIONING')!.rate;
    rates
      .filter((row) => row.focus !== 'CONDITIONING')
      .forEach((row) => assert.ok(row.rate > conditioning, `${row.focus} ${row.rate} vs conditioning ${conditioning}`));
  });
});

describe('home field by program', () => {
  test('a bigger program has a bigger home crowd', () => {
    assert.ok(homeFieldScale(90) > homeFieldScale(68));
    assert.ok(homeFieldScale(68) > homeFieldScale(48));
    assert.ok(Math.abs(homeFieldScale(66) - 1.04) < 0.05, 'a mid-table program is about average');
  });
});
