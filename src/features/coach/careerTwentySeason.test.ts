/**
 * Headless 20-season head-coach career regression.
 * Mirrors the UI year loop without React or redux-persist.
 */
import assert from 'node:assert';
import { describe, test } from 'node:test';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { leagueReducer } from '../league/leagueSlice.ts';
import { seasonReducer, startPlayoffs, selectTeamRecords } from '../season/seasonSlice.ts';
import {
  coachReducer,
  setCoachProfile,
  completeCareerSetup,
  addRecruitToBoard,
  setRecruitHours,
  setRecruitPitch,
  careerSetupFromPrestige,
  upgradeCoachSkill,
  declineAllJobOffers,
  acceptJobOffer,
  processSigningDay,
} from './coachSlice.ts';
import {
  runCareerWeeklyCycle,
  processSeasonEnd,
  beginFirstSeason,
  beginNextCareerSeason,
  simCareerPlayoffRound,
} from './careerThunks.ts';
import { exhibitionReducer } from '../exhibition/exhibitionSlice.ts';
import { validateSeasonState } from '../../sim/seasonValidation.ts';
import type { RootState } from '../../store/store.ts';
import type { CoachSkillTree, Position } from '../../types/sim.ts';

const REGULAR_WEEKS = 12;
const GAMES_PER_WEEK = 64;

function createCareerStore() {
  return configureStore({
    reducer: combineReducers({
      league: leagueReducer,
      season: seasonReducer,
      coach: coachReducer,
      exhibition: exhibitionReducer,
    }),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
  });
}

type CareerStore = ReturnType<typeof createCareerStore>;

function spendSkillPoints(store: CareerStore) {
  const order: Array<keyof CoachSkillTree> = ['recruiting', 'development', 'operations'];
  let guard = 0;
  while ((store.getState().coach.coachSkillPoints ?? 0) > 0 && guard < 40) {
    const state = store.getState().coach;
    const target = order.find((key) => state.skillTree[key] < 5);
    if (!target) break;
    store.dispatch(upgradeCoachSkill(target));
    guard += 1;
  }
}

async function allocateRecruitingWeek(store: CareerStore) {
  const state = store.getState();
  const coach = state.coach;
  if (!coach.selectedTeamId || coach.recruitPool.length === 0) return;

  const openTargets = coach.recruitPool
    .filter((recruit) => !recruit.committedTeamId)
    .sort((a, b) => b.stars - a.stars || b.potential - a.potential);

  for (const recruit of openTargets) {
    if (store.getState().coach.boardRecruitIds.length >= 8) break;
    if (store.getState().coach.boardRecruitIds.includes(recruit.id)) continue;
    store.dispatch(addRecruitToBoard({ recruitId: recruit.id, startingInterest: 12 + recruit.stars }));
    store.dispatch(setRecruitPitch({ recruitId: recruit.id, pitch: recruit.motivations[0]?.pitch ?? 'PRESTIGE' }));
  }

  const boardIds = store.getState().coach.boardRecruitIds.filter((id) => {
    const recruit = store.getState().coach.recruitPool.find((r) => r.id === id);
    return Boolean(recruit && !recruit.committedTeamId);
  });
  if (boardIds.length === 0) return;

  const hoursEach = Math.floor(120 / boardIds.length);
  for (const recruitId of boardIds) {
    store.dispatch(setRecruitHours({ recruitId, hours: hoursEach }));
  }
}

