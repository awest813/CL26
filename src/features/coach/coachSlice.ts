import { createSelector, createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { CareerRecord, CoachArchetype, JobOffer, Player, PracticeFocus, Recruit, RecruitingPitch, SeasonHistoryEntry, SignedRecruit, Tactics, Team } from '../../types/sim';

import { buildPositionNeedByPosition, generateRecruitPool, generateSuitors, getTeamPitchGrade } from '../../sim/recruiting';
import { simulateRecruitingWeek } from '../../sim/recruitingWeek';
import { resolveSigningDay } from '../../sim/offseason';
import { advanceFatigue, playoffRoundFatigue } from '../../sim/coachEffects';
import { careerOffseasonCapabilities } from '../../sim/seasonPhase';
import { RootState } from '../../store/store';

export const WEEKLY_HOURS_CAP = 120;
export const MAX_HOURS_PER_RECRUIT = 20;
const AD_PRESSURE_DIVISOR = 60;
const MIN_PRESTIGE_DRIFT = -20;
const MAX_PRESTIGE_DRIFT = 30;
const JOB_SECURITY_DECLINE_BONUS = 3;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

const CAREER_TIER_DEFAULTS: Record<'REBUILD' | 'STABLE' | 'CONTENDER', { resources: ProgramResources; adPressure: number }> = {
  // Rebuilds get lower NIL/facility baselines and less pressure to win immediately.
  REBUILD: {
    resources: { nil: 44, boosters: 50, facilities: 46 },
    adPressure: 34,
  },
  // Stable programs have balanced support with moderate pressure.
  STABLE: {
    resources: { nil: 52, boosters: 58, facilities: 56 },
    adPressure: 48,
  },
  // Contenders carry higher support but significantly higher board pressure.
  CONTENDER: {
    resources: { nil: 62, boosters: 72, facilities: 64 },
    adPressure: 64,
  },
};

export interface CoachProfile {
  name: string;
  almaMater: string;
  archetype: CoachArchetype;
  age: number;
  skill: number;
}

export interface ProgramExpectations {
  winTarget: number;
  rankTarget: number;
  securityBaseline: number;
}

export interface CoachSkillTree {
  recruiting: number;
  development: number;
  operations: number;
}

export interface ProgramResources {
  nil: number;
  boosters: number;
  facilities: number;
}

export interface CoachState {
  selectedTeamId: string | null;
  tactics: Tactics;
  profile: CoachProfile | null;
  onboardingStep: 'PROFILE' | 'TEAM' | 'READY' | 'COMPLETE';
  careerTier: 'REBUILD' | 'STABLE' | 'CONTENDER' | null;
  programExpectations: ProgramExpectations | null;
  recruitPool: Recruit[];
  boardRecruitIds: string[];
  recruitingSeed: number;
  recruitingWeekIndex: number;
  weeklyHoursByRecruitId: Record<string, number>;
  activePitchesByRecruitId: Record<string, RecruitingPitch>;
  scholarshipsAvailable: number;
  signedRecruitsByYear: Record<number, SignedRecruit[]>;
  practiceFocus: PracticeFocus;
  teamFatigue: number;
  // Career progression
  jobSecurity: number;
  adPressure: number;
  coachXp: number;
  coachLevel: number;
  coachSkillPoints: number;
  skillTree: CoachSkillTree;
  programResources: ProgramResources;
  programPrestigeDrift: number;
  pendingJobOffers: JobOffer[];
  seasonHistory: SeasonHistoryEntry[];
  careerRecord: CareerRecord;
  // Roster management
  managedRoster: Player[] | null;
  starterIds: string[];
}

const initialState: CoachState = {
  selectedTeamId: null,
  tactics: {
    tempo: 'normal',
    rideClear: 'balanced',
    slideAggression: 'normal',
    offenseSet: 'balanced',
    defensePackage: 'man',
  },
  profile: null,
  onboardingStep: 'PROFILE',
  careerTier: null,
  programExpectations: null,
  recruitPool: [],
  boardRecruitIds: [],
  recruitingSeed: 2026,
  recruitingWeekIndex: 0,
  weeklyHoursByRecruitId: {},
  activePitchesByRecruitId: {},
  scholarshipsAvailable: 12,
  signedRecruitsByYear: {},
  practiceFocus: 'CONDITIONING',
  teamFatigue: 20,
  // Career progression
  jobSecurity: 60,
  adPressure: 45,
  coachXp: 0,
  coachLevel: 1,
  coachSkillPoints: 0,
  skillTree: {
    recruiting: 0,
    development: 0,
    operations: 0,
  },
  programResources: {
    nil: 50,
    boosters: 50,
    facilities: 50,
  },
  programPrestigeDrift: 0,
  pendingJobOffers: [],
  seasonHistory: [],
  careerRecord: {
    totalWins: 0,
    totalLosses: 0,
    playoffAppearances: 0,
    championships: 0,
    seasonsCompleted: 0,
  },
  // Roster management
  managedRoster: null,
  starterIds: [],
};

const coachSlice = createSlice({
  name: 'coach',
  initialState,
  reducers: {
    setSelectedTeam: (state, action: PayloadAction<string | null>) => {
      state.selectedTeamId = action.payload;
    },
    setTactics: (state, action: PayloadAction<Tactics>) => {
      state.tactics = action.payload;
    },
    setCoachProfile: (state, action: PayloadAction<CoachProfile>) => {
        state.profile = action.payload;
        state.onboardingStep = 'TEAM';
    },
    completeCareerSetup: (state, action: PayloadAction<{
        teamId: string;
        seasonYear: number;
        careerTier: 'REBUILD' | 'STABLE' | 'CONTENDER';
        programExpectations: ProgramExpectations;
    }>) => {
        state.selectedTeamId = action.payload.teamId;
        state.careerTier = action.payload.careerTier;
        state.programExpectations = action.payload.programExpectations;
        state.onboardingStep = 'READY'; // Changed to READY as per component check
        // Set job security baseline from expectations
        state.jobSecurity = action.payload.programExpectations.securityBaseline;
        const defaults = CAREER_TIER_DEFAULTS[action.payload.careerTier];
        state.programResources = defaults.resources;
        state.adPressure = defaults.adPressure;
        state.programPrestigeDrift = 0;
        state.pendingJobOffers = [];
    },
    initializeRecruitingBoard: (state, action: PayloadAction<{ seed: number; teams: Team[] }>) => {
        state.recruitingSeed = action.payload.seed;
        const pool = generateRecruitPool(action.payload.seed);

        // Initialize suitors for each recruit
        pool.forEach(recruit => {
            recruit.interestByTeamId = generateSuitors(recruit, action.payload.teams, action.payload.seed);
        });

        state.recruitPool = pool;
        state.boardRecruitIds = [];
        state.weeklyHoursByRecruitId = {};
        state.activePitchesByRecruitId = {};
        state.recruitingWeekIndex = 0;
        state.scholarshipsAvailable = 12;
    },
    addRecruitToBoard: (state, action: PayloadAction<{ recruitId: string; startingInterest: number }>) => {
        if (!state.boardRecruitIds.includes(action.payload.recruitId) && state.boardRecruitIds.length < 25) {
            state.boardRecruitIds.push(action.payload.recruitId);
            state.weeklyHoursByRecruitId[action.payload.recruitId] = 0;

            // Set starting interest if not already tracked
            const recruit = state.recruitPool.find(r => r.id === action.payload.recruitId);
            if (recruit && state.selectedTeamId) {
                 if ((recruit.interestByTeamId[state.selectedTeamId] || 0) < action.payload.startingInterest) {
                     recruit.interestByTeamId[state.selectedTeamId] = action.payload.startingInterest;
                 }
            }
        }
    },
    removeRecruitFromBoard: (state, action: PayloadAction<string>) => {
        state.boardRecruitIds = state.boardRecruitIds.filter(id => id !== action.payload);
        delete state.weeklyHoursByRecruitId[action.payload];
        delete state.activePitchesByRecruitId[action.payload];
    },
    setRecruitHours: (state, action: PayloadAction<{ recruitId: string; hours: number }>) => {
        const { recruitId, hours } = action.payload;

        // Ensure recruit is on the board
        if (!state.boardRecruitIds.includes(recruitId)) {
            return;
        }

        const currentHours = state.weeklyHoursByRecruitId[recruitId] || 0;
        const totalHours = state.boardRecruitIds.reduce((sum, id) => sum + (state.weeklyHoursByRecruitId[id] || 0), 0);
        const hoursWithoutThisRecruit = totalHours - currentHours;

        let validatedHours = Math.max(0, Math.min(MAX_HOURS_PER_RECRUIT, hours));

        if (hoursWithoutThisRecruit + validatedHours > WEEKLY_HOURS_CAP) {
            validatedHours = Math.max(0, WEEKLY_HOURS_CAP - hoursWithoutThisRecruit);
        }

        state.weeklyHoursByRecruitId[recruitId] = validatedHours;
    },
    setRecruitPitch: (state, action: PayloadAction<{ recruitId: string; pitch: RecruitingPitch }>) => {
        if (!state.boardRecruitIds.includes(action.payload.recruitId)) {
            return;
        }
        state.activePitchesByRecruitId[action.payload.recruitId] = action.payload.pitch;
    },
    clearRecruitPitch: (state, action: PayloadAction<string>) => {
        delete state.activePitchesByRecruitId[action.payload];
    },
    setPracticeFocus: (state, action: PayloadAction<PracticeFocus>) => {
        state.practiceFocus = action.payload;
    },
    advanceCoachWeek: (state) => {
        state.teamFatigue = advanceFatigue(
            state.teamFatigue,
            state.practiceFocus,
            state.profile?.archetype ?? 'RECRUITER',
            state.skillTree?.operations ?? 0,
        );
        const boostersLevel = state.programResources?.boosters ?? 50;
        state.adPressure = Math.max(
            15,
            Math.min(
                98,
                state.adPressure + Math.round((boostersLevel - state.jobSecurity) / AD_PRESSURE_DIVISOR),
            ),
        );
    },
    applyPlayoffRoundFatigue: (state, action: PayloadAction<{ played: boolean }>) => {
        state.teamFatigue = playoffRoundFatigue(
            state.teamFatigue,
            action.payload.played,
            state.practiceFocus,
            state.profile?.archetype ?? 'RECRUITER',
            state.skillTree?.operations ?? 0,
        );
    },
    updateJobSecurity: (state, action: PayloadAction<number>) => {
        state.jobSecurity = Math.max(0, Math.min(100, action.payload));
    },
    allocateProgramResources: (state, action: PayloadAction<ProgramResources>) => {
        state.programResources = {
            nil: Math.max(25, Math.min(90, action.payload.nil)),
            boosters: Math.max(25, Math.min(95, action.payload.boosters)),
            facilities: Math.max(25, Math.min(95, action.payload.facilities)),
        };
    },
    addCoachXp: (state, action: PayloadAction<number>) => {
        const gained = Math.max(0, action.payload);
        state.coachXp += gained;
        while (state.coachXp >= 100) {
            state.coachXp -= 100;
            state.coachLevel += 1;
            const treeMaxed = Object.values(state.skillTree).every((level) => level >= 5);
            if (treeMaxed) {
                // Tree is full — bank a small security bump instead of endless unused points.
                state.jobSecurity = Math.max(0, Math.min(100, state.jobSecurity + 1));
            } else {
                state.coachSkillPoints += 1;
            }
        }
    },
    upgradeCoachSkill: (state, action: PayloadAction<keyof CoachSkillTree>) => {
        const key = action.payload;
        if (state.coachSkillPoints <= 0) return;
        if (state.skillTree[key] >= 5) return;
        state.skillTree[key] += 1;
        state.coachSkillPoints -= 1;
    },
    setAdPressure: (state, action: PayloadAction<number>) => {
        state.adPressure = Math.max(0, Math.min(100, action.payload));
    },
    applyPrestigeDrift: (state, action: PayloadAction<number>) => {
        state.programPrestigeDrift = clamp(state.programPrestigeDrift + action.payload, MIN_PRESTIGE_DRIFT, MAX_PRESTIGE_DRIFT);
    },
    setPendingJobOffers: (state, action: PayloadAction<JobOffer[]>) => {
        state.pendingJobOffers = action.payload;
    },
    declineAllJobOffers: (state) => {
        state.pendingJobOffers = [];
        state.jobSecurity = Math.max(0, Math.min(100, state.jobSecurity + JOB_SECURITY_DECLINE_BONUS));
    },
    applyJobOfferAcceptance: (state, action: PayloadAction<{
        teamId: string;
        careerTier: NonNullable<CoachState['careerTier']>;
        programExpectations: ProgramExpectations;
    }>) => {
        state.selectedTeamId = action.payload.teamId;
        state.careerTier = action.payload.careerTier;
        state.programExpectations = action.payload.programExpectations;
        state.programPrestigeDrift = 0;
        state.pendingJobOffers = [];
        state.recruitPool = [];
        state.boardRecruitIds = [];
        state.weeklyHoursByRecruitId = {};
        state.activePitchesByRecruitId = {};
        state.recruitingWeekIndex = 0;
        state.scholarshipsAvailable = 12;
        state.signedRecruitsByYear = {};
        state.managedRoster = null;
        state.starterIds = [];
        state.teamFatigue = 20;
        const defaults = CAREER_TIER_DEFAULTS[action.payload.careerTier];
        state.programResources = defaults.resources;
        state.adPressure = defaults.adPressure;
        state.jobSecurity = action.payload.programExpectations.securityBaseline;
    },
    recordSeasonEnd: (state, action: PayloadAction<SeasonHistoryEntry>) => {
        if (state.seasonHistory.some((entry) => entry.year === action.payload.year)) {
            return;
        }
        state.seasonHistory.push(action.payload);
        state.careerRecord.seasonsCompleted += 1;
        state.careerRecord.totalWins += action.payload.wins;
        state.careerRecord.totalLosses += action.payload.losses;
        if (action.payload.madePlayoffs) state.careerRecord.playoffAppearances += 1;
        if (action.payload.champion) state.careerRecord.championships += 1;
        if (state.profile) {
            state.profile.age += 1;
        }
    },
    updateProgramStanding: (state, action: PayloadAction<{
        careerTier: NonNullable<CoachState['careerTier']>;
        programExpectations: ProgramExpectations;
    }>) => {
        state.careerTier = action.payload.careerTier;
        state.programExpectations = action.payload.programExpectations;
    },
    resetRecruitingForNewSeason: (state) => {
        state.recruitPool = [];
        state.boardRecruitIds = [];
        state.weeklyHoursByRecruitId = {};
        state.activePitchesByRecruitId = {};
        state.recruitingWeekIndex = 0;
        state.scholarshipsAvailable = 12;
        state.teamFatigue = 20;
    },
    applyRecruitingUpdates: (state, action: PayloadAction<{
        interestUpdates: Record<string, Record<string, number>>; // recruitId -> teamId -> interest
        commitments: { recruitId: string; teamId: string }[];
    }>) => {
        state.recruitingWeekIndex += 1;

        // Apply interest updates
        Object.entries(action.payload.interestUpdates).forEach(([recruitId, interestMap]) => {
            const recruit = state.recruitPool.find(r => r.id === recruitId);
            if (recruit) {
                recruit.interestByTeamId = interestMap;
            }
        });

        // Apply commitments
        action.payload.commitments.forEach(({ recruitId, teamId }) => {
            const recruit = state.recruitPool.find(r => r.id === recruitId);
            if (recruit) {
                recruit.committedTeamId = teamId;
            }
        });
    },
    finalizeSigningClass: (state, action: PayloadAction<{ seasonYear: number; signedRecruits: SignedRecruit[]; unsignedCommitRecruitIds?: string[] }>) => {
        const { seasonYear, signedRecruits, unsignedCommitRecruitIds = [] } = action.payload;
        state.signedRecruitsByYear[seasonYear] = signedRecruits;
        state.scholarshipsAvailable = Math.max(0, state.scholarshipsAvailable - signedRecruits.length);
        // Clear verbal commits that did not receive a scholarship so UI doesn't keep "Committed!" forever.
        if (unsignedCommitRecruitIds.length > 0) {
            const unsigned = new Set(unsignedCommitRecruitIds);
            state.recruitPool.forEach((recruit) => {
                if (unsigned.has(recruit.id) && recruit.committedTeamId === state.selectedTeamId) {
                    recruit.committedTeamId = null;
                }
            });
        }
    },
    setManagedRoster: (state, action: PayloadAction<Player[]>) => {
        state.managedRoster = action.payload;
    },
    setStarterIds: (state, action: PayloadAction<string[]>) => {
        state.starterIds = action.payload;
    },
    toggleStarter: (state, action: PayloadAction<string>) => {
        const playerId = action.payload;
        const idx = state.starterIds.indexOf(playerId);
        if (idx >= 0) {
            state.starterIds.splice(idx, 1);
        } else {
            state.starterIds.push(playerId);
        }
    },
    resetCoach: () => initialState,
  },
});

export const {
    setSelectedTeam,
    setTactics,
    setCoachProfile,
    completeCareerSetup,
    initializeRecruitingBoard,
    addRecruitToBoard,
    removeRecruitFromBoard,
    setRecruitHours,
    setRecruitPitch,
    clearRecruitPitch,
    setPracticeFocus,
    advanceCoachWeek,
    applyPlayoffRoundFatigue,
    allocateProgramResources,
    addCoachXp,
    upgradeCoachSkill,
    setAdPressure,
    applyPrestigeDrift,
    setPendingJobOffers,
    declineAllJobOffers,
    applyJobOfferAcceptance,
    applyRecruitingUpdates,
    finalizeSigningClass,
    updateJobSecurity,
    recordSeasonEnd,
    resetRecruitingForNewSeason,
    updateProgramStanding,
    setManagedRoster,
    setStarterIds,
    toggleStarter,
    resetCoach,
} = coachSlice.actions;

export function careerTierFromPrestige(prestige: number): NonNullable<CoachState['careerTier']> {
    if (prestige >= 78) return 'CONTENDER';
    if (prestige >= 58) return 'STABLE';
    return 'REBUILD';
}

export function expectationsFromPrestige(prestige: number): ProgramExpectations {
    switch (careerTierFromPrestige(prestige)) {
        case 'CONTENDER':
            return { winTarget: 9, rankTarget: 12, securityBaseline: 64 };
        case 'STABLE':
            return { winTarget: 7, rankTarget: 35, securityBaseline: 58 };
        default:
            return { winTarget: 5, rankTarget: 70, securityBaseline: 52 };
    }
}

export function careerSetupFromPrestige(prestige: number): {
    careerTier: NonNullable<CoachState['careerTier']>;
    programExpectations: ProgramExpectations;
} {
    return {
        careerTier: careerTierFromPrestige(prestige),
        programExpectations: expectationsFromPrestige(prestige),
    };
}

export const acceptJobOffer = createAsyncThunk(
    'coach/acceptJobOffer',
    async (teamId: string, { getState, dispatch }) => {
        const state = getState() as RootState;
        const team = state.league.teams.find((t) => t.id === teamId);
        if (!team) return;

        dispatch(applyJobOfferAcceptance({
            teamId,
            ...careerSetupFromPrestige(team.prestige),
        }));
    },
);


export const advanceRecruitingWeek = createAsyncThunk(
    'coach/advanceRecruitingWeek',
    async (_, { getState, dispatch }) => {
        const state = getState() as RootState;
        const coach = state.coach;
        const teams = state.league.teams;

        const baseTeam = teams.find(t => t.id === coach.selectedTeamId);
        if (!baseTeam) return;

        const effectivePrestige = Math.max(
            1,
            Math.min(100, baseTeam.prestige + (coach.programPrestigeDrift ?? 0)),
        );
        const selectedTeam = { ...baseTeam, prestige: effectivePrestige };

        // Generate grades
        const pitchGradesByRecruitId: Record<string, string> = {};
        const dealbreakerViolationsByRecruitId: Record<string, boolean> = {};
        const positionNeedBonusByRecruitId: Record<string, number> = {};
        const positionNeedByPosition = buildPositionNeedByPosition(coach.managedRoster);

        coach.boardRecruitIds.forEach(recruitId => {
             const recruit = coach.recruitPool.find(r => r.id === recruitId);
             if (!recruit) return;

             const positionNeed = positionNeedByPosition[recruit.position] ?? 0;
             positionNeedBonusByRecruitId[recruitId] = Math.max(0, Math.min(3, positionNeed));

              const activePitch = coach.activePitchesByRecruitId[recruitId];
              if (activePitch) {
                 pitchGradesByRecruitId[recruitId] = getTeamPitchGrade(selectedTeam, activePitch, recruit, positionNeedByPosition);
              }

             // Check dealbreaker
              if (recruit.dealbreaker) {
                 const grade = getTeamPitchGrade(selectedTeam, recruit.dealbreaker, recruit, positionNeedByPosition);
                  // If grade is D or F, it's a violation
                  if (grade === 'D' || grade === 'F') {
                      dealbreakerViolationsByRecruitId[recruitId] = true;
                  }
              }
        });

        const archetypeBonus =
            coach.profile?.archetype === 'RECRUITER' ? 1.15
            : coach.profile?.archetype === 'DEVELOPER' ? 0.95
            : 1.0;
        const recruitingSkill = coach.skillTree?.recruiting ?? 0;
        const nilLevel = coach.programResources?.nil ?? 50;
        const boostersLevel = coach.programResources?.boosters ?? 50;
        const recruitingSkillBonus = 1 + recruitingSkill * 0.03;
        const nilBonus = 1 + (nilLevel - 50) / 300;
        const boostersBonus = 1 + (boostersLevel - 50) / 400;
        const recruitingBonus = archetypeBonus * recruitingSkillBonus * nilBonus * boostersBonus;
        const coachSkill = coach.profile?.skill ?? 72;

        const result = simulateRecruitingWeek(
            coach.recruitPool,
            coach.boardRecruitIds,
            coach.weeklyHoursByRecruitId,
            coach.activePitchesByRecruitId,
            pitchGradesByRecruitId,
            dealbreakerViolationsByRecruitId,
            positionNeedBonusByRecruitId,
            coach.selectedTeamId,
            coach.recruitingSeed,
            coach.recruitingWeekIndex,
            recruitingBonus,
            coachSkill
        );

        const commitments: { recruitId: string; teamId: string }[] = [];

        Object.entries(result.committedTeamByRecruitId).forEach(([recruitId, teamId]) => {
            if (teamId) {
                commitments.push({ recruitId, teamId });
            }
        });

        dispatch(applyRecruitingUpdates({
            interestUpdates: result.interestByRecruitId,
            commitments
        }));
    }
);

export const processSigningDay = createAsyncThunk(
    'coach/processSigningDay',
    async (_, { getState, dispatch }) => {
        const state = getState() as RootState;
        const coach = state.coach;
        const ceremony = careerOffseasonCapabilities({
            phase: state.season.phase,
            year: state.season.year,
            hasSelectedTeam: Boolean(coach.selectedTeamId),
            hasProgramExpectations: Boolean(coach.programExpectations),
            signedRecruitsByYear: coach.signedRecruitsByYear,
            seasonHistory: coach.seasonHistory,
        });
        if (!ceremony.canProcessSigningDay) {
            return;
        }

        const committedToUser = coach.recruitPool.filter(
            (recruit) => recruit.committedTeamId === coach.selectedTeamId,
        );

        const signingOutcome = resolveSigningDay(committedToUser, coach.scholarshipsAvailable, coach.managedRoster);
        const signedRecruits = signingOutcome.signedRecruitIds
            .map((recruitId) => coach.recruitPool.find((recruit) => recruit.id === recruitId))
            .filter((recruit): recruit is Recruit => Boolean(recruit))
            .map((recruit) => ({
                recruitId: recruit.id,
                signedAtYear: state.season.year,
                stars: recruit.stars,
                position: recruit.position,
                potential: recruit.potential,
            }));
        const signedIdSet = new Set(signingOutcome.signedRecruitIds);
        const unsignedCommitRecruitIds = committedToUser
            .filter((recruit) => !signedIdSet.has(recruit.id))
            .map((recruit) => recruit.id);

        dispatch(finalizeSigningClass({
            seasonYear: state.season.year,
            signedRecruits,
            unsignedCommitRecruitIds,
        }));
    }
);

export const selectUserEffectivePrestige = createSelector(
    [
        (state: RootState) => state.league.teams,
        (state: RootState) => state.coach.selectedTeamId,
        (state: RootState) => state.coach.programPrestigeDrift,
    ],
    (teams, selectedTeamId, drift) => {
        const team = teams.find((t) => t.id === selectedTeamId);
        if (!team) return null;
        return clamp(team.prestige + drift, 1, 100);
    },
);

export const coachReducer = coachSlice.reducer;
