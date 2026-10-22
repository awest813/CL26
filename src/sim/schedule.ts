import type { Conference, ScheduledGame, Team } from '../types/sim.ts';
import { makeRng } from './rng.ts';
import { buildRivalries, RIVALRY_WEEK_INDEX } from './rivalries.ts';

const TOTAL_WEEKS = 12;
/** How strongly the open non-conference weeks favor an opponent from the same region. */
const REGIONAL_PREFERENCE = 0.1;

function gameId(weekIndex: number, home: string, away: string): string {
  return `w${weekIndex}-${home}-vs-${away}`;
}

function rotateRoundRobin(teamIds: string[]): string[][] {
  const teams = [...teamIds];
  const rounds: string[][] = [];

  for (let round = 0; round < teams.length - 1; round += 1) {
    const pairings: string[] = [];
    for (let i = 0; i < teams.length / 2; i += 1) {
      pairings.push(`${teams[i]}|${teams[teams.length - 1 - i]}`);
    }
    rounds.push(pairings);

    const fixed = teams[0];
    const rest = teams.slice(1);
    rest.unshift(rest.pop() as string);
    teams.splice(0, teams.length, fixed, ...rest);
  }

  return rounds;
}

function buildConferenceWeeks(teams: Team[], conferences: Conference[], rng: () => number): ScheduledGame[][] {
  const weeks = Array.from({ length: TOTAL_WEEKS }, () => [] as ScheduledGame[]);

  conferences.forEach((conference) => {
    const confTeams = teams.filter((team) => team.conferenceId === conference.id).map((team) => team.id);
    const rounds = rotateRoundRobin(confTeams);

    rounds.forEach((roundGames, roundIndex) => {
      roundGames.forEach((pair) => {
        const [a, b] = pair.split('|');
        const homeTeamId = rng() < 0.5 ? a : b;
        const awayTeamId = homeTeamId === a ? b : a;

        weeks[roundIndex].push({
          id: gameId(roundIndex, homeTeamId, awayTeamId),
          weekIndex: roundIndex,
          homeTeamId,
          awayTeamId,
          conferenceGame: true,
        });
      });
    });
  });

  return weeks;
}

function tryBuildWeekMatchups(
  weekIndex: number,
  teams: Team[],
  playedOpponents: Map<string, Set<string>>,
  homeCounts: Map<string, number>,
  rng: () => number,
): ScheduledGame[] | null {
  const teamIds = teams.map((team) => team.id);
  const confByTeam = new Map(teams.map((team) => [team.id, team.conferenceId]));
  const regionByTeam = new Map(teams.map((team) => [team.id, team.region]));
  const scheduled: [string, string][] = [];
  const used = new Set<string>();

  function candidatesFor(teamId: string): string[] {
    return teamIds.filter((candidate) => {
      if (candidate === teamId) return false;
      if (used.has(candidate)) return false;
      if (confByTeam.get(candidate) === confByTeam.get(teamId)) return false;
      if (playedOpponents.get(teamId)?.has(candidate)) return false;
      return true;
    });
  }

  function recurse(): boolean {
    if (used.size === teamIds.length) return true;

    const available = teamIds.filter((id) => !used.has(id));
    available.sort((a, b) => candidatesFor(a).length - candidatesFor(b).length);
    const teamId = available[0];
    const candidates = candidatesFor(teamId);

    if (candidates.length === 0) return false;

    // Mostly regional: neighbors from other conferences are tried first, in a shuffled order,
    // with enough noise that some games still cross the country.
    const order = new Map(candidates.map((candidate) => [
      candidate,
      (regionByTeam.get(candidate) === regionByTeam.get(teamId) ? REGIONAL_PREFERENCE : 0) + rng(),
    ]));
    candidates.sort((a, b) => (order.get(b) ?? 0) - (order.get(a) ?? 0));

    for (const opponent of candidates) {
      used.add(teamId);
      used.add(opponent);
      scheduled.push([teamId, opponent]);

      if (recurse()) return true;

      scheduled.pop();
      used.delete(opponent);
      used.delete(teamId);
    }

    return false;
  }

  if (!recurse()) {
    return null;
  }

  return scheduled.map(([a, b]) => {
    const homeA = homeCounts.get(a) ?? 0;
    const homeB = homeCounts.get(b) ?? 0;

    let homeTeamId = a;
    let awayTeamId = b;

    if (homeB < homeA || (homeA === homeB && rng() < 0.5)) {
      homeTeamId = b;
      awayTeamId = a;
    }

    homeCounts.set(homeTeamId, (homeCounts.get(homeTeamId) ?? 0) + 1);

    return {
      id: gameId(weekIndex, homeTeamId, awayTeamId),
      weekIndex,
      homeTeamId,
      awayTeamId,
      conferenceGame: false,
    };
  });
}