async function runOneSeason(store: CareerStore, seasonIndex: number, seasonCount: number) {
  const seasonLabel = `season ${seasonIndex + 1}`;
  const ageBefore = store.getState().coach.profile?.age ?? 0;

  for (let week = 0; week < REGULAR_WEEKS; week += 1) {
    await allocateRecruitingWeek(store);
    const result = await store.dispatch(runCareerWeeklyCycle());
    assert.strictEqual(result.payload, 'advanced', `${seasonLabel} week ${week + 1} should advance`);
    spendSkillPoints(store);
  }

  const afterRegular = store.getState();
  assert.strictEqual(afterRegular.season.phase, 'PLAYOFF', `${seasonLabel} should enter PLAYOFF after 12 weeks`);
  assert.strictEqual(afterRegular.season.completedWeeks, REGULAR_WEEKS, `${seasonLabel} completedWeeks`);
  assert.strictEqual(
    afterRegular.season.gameResults.length,
    REGULAR_WEEKS * GAMES_PER_WEEK,
    `${seasonLabel} should play every league game`,
  );
  assert.ok(afterRegular.coach.teamFatigue >= 0 && afterRegular.coach.teamFatigue <= 100, `${seasonLabel} fatigue`);
  assert.strictEqual(
    afterRegular.coach.recruitingWeekIndex,
    REGULAR_WEEKS,
    `${seasonLabel} recruiting weeks should track season weeks`,
  );

  const validationDuringBracketGap = validateSeasonState(afterRegular.season, afterRegular.league.teams);
  assert.strictEqual(
    validationDuringBracketGap.isValid,
    true,
    `${seasonLabel} PLAYOFF-without-bracket should validate: ${validationDuringBracketGap.error}`,
  );

  await store.dispatch(startPlayoffs());
  let playoffGuard = 0;
  while (!store.getState().season.playoffs?.championTeamId && playoffGuard < 8) {
    await store.dispatch(simCareerPlayoffRound());
    playoffGuard += 1;
  }
  const afterPlayoffs = store.getState();
  assert.ok(afterPlayoffs.season.playoffs?.championTeamId, `${seasonLabel} needs a champion`);
  assert.strictEqual(afterPlayoffs.season.phase, 'OFFSEASON', `${seasonLabel} should reach OFFSEASON`);

  await store.dispatch(processSigningDay());
  assert.ok(
    Object.prototype.hasOwnProperty.call(store.getState().coach.signedRecruitsByYear, afterPlayoffs.season.year),
    `${seasonLabel} signing day should resolve (even with 0 signees)`,
  );

  await store.dispatch(processSeasonEnd());
  const afterFinalize = store.getState();
  assert.strictEqual(
    afterFinalize.coach.careerRecord.seasonsCompleted,
    seasonIndex + 1,
    `${seasonLabel} seasonsCompleted`,
  );
  assert.ok(
    afterFinalize.coach.seasonHistory.some((entry) => entry.year === afterPlayoffs.season.year),
    `${seasonLabel} history entry missing`,
  );
  assert.strictEqual(afterFinalize.coach.profile?.age, ageBefore + 1, `${seasonLabel} coach should age one year`);
  assert.ok(afterFinalize.coach.jobSecurity >= 0 && afterFinalize.coach.jobSecurity <= 100);
  assert.ok((afterFinalize.coach.programPrestigeDrift ?? 0) >= -20);
  assert.ok((afterFinalize.coach.programPrestigeDrift ?? 0) <= 30);
  assert.strictEqual(afterFinalize.coach.recruitPool.length, 0, `${seasonLabel} recruiting cleared after finalize`);
  assert.strictEqual(afterFinalize.coach.scholarshipsAvailable, 12);
  assert.ok(afterFinalize.coach.programExpectations, `${seasonLabel} expectations should remain set`);
  assert.ok(afterFinalize.coach.careerTier, `${seasonLabel} career tier should remain set`);

  const treeMaxed = Object.values(afterFinalize.coach.skillTree).every((level) => level >= 5);
  if (treeMaxed) {
    assert.ok(
      afterFinalize.coach.coachSkillPoints <= 2,
      `${seasonLabel} should not stockpile skill points after a maxed tree`,
    );
  }

  if ((afterFinalize.coach.employment ?? 'ACTIVE') === 'FIRED') {
    const landing = afterFinalize.coach.pendingJobOffers[0];
    assert.ok(landing, `${seasonLabel} a firing includes a landing job`);
    await store.dispatch(acceptJobOffer(landing.teamId));
    assert.strictEqual(store.getState().coach.employment, 'ACTIVE');
  } else if (afterFinalize.coach.pendingJobOffers.length > 0) {
    store.dispatch(declineAllJobOffers());
  }

  if (seasonIndex < seasonCount - 1) {
    const yearBefore = afterFinalize.season.year;
    const nextSeed = await store.dispatch(beginNextCareerSeason()).unwrap();
    assert.strictEqual(typeof nextSeed, 'number', `${seasonLabel} beginNextCareerSeason should return seed`);

    const roster = store.getState().coach.managedRoster;
    const starters = new Set(store.getState().coach.starterIds);
    assert.ok(roster && roster.length >= 20 && roster.length <= 24, `${seasonLabel} roster size ${roster?.length}`);
    assert.strictEqual(new Set(roster!.map((player) => player.id)).size, roster!.length, `${seasonLabel} duplicate player ids`);
    assert.ok(roster!.every((player) => player.year >= 1 && player.year <= 4), `${seasonLabel} invalid class years`);
    assert.ok(
      roster!.every((player) => player.age >= 17 && player.age <= 25 && Number.isFinite(player.overall) && player.overall >= 40 && player.overall <= 99),
      `${seasonLabel} roster ratings or ages left the college range`,
    );
    assert.ok([...starters].every((id) => roster!.some((player) => player.id === id)), `${seasonLabel} starter missing from roster`);
    const avgOverall = roster!.reduce((sum, player) => sum + player.overall, 0) / roster!.length;
    assert.ok(avgOverall < 94, `${seasonLabel} roster avg overall ${avgOverall} should stay soft-capped`);

    const positionCounts: Record<Position, number> = { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 };
    for (const player of roster!) positionCounts[player.position] += 1;
    assert.ok(positionCounts.G >= 1, `${seasonLabel} roster missing goalie`);
    assert.ok(positionCounts.FO >= 1, `${seasonLabel} roster missing faceoff`);
    assert.ok(positionCounts.LSM >= 1, `${seasonLabel} roster missing LSM`);
    assert.ok(positionCounts.A >= 3, `${seasonLabel} roster cannot field attack (${positionCounts.A})`);
    assert.ok(positionCounts.M >= 3, `${seasonLabel} roster cannot field midfield (${positionCounts.M})`);
    assert.ok(positionCounts.D >= 3, `${seasonLabel} roster cannot field defense (${positionCounts.D})`);

    const next = store.getState();
    assert.strictEqual(next.season.year, yearBefore + 1, `${seasonLabel} year should increment`);
    assert.strictEqual(next.season.phase, 'REGULAR');
    assert.strictEqual(next.season.seasonSeed, nextSeed);
    assert.strictEqual(next.coach.recruitingSeed, nextSeed);
    assert.strictEqual(next.coach.recruitPool.length, 180);
    assert.strictEqual(next.coach.recruitingWeekIndex, 0);
    assert.ok(!next.season.playoffs, `${seasonLabel} playoffs should clear on new season`);
  }
}

