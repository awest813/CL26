import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Player, Recruit } from '../../types/sim';
import { RootState } from '../../store/store';
import { generateRoster } from '../../sim/generateRoster';
import { processTeamOffseason, generateCPURecruitingClass } from '../../sim/rosterManagement';

interface RosterState {
    rosters: Record<string, Player[]>;
}

const initialState: RosterState = {
    rosters: {},
};

export const initializeRosters = createAsyncThunk(
    'roster/initializeRosters',
    async ({ seed }: { seed: number }, { getState }) => {
        const state = getState() as RootState;
        const teams = state.league.teams;
        const existingRosters = state.roster.rosters;

        const newRosters: Record<string, Player[]> = {};
        let generated = false;

        teams.forEach(team => {
            if (!existingRosters[team.id]) {
                // Generate initial roster
                // Use a stable seed based on input seed + team id
                const teamSeed = `init-${seed}-${team.id}`;
                newRosters[team.id] = generateRoster(team, teamSeed);
                generated = true;
            }
        });

        if (!generated) return null; // No changes needed

        return newRosters;
    }
);

export const advanceRosters = createAsyncThunk(
    'roster/advanceRosters',
    async ({ userTeamId, userRecruits, seed }: { userTeamId: string | null; userRecruits: Recruit[]; seed: number }, { getState }) => {
        const state = getState() as RootState;
        const teams = state.league.teams;
        const currentRosters = state.roster.rosters;

        const nextRosters: Record<string, Player[]> = {};

        teams.forEach((team, index) => {
            const currentRoster = currentRosters[team.id] || generateRoster(team, `fallback-${seed}-${team.id}`);
            let recruits: Recruit[] = [];

            if (team.id === userTeamId) {
                recruits = userRecruits;
            } else {
                // CPU Recruiting
                recruits = generateCPURecruitingClass(team, seed + index * 100);
            }

            nextRosters[team.id] = processTeamOffseason(team, currentRoster, recruits, seed + index * 50);
        });

        return nextRosters;
    }
);

const rosterSlice = createSlice({
    name: 'roster',
    initialState,
    reducers: {
        setRosters: (state, action: PayloadAction<Record<string, Player[]>>) => {
            state.rosters = { ...state.rosters, ...action.payload };
        },
        resetRosters: () => initialState,
    },
    extraReducers: (builder) => {
        builder.addCase(initializeRosters.fulfilled, (state, action) => {
            if (action.payload) {
                state.rosters = { ...state.rosters, ...action.payload };
            }
        });
        builder.addCase(advanceRosters.fulfilled, (state, action) => {
            state.rosters = action.payload;
        });
        builder.addCase('season/resetSeason', (state) => {
            state.rosters = {};
        });
    },
});

export const { setRosters, resetRosters } = rosterSlice.actions;
export const rosterReducer = rosterSlice.reducer;

export const selectRoster = (state: RootState, teamId: string) => state.roster.rosters[teamId] || [];

export const selectRosterStats = (state: RootState, teamId: string) => {
    const roster = selectRoster(state, teamId);
    if (roster.length === 0) return { overall: 0, size: 0 };

    const overall = Math.round(roster.reduce((sum, p) => sum + p.overall, 0) / roster.length);
    return { overall, size: roster.length };
};
