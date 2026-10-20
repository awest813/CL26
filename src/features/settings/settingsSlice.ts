import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SettingsState {
  confirmPlay: boolean;
  showWinChance: boolean;
}

const initialState: SettingsState = {
  confirmPlay: false,
  showWinChance: true,
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
  },
});

export function confirmPlayCopy(kind: 'week' | 'round', label: string): string {
  if (kind === 'week') return `Play ${label}? The full slate is simulated.`;
  return `${label}? That round is simulated.`;
}

export const { setConfirmPlay, setShowWinChance } = settingsSlice.actions;
export const settingsReducer = settingsSlice.reducer;
