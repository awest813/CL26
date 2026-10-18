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

const rootReducer = combineReducers({
  league: leagueReducer,
  season: seasonReducer,
  coach: coachReducer,
  exhibition: exhibitionReducer,
});

const persistConfig = {
  key: 'root',
  storage,
  version: 2,
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
    },
    { debug: false },
  ),
  whitelist: ['season', 'coach'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