export function generateSeasonSchedule(teams: Team[], conferences: Conference[], seed: number): ScheduledGame[][] {
  const rng = makeRng(seed);
  const weeks = buildConferenceWeeks(teams, conferences, rng);

  const playedOpponents = new Map<string, Set<string>>();
  teams.forEach((team) => playedOpponents.set(team.id, new Set()));

  const homeCounts = new Map<string, number>();
  teams.forEach((team) => homeCounts.set(team.id, 0));

  for (let week = 0; week < 7; week += 1) {
    weeks[week].forEach((game) => {
      playedOpponents.get(game.homeTeamId)?.add(game.awayTeamId);
      playedOpponents.get(game.awayTeamId)?.add(game.homeTeamId);
      homeCounts.set(game.homeTeamId, (homeCounts.get(game.homeTeamId) ?? 0) + 1);
    });
  }

  // Rivals meet in the last week, so the open non-conference weeks must not pair them first.
  const rivalries = buildRivalries(teams);
  rivalries.forEach(({ teamIds: [a, b] }) => {
    playedOpponents.get(a)?.add(b);
    playedOpponents.get(b)?.add(a);
  });

  for (let week = 7; week < TOTAL_WEEKS; week += 1) {
    if (week === RIVALRY_WEEK_INDEX) continue;
    let created: ScheduledGame[] | null = null;

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const playedClone = new Map<string, Set<string>>();
      playedOpponents.forEach((set, teamId) => playedClone.set(teamId, new Set(set)));
      const homeClone = new Map(homeCounts);

      const weekGames = tryBuildWeekMatchups(week, teams, playedClone, homeClone, rng);
      if (!weekGames) continue;

      weekGames.forEach((game) => {
        playedClone.get(game.homeTeamId)?.add(game.awayTeamId);
        playedClone.get(game.awayTeamId)?.add(game.homeTeamId);
      });

      created = weekGames;
      playedOpponents.clear();
      playedClone.forEach((set, teamId) => playedOpponents.set(teamId, set));
      homeCounts.clear();
      homeClone.forEach((count, teamId) => homeCounts.set(teamId, count));
      break;
    }

    if (!created) {
      throw new Error(`Unable to build non-conference schedule for week ${week}`);
    }

    weeks[week] = created;
  }

  weeks[RIVALRY_WEEK_INDEX] = buildRivalryWeek(teams, rivalries, playedOpponents, homeCounts, rng);

  const errors = validateSchedule(weeks, teams);
  if (errors.length > 0) {
    throw new Error(`Generated invalid schedule:\n${errors.join('\n')}`);
  }

  return weeks;
}

