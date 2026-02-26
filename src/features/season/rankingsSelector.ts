import { createSelector } from '@reduxjs/toolkit';
import { selectTeams } from '../league/leagueSlice';
import { selectTeamRecords } from './seasonSlice';
import { computeRankings } from '../../sim/rankings';

// This selector depends on teams and records, which are also selectors or state.
export const selectTop25 = createSelector(
  [selectTeams, selectTeamRecords],
  (teams, records) => {
    // Top 25 is arbitrary, but we use 25 here.
    return computeRankings(teams, records, 25);
  }
);
