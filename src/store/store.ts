import { combineReducers, configureStore } from '@reduxjs/toolkit';
import storageEngine from 'redux-persist/es/storage';

type PersistStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

/** Vite can wrap the CJS storage engine so getItem/setItem are not own functions. */
function resolvePersistStorage(candidate: unknown): PersistStorage {
  if (candidate && typeof (candidate as PersistStorage).getItem === 'function' && typeof (candidate as PersistStorage).setItem === 'function') {
    return candidate as PersistStorage;
  }
  const nested = candidate && typeof candidate === 'object' && 'default' in candidate
    ? (candidate as { default: unknown }).default
    : undefined;
  if (nested && typeof (nested as PersistStorage).getItem === 'function' && typeof (nested as PersistStorage).setItem === 'function') {
    return nested as PersistStorage;
  }
  throw new Error('Persist storage is unavailable.');
}

const storage = resolvePersistStorage(storageEngine);
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
import type { ProgramLedger, Team } from '../types/sim';

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
  version: 3,
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