async function runDynasty(seasonCount: number) {
  const store = createCareerStore();
  const teams = store.getState().league.teams;
  assert.strictEqual(teams.length, 128);

  const team = [...teams].sort((a, b) => a.prestige - b.prestige)[40];
  const setup = careerSetupFromPrestige(team.prestige);
  const startingAge = 38;

  store.dispatch(
    setCoachProfile({
      name: 'Regression Coach',
      almaMater: 'Test U',
      archetype: 'DEVELOPER',
      age: startingAge,
      skill: 72,
    }),
  );
  store.dispatch(
    completeCareerSetup({
      teamId: team.id,
      seasonYear: 1,
      careerTier: setup.careerTier,
      programExpectations: setup.programExpectations,
    }),
  );

  const seed = 2026;
  await store.dispatch(beginFirstSeason({ seed }));

  assert.ok(store.getState().coach.managedRoster?.length);
  assert.ok(store.getState().coach.recruitPool.length > 0);
  assert.strictEqual(store.getState().coach.recruitingSeed, seed);
  assert.strictEqual(store.getState().season.phase, 'REGULAR');
  assert.strictEqual(store.getState().season.year, 2026);
  assert.strictEqual(store.getState().season.seasonSeed, seed);

  for (let seasonIndex = 0; seasonIndex < seasonCount; seasonIndex += 1) {
    await runOneSeason(store, seasonIndex, seasonCount);
  }

  const finalState = store.getState();
  const records = selectTeamRecords(finalState as RootState);
  const userRecord = records[team.id];

  assert.strictEqual(finalState.coach.careerRecord.seasonsCompleted, seasonCount);
  assert.strictEqual(finalState.coach.seasonHistory.length, seasonCount);
  assert.strictEqual(finalState.season.year, 2026 + seasonCount - 1);
  assert.strictEqual(finalState.season.phase, 'OFFSEASON');
  assert.strictEqual(finalState.coach.profile?.age, startingAge + seasonCount);
  assert.ok(finalState.coach.careerRecord.totalWins + finalState.coach.careerRecord.totalLosses > 0);
  assert.ok(finalState.coach.coachLevel >= 1);
  assert.ok(finalState.coach.careerRecord.championships <= finalState.coach.careerRecord.playoffAppearances);
  assert.ok(finalState.coach.careerRecord.playoffAppearances <= seasonCount);

  if (finalState.coach.selectedTeamId === team.id) {
    assert.ok(
      finalState.coach.careerTier === 'STABLE' || finalState.coach.careerTier === 'CONTENDER',
      `expected elevated tier after dynasty, got ${finalState.coach.careerTier}`,
    );
    assert.ok(
      (finalState.coach.programExpectations?.winTarget ?? 0) >= 7,
      'win target should rise with program standing',
    );
  } else {
    assert.strictEqual(finalState.coach.employment ?? 'ACTIVE', 'ACTIVE');
    assert.ok(finalState.coach.programExpectations, 'a landing job still has expectations');
  }

  const historyYears = finalState.coach.seasonHistory.map((entry) => entry.year).sort((a, b) => a - b);
  assert.deepStrictEqual(
    historyYears,
    Array.from({ length: seasonCount }, (_, i) => 2026 + i),
  );
  assert.ok(
    finalState.coach.seasonHistory.every((entry) => entry.wins + entry.losses === REGULAR_WEEKS),
    'a season record did not cover 12 games',
  );

  const histWins = finalState.coach.seasonHistory.reduce((sum, entry) => sum + entry.wins, 0);
  const histLosses = finalState.coach.seasonHistory.reduce((sum, entry) => sum + entry.losses, 0);
  assert.strictEqual(finalState.coach.careerRecord.totalWins, histWins);
  assert.strictEqual(finalState.coach.careerRecord.totalLosses, histLosses);

  // Long careers should not be a pure undefeated script after balance soft-caps.
  const perfectSeasons = finalState.coach.seasonHistory.filter((entry) => entry.wins === 12 && entry.losses === 0).length;
  assert.ok(perfectSeasons < seasonCount, 'every season undefeated suggests development soft-caps failed');
  assert.ok(histLosses > 0, 'a century with no losses means the league stopped competing');

  assert.strictEqual((userRecord?.wins ?? 0) + (userRecord?.losses ?? 0), REGULAR_WEEKS);

  const signedYears = Object.keys(finalState.coach.signedRecruitsByYear).map(Number).sort((a, b) => a - b);
  assert.deepStrictEqual(signedYears, historyYears);

  const validation = validateSeasonState(finalState.season, finalState.league.teams);
  assert.strictEqual(validation.isValid, true, validation.error ?? 'final season invalid');
}

describe('head coach career loop', () => {
  test('completes twenty full seasons with stable career state', async () => {
    await runDynasty(20);
  });

  test('completes one hundred full seasons without breaking the league', async () => {
    await runDynasty(100);
  });
});
