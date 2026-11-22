import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { cleanTeamOverride, type TeamOverride } from '../../sim/teamOverrides';

export type ThemePreference = 'system' | 'light' | 'dark';
/** How your game is shown after you play it: all at once, or goal by goal. */
export type GameReveal = 'instant' | 'quick' | 'full';
export type DisplayDensity = 'comfortable' | 'compact';

/** Milliseconds between goals while a game is revealed. */
export const REVEAL_MS_PER_GOAL: Record<Exclude<GameReveal, 'instant'>, number> = { quick: 350, full: 900 };

export interface SettingsState {
  confirmPlay: boolean;
  showWinChance: boolean;
  /** Missing on saves from before themes existed: treat as 'system'. */
  theme?: ThemePreference;
  /** Missing on older saves: treat as 'instant'. */
  gameReveal?: GameReveal;
  /** Missing on older saves: treat as 'comfortable'. */
  density?: DisplayDensity;
  /** The user's renames and logo choices, by team id. They survive a reset of the career. */
  teamOverrides?: Record<string, TeamOverride>;
}

const initialState: SettingsState = {
  confirmPlay: false,
  showWinChance: true,
  theme: 'system',
  gameReveal: 'instant',
  density: 'comfortable',
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setConfirmPlay: (state, action: PayloadAction<boolean>) => {
      state.confirmPlay = action.payload;
    },
    setShowWinChance: (state, action: PayloadAction<boolean>) => {
      state.showWinChance = action.payload;
    },
    setTheme: (state, action: PayloadAction<ThemePreference>) => {
      state.theme = action.payload;
    },
    setGameReveal: (state, action: PayloadAction<GameReveal>) => {
      state.gameReveal = action.payload;
    },
    setDensity: (state, action: PayloadAction<DisplayDensity>) => {
      state.density = action.payload;
    },
    /** Save a team's edits (callers validate first). An edit with nothing left in it is removed. */
    setTeamOverride: (state, action: PayloadAction<{ teamId: string; override: TeamOverride }>) => {
      const clean = cleanTeamOverride(action.payload.override);
      const overrides = { ...(state.teamOverrides ?? {}) };
      if (Object.keys(clean).length === 0) delete overrides[action.payload.teamId];
      else overrides[action.payload.teamId] = clean;
      state.teamOverrides = overrides;
    },
    clearTeamOverride: (state, action: PayloadAction<string>) => {
      if (!state.teamOverrides) return;
      const overrides = { ...state.teamOverrides };
      delete overrides[action.payload];
      state.teamOverrides = overrides;
    },
    clearAllTeamOverrides: (state) => {
      state.teamOverrides = {};
    },
  },
});

export function confirmPlayCopy(kind: 'week' | 'round', label: string): string {
  if (kind === 'week') return `Play ${label}? The full slate is simulated.`;
  return `${label}? That round is simulated.`;
}

export const { setConfirmPlay, setShowWinChance, setTheme, setGameReveal, setDensity, setTeamOverride, clearTeamOverride, clearAllTeamOverrides } = settingsSlice.actions;

/** Put the theme on the page: a set data-theme wins over the system setting; 'system' clears it. */
export function applyTheme(theme: ThemePreference | undefined): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!theme || theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/** Put the density on the page; comfortable is the default and clears it. */
export function applyDensity(density: DisplayDensity | undefined): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (density === 'compact') root.dataset.density = 'compact';
  else delete root.dataset.density;
}

export const settingsReducer = settingsSlice.reducer;
