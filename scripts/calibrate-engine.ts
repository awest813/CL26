/**
 * Match-engine calibration report. Plays thousands of seeded games between
 * generated rosters and prints league-wide box-score averages, plus how far
 * tactics and single players move the win rate.
 *
 *   bun scripts/calibrate-engine.ts
 *
 * Deterministic: the same code always prints the same numbers. Compare the
 * output before and after an engine change.
 */
import { simulateGame } from '../src/sim/matchEngine.ts';
import { generateRoster } from '../src/sim/generateRoster.ts';
import { DEFAULT_TACTICS } from '../src/sim/tactics.ts';
import leagueData from '../src/data/teams128.json' with { type: 'json' };
import type { Player, Tactics, Team } from '../src/types/sim.ts';
import { DEFENSE_PACKAGES, OFFENSE_SETS } from '../src/sim/schemeMatchups.ts';

const teams = leagueData.teams as Team[];
const GAMES = 6000;
const SAMPLE = 3000;

function pct(n: number, d: number): string {
  return d > 0 ? (n / d).toFixed(3) : 'n/a';
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

function leagueAverages(): void {
  let played = 0;
  let homeWins = 0;
  let overtime = 0;
  let oneGoal = 0;
  let shots = 0;
  let saves = 0;
  let groundBalls = 0;
  let turnovers = 0;
  let penalties = 0;
  let shotsOnGoal = 0;
  let faceoffs = 0;
  let clearsMade = 0;
  let clearAttempts = 0;
  let extraManGoals = 0;
  let extraManOpportunities = 0;
  let favoriteGames = 0;
  let favoriteWins = 0;
  const scores: number[] = [];
  const margins: number[] = [];

  for (let i = 0; i < GAMES; i += 1) {
    const home = teams[(i * 37) % teams.length];
    const away = teams[(i * 53 + 11) % teams.length];
    if (home.id === away.id) continue;
    const rosterSeed = `calibrate-${i % 5}`;
    const result = simulateGame(
      { team: home, roster: generateRoster(home, rosterSeed) },
      { team: away, roster: generateRoster(away, rosterSeed) },
      DEFAULT_TACTICS,
      DEFAULT_TACTICS,
      i * 7919,
    );
    played += 1;
    scores.push(result.scoreA, result.scoreB);
    const margin = Math.abs(result.scoreA - result.scoreB);
    margins.push(margin);
    if (margin === 1) oneGoal += 1;
    if (result.scoreA > result.scoreB) homeWins += 1;
    if (result.highlights.some((line) => /overtime|sudden-death/i.test(line))) overtime += 1;
    shots += result.statsA.shots + result.statsB.shots;
    saves += result.statsA.saves + result.statsB.saves;
    groundBalls += result.statsA.groundBalls + result.statsB.groundBalls;
    turnovers += result.statsA.turnovers + result.statsB.turnovers;
    penalties += result.statsA.penalties + result.statsB.penalties;
    shotsOnGoal += (result.statsA.shotsOnGoal ?? 0) + (result.statsB.shotsOnGoal ?? 0);
    faceoffs += result.statsA.faceoffsTaken ?? 0;
    clearsMade += (result.statsA.clearsMade ?? 0) + (result.statsB.clearsMade ?? 0);
    clearAttempts += (result.statsA.clearAttempts ?? 0) + (result.statsB.clearAttempts ?? 0);
    extraManGoals += (result.statsA.extraManGoals ?? 0) + (result.statsB.extraManGoals ?? 0);
    extraManOpportunities += (result.statsA.extraManOpportunities ?? 0) + (result.statsB.extraManOpportunities ?? 0);
    const gap = home.prestige - away.prestige;
    if (Math.abs(gap) >= 10) {
      favoriteGames += 1;
      if ((gap > 0) === (result.scoreA > result.scoreB)) favoriteWins += 1;
    }
  }

  scores.sort((a, b) => a - b);
  margins.sort((a, b) => a - b);
  const teamGames = played * 2;
  const goals = scores.reduce((sum, value) => sum + value, 0);

  console.log('League averages (per team per game unless noted)');
  console.table({
    goals: (goals / teamGames).toFixed(2),
    'goals p10–p90': `${quantile(scores, 0.1)}–${quantile(scores, 0.9)}`,
    shots: (shots / teamGames).toFixed(1),
    'shooting pct': pct(goals, shots),
    'shots on goal': (shotsOnGoal / teamGames).toFixed(1),
    'save pct (saves / shots on goal)': pct(saves, shotsOnGoal),
    'faceoffs per game (both teams)': (faceoffs / played).toFixed(1),
    'clear pct': pct(clearsMade, clearAttempts),
    'ground balls': (groundBalls / teamGames).toFixed(1),
    turnovers: (turnovers / teamGames).toFixed(1),
    penalties: (penalties / teamGames).toFixed(2),
    'man-up chances': (extraManOpportunities / teamGames).toFixed(2),
    'man-up conversion': pct(extraManGoals, extraManOpportunities),
    'home win pct': pct(homeWins, played),
    'overtime rate': pct(overtime, played),
    'one-goal games': pct(oneGoal, played),
    'median margin': quantile(margins, 0.5),
    'favorite (10+ prestige) win pct': pct(favoriteWins, favoriteGames),
  });
}

function winRate(roster: Player[], opponentRoster: Player[], home: Team, away: Team, tactics: Tactics): { win: string; goalsFor: string; goalsAgainst: string } {
  let wins = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (let i = 0; i < SAMPLE; i += 1) {
    const result = simulateGame(
      { team: home, roster },
      { team: away, roster: opponentRoster },
      tactics,
      DEFAULT_TACTICS,
      i * 31 + 5,
      { homeAdvantageForA: i % 2 === 0 },
    );
    if (result.scoreA > result.scoreB) wins += 1;
    goalsFor += result.scoreA;
    goalsAgainst += result.scoreB;
  }
  return { win: pct(wins, SAMPLE), goalsFor: (goalsFor / SAMPLE).toFixed(1), goalsAgainst: (goalsAgainst / SAMPLE).toFixed(1) };
}

function sensitivity(): void {
  const byPrestige = [...teams].sort((a, b) => a.prestige - b.prestige);
  const teamA = byPrestige[64];
  const teamB = byPrestige[65];
  const rosterA = generateRoster(teamA, 'calibrate-sensitivity');
  const rosterB = generateRoster(teamB, 'calibrate-sensitivity');

  const schemes: Record<string, Tactics> = {
    default: DEFAULT_TACTICS,
    'tempo fast': { ...DEFAULT_TACTICS, tempo: 'fast' },
    'offense crease': { ...DEFAULT_TACTICS, offenseSet: 'crease' },
    'offense invert': { ...DEFAULT_TACTICS, offenseSet: 'invert' },
    'defense pressure': { ...DEFAULT_TACTICS, defensePackage: 'pressure' },
    'defense zone': { ...DEFAULT_TACTICS, defensePackage: 'zone' },
    'ride aggressive': { ...DEFAULT_TACTICS, rideClear: 'aggressive' },
    'slide early': { ...DEFAULT_TACTICS, slideAggression: 'early' },
    'all aggressive': { tempo: 'fast', rideClear: 'aggressive', slideAggression: 'late', offenseSet: 'invert', defensePackage: 'pressure' },
  };

  console.log(`\nScheme sensitivity: ${teamA.schoolName} (${teamA.prestige}) vs ${teamB.schoolName} (${teamB.prestige}), opponent on default`);
  console.table(Object.fromEntries(Object.entries(schemes).map(([name, tactics]) => [name, winRate(rosterA, rosterB, teamA, teamB, tactics)])));

  const swap = (position: Player['position'], patch: Partial<Player>) =>
    rosterA.map((player) => (player.position === position ? { ...player, ...patch } : player));
  const players: Record<string, Player[]> = {
    baseline: rosterA,
    'FO faceoff 95': swap('FO', { faceoff: 95 }),
    'FO faceoff 50': swap('FO', { faceoff: 50 }),
    'G saving 95': swap('G', { saving: 95 }),
    'G saving 50': swap('G', { saving: 50 }),
  };

  console.log('\nSingle-position sensitivity (same matchup, default tactics)');
  console.table(Object.fromEntries(Object.entries(players).map(([name, roster]) => [name, winRate(roster, rosterB, teamA, teamB, DEFAULT_TACTICS)])));

  const starIndex = rosterA.findIndex((player) => player.position === 'A');
  const starRoster = rosterA.map((player, index) => (index === starIndex ? { ...player, shooting: 99, IQ: 99 } : player));
  let starGoals = 0;
  for (let i = 0; i < SAMPLE; i += 1) {
    const result = simulateGame({ team: teamA, roster: starRoster }, { team: teamB, roster: rosterB }, DEFAULT_TACTICS, DEFAULT_TACTICS, i);
    starGoals += result.topPlayersA.find((row) => row.playerId === starRoster[starIndex].id)?.goals ?? 0;
  }
  const fieldPlayers = starRoster.filter((player) => player.position === 'A' || player.position === 'M').length;
  console.log(`\n99-shooting attacker: ${(starGoals / SAMPLE).toFixed(2)} goals per game (top-5 box only) among ${fieldPlayers} A/M on the roster`);
}

/**
 * Every scheme against a field of opponent schemes. A scheme's worst-case edge is its
 * win rate minus the default scheme's, against the opponent where that gap is smallest.
 * No scheme should have a large worst-case edge: that would be a scheme to always run.
 */
function schemeSearch(): void {
  const byPrestige = [...teams].sort((a, b) => a.prestige - b.prestige);
  const teamA = byPrestige[64];
  const teamB = byPrestige[65];
  const rosterA = generateRoster(teamA, 'calibrate-sensitivity');
  const rosterB = generateRoster(teamB, 'calibrate-sensitivity');
  let games = 200;

  const all: Tactics[] = [];
  for (const tempo of ['slow', 'normal', 'fast'] as const)
    for (const rideClear of ['conservative', 'balanced', 'aggressive'] as const)
      for (const slideAggression of ['early', 'normal', 'late'] as const)
        for (const offenseSet of OFFENSE_SETS)
          for (const defensePackage of DEFENSE_PACKAGES) all.push({ tempo, rideClear, slideAggression, offenseSet, defensePackage });
  const opponents: Tactics[] = [];
  for (const offenseSet of OFFENSE_SETS)
    for (const defensePackage of DEFENSE_PACKAGES)
      for (const slideAggression of ['early', 'late'] as const)
        opponents.push({ ...DEFAULT_TACTICS, offenseSet, defensePackage, slideAggression });

  const winVs = (tactics: Tactics, opponent: Tactics): number => {
    let wins = 0;
    for (let i = 0; i < games; i += 1) {
      const result = simulateGame({ team: teamA, roster: rosterA }, { team: teamB, roster: rosterB }, tactics, opponent, i * 31 + 5, { homeAdvantageForA: i % 2 === 0 });
      if (result.scoreA > result.scoreB) wins += 1;
    }
    return wins / games;
  };
  const baseline = opponents.map((opponent) => winVs(DEFAULT_TACTICS, opponent));
  const longBaseline = new Map<number, number>();
  const winVsBaseline = (index: number): number => {
    if (!longBaseline.has(index)) longBaseline.set(index, winVs(DEFAULT_TACTICS, opponents[index]));
    return longBaseline.get(index) as number;
  };
  const rows = all.map((tactics) => {
    const edges = opponents.map((opponent, index) => winVs(tactics, opponent) - baseline[index]);
    return { tactics, worst: Math.min(...edges), average: edges.reduce((sum, edge) => sum + edge, 0) / edges.length };
  });
  rows.sort((a, b) => b.worst - a.worst);
  // Re-measure the leaders with more games, so a lucky sample does not top the table.
  games = 2000;
  const leaders = rows.slice(0, 8).map((row) => {
    const edges = opponents.map((opponent, index) => winVs(row.tactics, opponent) - winVsBaseline(index));
    return { tactics: row.tactics, worst: Math.min(...edges), average: edges.reduce((sum, edge) => sum + edge, 0) / edges.length };
  });
  leaders.sort((a, b) => b.worst - a.worst);
  rows.splice(0, 8, ...leaders);
  console.log(`\nScheme search: ${all.length} schemes x ${opponents.length} opponents, 200 games each (top 8 re-run at 2,000). Top 8 by worst-case edge:`);
  console.table(rows.slice(0, 8).map((row) => ({
    scheme: `${row.tactics.tempo}/${row.tactics.rideClear}/${row.tactics.slideAggression}/${row.tactics.offenseSet}/${row.tactics.defensePackage}`,
    worst: row.worst.toFixed(3),
    average: row.average.toFixed(3),
  })));
}

leagueAverages();
sensitivity();
if (process.argv.includes('--schemes')) schemeSearch();
