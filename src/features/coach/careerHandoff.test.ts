/**
 * Offseason ceremony handoff: signing day → finalize → (optional job move) → next year.
 * The 20-season regression always declines offers, so the accept path is covered here.
 */
import assert from 'node:assert';
import { describe, test } from 'node:test';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { leagueReducer } from '../league/leagueSlice.ts';
import { seasonReducer, simSeason, startPlayoffs, simNextPlayoffRound } from '../season/seasonSlice.ts';
import { uiReducer } from '../ui/uiSlice.ts';
import { exhibitionReducer } from '../exhibition/exhibitionSlice.ts';
import {
  acceptJobOffer,
  careerSetupFromPrestige,
  coachReducer,
  completeCareerSetup,
  processSigningDay,
  setCoachProfile,
  setPendingJobOffers,
} from './coachSlice.ts';
import { beginFirstSeason, beginNextCareerSeason, initializeManagedRoster, processSeasonEnd } from './careerThunks.ts';
import { careerOffseasonCapabilities } from '../../sim/seasonPhase.ts';

function createStore() {
  return configureStore({
    reducer: combineReducers({
      league: leagueReducer,
      season: seasonReducer,
      coach: coachReducer,
      ui: uiReducer,
      exhibition: exhibitionReducer,
    }),
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
  });
}

type CareerStore = ReturnType<typeof createStore>;

function offseasonCaps(store: CareerStore) {
  const { season, coach } = store.getState();
  return careerOffseasonCapabilities({
    phase: season.phase,
    year: season.year,
    hasSelectedTeam: Boolean(coach.selectedTeamId),
    hasProgramExpectations: Boolean(coach.programExpectations),
    signedRecruitsByYear: coach.signedRecruitsByYear,
    seasonHistory: coach.seasonHistory,
  });
}

/** Play a full year: 12 weeks, bracket to a champion, signing day, finalize. */
async function playThroughOffseason(store: CareerStore) {
  await store.dispatch(beginFirstSeason({ seed: 2026 }));
  await store.dispatch(simSeason());
  await store.dispatch(startPlayoffs());

  let guard = 0;
  while (!store.getState().season.playoffs?.championTeamId && guard < 8) {
    await store.dispatch(simNextPlayoffRound());
    guard += 1;
  }

  await store.dispatch(processSigningDay());
  await store.dispatch(processSeasonEnd());
}

async function setUpCoach(store: CareerStore) {
  const team = [...store.getState().league.teams].sort((a, b) => a.prestige - b.prestige)[40];
  const setup = careerSetupFromPrestige(team.prestige);

  store.dispatch(
    setCoachProfile({ name: 'Handoff Coach', almaMater: 'Test U', archetype: 'TACTICIAN', age: 41, skill: 74 }),
  );
  store.dispatch(
    completeCareerSetup({
      teamId: team.id,
      seasonYear: 1,
      careerTier: setup.careerTier,
      programExpectations: setup.programExpectations,
    }),
  );
  return team;
}

describe('career job-offer handoff', () => {
  test('accepting an offer keeps the offseason handoff unblocked', async () => {
    const store = createStore();
    const startingTeam = await setUpCoach(store);
    await playThroughOffseason(store);

    const finishedYear = store.getState().season.year;
    assert.strictEqual(store.getState().season.phase, 'OFFSEASON');
    assert.ok(offseasonCaps(store).canAdvanceNextYear, 'handoff should be open before the job move');

    const newTeam = store
      .getState()
      .league.teams.find((team) => team.id !== startingTeam.id && team.prestige >= startingTeam.prestige);
    assert.ok(newTeam);
    store.dispatch(setPendingJobOffers([{ teamId: newTeam.id, tier: 'UPGRADE', presentedAtYear: finishedYear }]));

    await store.dispatch(acceptJobOffer(newTeam.id));
    await store.dispatch(initializeManagedRoster());

    const afterMove = store.getState().coach;
    assert.strictEqual(afterMove.selectedTeamId, newTeam.id);
    assert.strictEqual(afterMove.pendingJobOffers.length, 0);
    assert.deepStrictEqual(
      afterMove.signedRecruitsByYear[finishedYear],
      [],
      'the old class must not follow the coach to the new school',
    );

    const caps = offseasonCaps(store);
    assert.ok(caps.canAdvanceNextYear, 'next season must still be reachable after a job move');
    assert.ok(!caps.canProcessSigningDay, 'a resolved signing day must not re-open after a job move');

    const nextSeed = await store.dispatch(beginNextCareerSeason()).unwrap();
    assert.strictEqual(typeof nextSeed, 'number');

    const next = store.getState();
    assert.strictEqual(next.season.phase, 'REGULAR');
    assert.strictEqual(next.season.year, finishedYear + 1);
    assert.ok((next.coach.managedRoster?.length ?? 0) > 0, 'new school should have a roster');
    assert.ok(next.coach.managedRoster?.every((player) => player.id.startsWith(newTeam.id)));
  });

  test('the handoff stays gated until signing day and finalize are both done', async () => {
    const store = createStore();
    await setUpCoach(store);

    await store.dispatch(beginFirstSeason({ seed: 2026 }));
    await store.dispatch(simSeason());
    await store.dispatch(startPlayoffs());
    let guard = 0;
    while (!store.getState().season.playoffs?.championTeamId && guard < 8) {
      await store.dispatch(simNextPlayoffRound());
      guard += 1;
    }

    const beforeCeremony = offseasonCaps(store);
    assert.ok(beforeCeremony.canProcessSigningDay);
    assert.ok(!beforeCeremony.canFinalizeSeason);
    assert.ok(!beforeCeremony.canAdvanceNextYear);
    assert.strictEqual(await store.dispatch(beginNextCareerSeason()).unwrap(), null);

    await store.dispatch(processSigningDay());
    const afterSigning = offseasonCaps(store);
    assert.ok(afterSigning.canFinalizeSeason);
    assert.ok(!afterSigning.canAdvanceNextYear);
    assert.strictEqual(await store.dispatch(beginNextCareerSeason()).unwrap(), null);

    await store.dispatch(processSeasonEnd());
    assert.ok(offseasonCaps(store).canAdvanceNextYear);
  });
});