/** Every rivalry game, plus random non-conference games for any program without a rival. */
function buildRivalryWeek(
  teams: Team[],
  rivalries: ReturnType<typeof buildRivalries>,
  playedOpponents: Map<string, Set<string>>,
  homeCounts: Map<string, number>,
  rng: () => number,
): ScheduledGame[] {
  const games: ScheduledGame[] = rivalries.map(({ teamIds: [a, b], trophy }) => {
    // The program with fewer home games hosts; a tie goes to a coin flip.
    const homeA = homeCounts.get(a) ?? 0;
    const homeB = homeCounts.get(b) ?? 0;
    const aHosts = homeA < homeB || (homeA === homeB && rng() < 0.5);
    const homeTeamId = aHosts ? a : b;
    const awayTeamId = aHosts ? b : a;
    homeCounts.set(homeTeamId, (homeCounts.get(homeTeamId) ?? 0) + 1);
    return {
      id: gameId(RIVALRY_WEEK_INDEX, homeTeamId, awayTeamId),
      weekIndex: RIVALRY_WEEK_INDEX,
      homeTeamId,
      awayTeamId,
      conferenceGame: false,
      rivalryTrophy: trophy,
    };
  });

  const paired = new Set(rivalries.flatMap((rivalry) => rivalry.teamIds));
  const unpaired = teams.filter((team) => !paired.has(team.id));
  if (unpaired.length > 0) {
    const extra = tryBuildWeekMatchups(RIVALRY_WEEK_INDEX, unpaired, playedOpponents, homeCounts, rng);
    if (!extra) throw new Error('Unable to schedule the programs without a rival in rivalry week');
    games.push(...extra);
  }
  return games;
}

export function validateSchedule(scheduleByWeek: ScheduledGame[][], teams: Team[]): string[] {
  const errors: string[] = [];

  if (scheduleByWeek.length !== 12) {
    errors.push(`Expected 12 weeks, got ${scheduleByWeek.length}.`);
  }

  const teamIds = teams.map((team) => team.id);
  const seenMatchups = new Set<string>();
  const gamesByTeam = new Map<string, number>();
  const conferenceGamesByTeam = new Map<string, number>();
  const nonConferenceGamesByTeam = new Map<string, number>();
  teamIds.forEach((id) => gamesByTeam.set(id, 0));
  teamIds.forEach((id) => conferenceGamesByTeam.set(id, 0));
  teamIds.forEach((id) => nonConferenceGamesByTeam.set(id, 0));

  scheduleByWeek.forEach((weekGames, weekIndex) => {
    if (weekGames.length !== 64) {
      errors.push(`Week ${weekIndex} expected 64 games, got ${weekGames.length}.`);
    }

    const seenThisWeek = new Set<string>();

    weekGames.forEach((game) => {
      if (seenThisWeek.has(game.homeTeamId) || seenThisWeek.has(game.awayTeamId)) {
        errors.push(`Week ${weekIndex} has team playing twice (${game.homeTeamId} or ${game.awayTeamId}).`);
      }
      seenThisWeek.add(game.homeTeamId);
      seenThisWeek.add(game.awayTeamId);

      const matchupKey = [game.homeTeamId, game.awayTeamId].sort().join('|');
      if (seenMatchups.has(matchupKey)) {
        errors.push(`Duplicate matchup found: ${matchupKey}`);
      }
      seenMatchups.add(matchupKey);

      gamesByTeam.set(game.homeTeamId, (gamesByTeam.get(game.homeTeamId) ?? 0) + 1);
      gamesByTeam.set(game.awayTeamId, (gamesByTeam.get(game.awayTeamId) ?? 0) + 1);
      const gameTypeMap = game.conferenceGame ? conferenceGamesByTeam : nonConferenceGamesByTeam;
      gameTypeMap.set(game.homeTeamId, (gameTypeMap.get(game.homeTeamId) ?? 0) + 1);
      gameTypeMap.set(game.awayTeamId, (gameTypeMap.get(game.awayTeamId) ?? 0) + 1);
    });

    if (seenThisWeek.size !== teamIds.length) {
      errors.push(`Week ${weekIndex} expected ${teamIds.length} team appearances, got ${seenThisWeek.size}.`);
    }
  });

  gamesByTeam.forEach((count, teamId) => {
    if (count !== 12) {
      errors.push(`Team ${teamId} expected 12 games, got ${count}.`);
    }
  });

  conferenceGamesByTeam.forEach((count, teamId) => {
    if (count !== 7) {
      errors.push(`Team ${teamId} expected 7 conference games, got ${count}.`);
    }
  });

  nonConferenceGamesByTeam.forEach((count, teamId) => {
    if (count !== 5) {
      errors.push(`Team ${teamId} expected 5 non-conference games, got ${count}.`);
    }
  });

  return errors;
}
