import assert from 'node:assert';
import { test } from 'node:test';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { leagueReducer } from '../league/leagueSlice.ts';
import { seasonReducer, startPlayoffs } from '../season/seasonSlice.ts';
import { coachReducer, setCoachProfile, completeCareerSetup, careerSetupFromPrestige, processSigningDay, declineAllJobOffers, setAutoRecruiting } from './coachSlice.ts';
import { exhibitionReducer } from '../exhibition/exhibitionSlice.ts';
import { beginFirstSeason, runCareerWeeklyCycle, simCareerConferenceChampionships, simCareerPlayoffRound, processSeasonEnd, beginNextCareerSeason, initializeManagedRoster } from './careerThunks.ts';
import { positionOverall } from '../../sim/positionRatings.ts';

/** Play `seasons` full seasons at the same program, recruiting through the staff or not at all. */
async function career(recruits: boolean, seasons: number) {
  const store = configureStore({
    reducer: combineReducers({ league: leagueReducer, season: seasonReducer, coach: coachReducer, exhibition: exhibitionReducer }),
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
  const team = [...store.getState().league.teams].sort((a, b) => a.prestige - b.prestige)[40];
  store.dispatch(setCoachProfile({ name: 'R', almaMater: 'U', archetype: 'DEVELOPER', age: 40, skill: 72 }));
  store.dispatch(completeCareerSetup({ teamId: team.id, seasonYear: 1, ...careerSetupFromPrestige(team.prestige) }));
  await store.dispatch(initializeManagedRoster());
  if (recruits) store.dispatch(setAutoRecruiting(true));
  await store.dispatch(beginFirstSeason({ seed: 2026 }));
  for (let season = 0; season < seasons; season += 1) {
    for (let week = 0; week < 12; week += 1) await store.dispatch(runCareerWeeklyCycle());
    await store.dispatch(simCareerConferenceChampionships());
    await store.dispatch(startPlayoffs());
    for (let round = 0; round < 4; round += 1) await store.dispatch(simCareerPlayoffRound());
    await store.dispatch(processSigningDay());
    await store.dispatch(processSeasonEnd());
    if (store.getState().coach.pendingJobOffers.length > 0) store.dispatch(declineAllJobOffers());
    await store.dispatch(beginNextCareerSeason());
  }
  const roster = store.getState().coach.managedRoster ?? [];
  // Real strength, from the traits a player plays with, not the overall he is listed at.
  return { roster, average: roster.reduce((sum, player) => sum + positionOverall(player), 0) / roster.length };
}

test('recruiting matters: a coach who never recruits falls well behind one whose staff does', async () => {
  const idle = await career(false, 4);
  const recruiting = await career(true, 4);
  // After four classes the idle roster is all walk-ons, a step below the program's recruits.
  assert.ok(recruiting.average - idle.average >= 4, `staff-recruited roster ${recruiting.average.toFixed(1)} vs walk-on roster ${idle.average.toFixed(1)}`);
  // And walk-ons are listed at what their traits make them: no hidden edge.
  for (const player of idle.roster) assert.strictEqual(player.overall, positionOverall(player), `${player.name} is listed off his traits`);
});
