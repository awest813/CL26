import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { checkStorageAvailable, reportSaveFailure, reportSaveOk } from './saveStatus';
import { SAVE_VERSION } from './saveBackup';
import { createSaveStorage, indexedDbBackend, localStorageBackend, type PersistStorage, type SaveStorage } from './saveStorage';

/** Report every write's outcome, so a failing save is shown to the player instead of only logged. */
function withSaveReporting(base: PersistStorage): PersistStorage {
  return {
    getItem: (key) => base.getItem(key),
    removeItem: (key) => base.removeItem(key),
    setItem: (key, value) => base.setItem(key, value).then(
      (result) => {
        reportSaveOk();
        return result;
      },
      (error: unknown) => {
        reportSaveFailure(error);
        throw error;
      },
    ),
  };
}

const idb = indexedDbBackend();
const baseStorage = createSaveStorage(idb, localStorageBackend());
/** The career's storage: IndexedDB, or localStorage where IndexedDB is unavailable. */
export const saveStorage: SaveStorage = { ...withSaveReporting(baseStorage), location: baseStorage.location };
const storage = saveStorage;
// Without IndexedDB the save depends on localStorage: say so up front if the browser blocks it.
if (!idb) checkStorageAvailable();
import { createMigrate, persistReducer } from 'redux-persist';
import {
  FLUSH,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  REHYDRATE,
} from 'redux-persist';
import { leagueReducer } from '../features/league/leagueSlice';
import { seasonReducer } from '../features/season/seasonSlice';
import { coachReducer } from '../features/coach/coachSlice';
import { exhibitionReducer } from '../features/exhibition/exhibitionSlice';
import { settingsReducer } from '../features/settings/settingsSlice';
import { careerSetupFromPrestige } from '../features/coach/coachSlice';
import { withLeaguePrestige } from '../sim/programLedger';
import { leaguePrestiges } from '../sim/programExpectations';
import leagueData from '../data/teams128.json';
import type { Player, ProgramLedger, Team } from '../types/sim';
import { rerateAtPosition } from '../sim/positionRatings';

const rootReducer = combineReducers({
  league: leagueReducer,
  season: seasonReducer,
  coach: coachReducer,
  exhibition: exhibitionReducer,
  settings: settingsReducer,
});

const persistConfig = {
  key: 'root',
  storage,
  // Bump SAVE_VERSION (saveBackup.ts) with each new migration below.
  version: SAVE_VERSION,
  migrate: createMigrate(
    {
      1: (state) => {
        if (!state || typeof state !== 'object') return state;
        const persisted = state as typeof state & {
          coach?: { onboardingStep?: string; selectedTeamId?: string | null };
        };
        const coach = persisted.coach;
        if (coach?.onboardingStep === 'READY' && !coach.selectedTeamId) {
          return {
            ...persisted,
            coach: { ...coach, onboardingStep: 'PROFILE' },
          };
        }
        return state;
      },
      2: (state) => {
        if (!state || typeof state !== 'object') return state;
        const persisted = state as typeof state & {
          coach?: { onboardingStep?: string };
        };
        const coach = persisted.coach;
        if (!coach?.onboardingStep) return state;
        if (coach.onboardingStep === 'TEAM') {
          return { ...persisted, coach: { ...coach, onboardingStep: 'PROFILE' } };
        }
        if (coach.onboardingStep === 'COMPLETE') {
          return { ...persisted, coach: { ...coach, onboardingStep: 'READY' } };
        }
        return state;
      },
      // Situations and win targets are now read off the program's rank in the league, not flat
      // prestige buckets: recompute them for a career in progress.
      3: (state) => {
        if (!state || typeof state !== 'object') return state;
        const persisted = state as typeof state & {
          coach?: { selectedTeamId?: string | null; careerTier?: string | null; programPrestigeDrift?: number };
          season?: { programLedger?: ProgramLedger };
        };
        const coach = persisted.coach;
        if (!coach?.selectedTeamId || !coach.careerTier) return state;
        const league = withLeaguePrestige(
          leagueData.teams as Team[],
          persisted.season?.programLedger,
          coach.selectedTeamId,
          coach.programPrestigeDrift ?? 0,
        );
        const team = league.find((row) => row.id === coach.selectedTeamId);
        if (!team) return state;
        return { ...persisted, coach: { ...coach, ...careerSetupFromPrestige(team.prestige, leaguePrestiges(league)) } };
      },
      // Overall is now weighted by position (a goalie's saves, a defenseman's defense). Re-rate the
      // coach's players, moving each one's potential by the same amount so his room to grow holds.
      4: (state) => {
        if (!state || typeof state !== 'object') return state;
        const persisted = state as typeof state & {
          coach?: { managedRoster?: Player[] | null; seasonStartRoster?: { roster: Player[] } | null };
        };
        const coach = persisted.coach;
        if (!coach) return state;
        const rerate = rerateAtPosition;
        return {
          ...persisted,
          coach: {
            ...coach,
            managedRoster: coach.managedRoster ? coach.managedRoster.map(rerate) : coach.managedRoster,
            seasonStartRoster: coach.seasonStartRoster
              ? { ...coach.seasonStartRoster, roster: coach.seasonStartRoster.roster.map(rerate) }
              : coach.seasonStartRoster,
          },
        };
      },
    },
    { debug: false },
  ),
  whitelist: ['season', 'coach', 'settings'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // Dev-only checks. A season's results and stat ledger are large, so warn only on a real stall.
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
        warnAfter: 200,
      },
      immutableCheck: { warnAfter: 200 },
    }),
});

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
