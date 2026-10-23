import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface SettingsState {
  confirmPlay: boolean;
  showWinChance: boolean;
  /** Missing on saves from before themes existed: treat as 'system'. */
  theme?: ThemePreference;
}

const initialState: SettingsState = {
  confirmPlay: false,
  showWinChance: true,
  theme: 'system',
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
  },
});

export function confirmPlayCopy(kind: 'week' | 'round', label: string): string {
  if (kind === 'week') return `Play ${label}? The full slate is simulated.`;
  return `${label}? That round is simulated.`;
}

export const { setConfirmPlay, setShowWinChance, setTheme } = settingsSlice.actions;

/** Put the theme on the page: a set data-theme wins over the system setting; 'system' clears it. */
export function applyTheme(theme: ThemePreference | undefined): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!theme || theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
export const settingsReducer = settingsSlice.reducer;
