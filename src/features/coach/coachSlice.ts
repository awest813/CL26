import { createSelector, createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import type { Employment } from '../../sim/jobOffers';
import { CareerRecord, CoachArchetype, JobOffer, Player, PracticeFocus, Recruit, RecruitingPitch, SeasonHistoryEntry, SignedRecruit, Tactics, Team } from '../../types/sim';

import { buildPositionNeedByPosition, generateRecruitPool, generateSuitors, getTeamPitchGrade } from '../../sim/recruiting';
import { simulateRecruitingWeek, type CpuRecruitingProfile } from '../../sim/recruitingWeek';
import { RECRUITING_BOARD_LIMIT, type AutoRecruitPlan } from '../../sim/autoRecruit';
import { resolveSigningDay } from '../../sim/offseason';
import { advanceFatigue, playoffRoundFatigue } from '../../sim/coachEffects';
import { DEFAULT_TACTICS } from '../../sim/tactics';
import { careerOffseasonCapabilities } from '../../sim/seasonPhase';
import { RootState } from '../../store/store';
import { ledgerEntry, withLeaguePrestige } from '../../sim/programLedger';
import { redshirtBlocker } from '../../sim/redshirts';
import { setProgramLedgerEntry } from '../season/seasonSlice';

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

/** What changed on the trail during the last simulated recruiting period. */
export interface RecruitingReport {
  /** 1-based recruiting period that just finished. */
  period: number;
  committedToUserIds: string[];
  /** Board targets that picked another program this period. */
  lostTargets: { recruitId: string; teamId: string }[];
  /** Commits anywhere in the class this period, the user's included. */
  totalCommits: number;
}

export interface CoachState {
  selectedTeamId: string | null;
  tactics: Tactics;
  profile: CoachProfile | null;
  onboardingStep: 'PROFILE' | 'READY';
  careerTier: 'REBUILD' | 'STABLE' | 'CONTENDER' | null;
  programExpectations: ProgramExpectations | null;
  recruitPool: Recruit[];
  boardRecruitIds: string[];
  recruitingSeed: number;
  recruitingWeekIndex: number;
  weeklyHoursByRecruitId: Record<string, number>;
  activePitchesByRecruitId: Record<string, RecruitingPitch>;
  /** Missing on saves from before the report existed. Treat undefined as null. */
  recruitingReport?: RecruitingReport | null;
  /** Staff sets the board, hours, and pitches before each week. Missing on older saves: treat as false. */
  autoRecruiting?: boolean;
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
  /** Missing on saves from before firings existed. Treat undefined as ACTIVE. */
  employment: Employment;
  portalClaimIds: string[];
  draftClaimId: string | null;
  seasonHistory: SeasonHistoryEntry[];
  careerRecord: CareerRecord;
  // Roster management
  managedRoster: Player[] | null;
  starterIds: string[];
}

const initialState: CoachState = {
  selectedTeamId: null,
  tactics: DEFAULT_TACTICS,
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
  recruitingReport: null,
  autoRecruiting: false,
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
  employment: 'ACTIVE',
  portalClaimIds: [],
  draftClaimId: null,
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
        state.employment = 'ACTIVE';
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
        state.recruitingReport = null;
        state.scholarshipsAvailable = 12;
    },
    addRecruitToBoard: (state, action: PayloadAction<{ recruitId: string; startingInterest: number }>) => {
        const target = state.recruitPool.find(r => r.id === action.payload.recruitId);
        if (target?.committedTeamId) {
            return;
        }
        if (!state.boardRecruitIds.includes(action.payload.recruitId) && state.boardRecruitIds.length < RECRUITING_BOARD_LIMIT) {
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
        // A committed prospect is off the trail; hours there would be wasted.
        if (state.recruitPool.find(r => r.id === recruitId)?.committedTeamId) {
            state.weeklyHoursByRecruitId[recruitId] = 0;
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
    setAutoRecruiting: (state, action: PayloadAction<boolean>) => {
        state.autoRecruiting = action.payload;
    },
    applyAutoRecruitingPlan: (state, action: PayloadAction<AutoRecruitPlan>) => {
        const plan = action.payload;
        const removed = new Set(plan.removals);
        state.boardRecruitIds = state.boardRecruitIds.filter(id => !removed.has(id));
        plan.removals.forEach((id) => {
            delete state.weeklyHoursByRecruitId[id];
            delete state.activePitchesByRecruitId[id];
        });

        plan.adds.forEach(({ recruitId, startingInterest }) => {
            const recruit = state.recruitPool.find(r => r.id === recruitId);
            if (!recruit || recruit.committedTeamId) return;
            if (state.boardRecruitIds.includes(recruitId) || state.boardRecruitIds.length >= RECRUITING_BOARD_LIMIT) return;
            state.boardRecruitIds.push(recruitId);
            if (state.selectedTeamId && (recruit.interestByTeamId[state.selectedTeamId] ?? 0) < startingInterest) {
                recruit.interestByTeamId[state.selectedTeamId] = startingInterest;
            }
        });

        // Replace the whole allocation, holding the same caps as manual entry.
        let hoursLeft = WEEKLY_HOURS_CAP;
        const hours: Record<string, number> = {};
        state.boardRecruitIds.forEach((id) => {
            const committed = Boolean(state.recruitPool.find(r => r.id === id)?.committedTeamId);
            const requested = committed ? 0 : Math.max(0, Math.min(MAX_HOURS_PER_RECRUIT, plan.hoursByRecruitId[id] ?? 0));
            hours[id] = Math.min(requested, hoursLeft);
            hoursLeft -= hours[id];
        });
        state.weeklyHoursByRecruitId = hours;

        Object.entries(plan.pitchByRecruitId).forEach(([id, pitch]) => {
            if (!state.boardRecruitIds.includes(id)) return;
            if (pitch) state.activePitchesByRecruitId[id] = pitch;
            else delete state.activePitchesByRecruitId[id];
        });
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
    setEmployment: (state, action: PayloadAction<Employment>) => {
        state.employment = action.payload;
    },
    declineAllJobOffers: (state) => {
        if (state.employment === 'FIRED') return;
        state.pendingJobOffers = [];
        state.jobSecurity = Math.max(0, Math.min(100, state.jobSecurity + JOB_SECURITY_DECLINE_BONUS));
    },
    applyJobOfferAcceptance: (state, action: PayloadAction<{
        teamId: string;
        seasonYear: number;
        /** Prestige the new program already earned before the coach arrived. */
        prestigeDrift?: number;
        careerTier: NonNullable<CoachState['careerTier']>;
        programExpectations: ProgramExpectations;
    }>) => {
        state.selectedTeamId = action.payload.teamId;
        state.careerTier = action.payload.careerTier;
        state.programExpectations = action.payload.programExpectations;
        state.programPrestigeDrift = clamp(action.payload.prestigeDrift ?? 0, MIN_PRESTIGE_DRIFT, MAX_PRESTIGE_DRIFT);
        state.pendingJobOffers = [];
        state.employment = 'ACTIVE';
        state.recruitPool = [];
        state.boardRecruitIds = [];
        state.weeklyHoursByRecruitId = {};
        state.activePitchesByRecruitId = {};
        state.recruitingWeekIndex = 0;
        state.recruitingReport = null;
        state.scholarshipsAvailable = 12;
        // Commits belonged to the previous program. Keep the year key so signing
        // day stays resolved and the next-year handoff can run, but drop this
        // year's class so those players do not follow the coach. Earlier years stay archived.
        state.signedRecruitsByYear = {
            ...state.signedRecruitsByYear,
            [action.payload.seasonYear]: [],
        };
        state.managedRoster = null;
        state.starterIds = [];
        state.portalClaimIds = [];
        state.draftClaimId = null;
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
        // The career record counts bracket games too; the season row keeps them apart.
        state.careerRecord.totalWins += action.payload.wins + (action.payload.playoffWins ?? 0);
        state.careerRecord.totalLosses += action.payload.losses + (action.payload.playoffLosses ?? 0);
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
        state.recruitingReport = null;
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
        const boardSet = new Set(state.boardRecruitIds);
        const report: RecruitingReport = {
            period: state.recruitingWeekIndex,
            committedToUserIds: [],
            lostTargets: [],
            totalCommits: 0,
        };
        action.payload.commitments.forEach(({ recruitId, teamId }) => {
            const recruit = state.recruitPool.find(r => r.id === recruitId);
            if (!recruit || recruit.committedTeamId) return;
            recruit.committedTeamId = teamId;
            report.totalCommits += 1;
            if (teamId === state.selectedTeamId) {
                report.committedToUserIds.push(recruitId);
            } else if (boardSet.has(recruitId)) {
                report.lostTargets.push({ recruitId, teamId });
            }
        });
        state.recruitingReport = report;

        // Hours and pitches on committed prospects go back to the weekly pool.
        state.boardRecruitIds.forEach((recruitId) => {
            const recruit = state.recruitPool.find(r => r.id === recruitId);
            if (recruit?.committedTeamId) {
                state.weeklyHoursByRecruitId[recruitId] = 0;
                delete state.activePitchesByRecruitId[recruitId];
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
    /** Redshirt a player or take it back. Callers check the window (before week 1) with `canChangeRedshirts`. */
    setPlayerRedshirt: (state, action: PayloadAction<{ playerId: string; redshirt: boolean }>) => {
        const roster = state.managedRoster ?? [];
        const player = roster.find((row) => row.id === action.payload.playerId);
        if (!player) return;
        if (action.payload.redshirt) {
            if (redshirtBlocker(player, roster)) return;
            player.redshirt = true;
            if (state.starterIds.includes(player.id)) {
                // The best healthy backup at his position takes the starting spot.
                const starters = new Set(state.starterIds);
                const backup = roster
                    .filter((row) => row.position === player.position && !row.redshirt && !starters.has(row.id))
                    .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))[0];
                state.starterIds = state.starterIds.map((id) => (id === player.id ? backup?.id : id)).filter((id): id is string => Boolean(id));
            }
        } else {
            player.redshirt = false;
        }
    },
    togglePortalClaim: (state, action: PayloadAction<string>) => {
        if (!Array.isArray(state.portalClaimIds)) state.portalClaimIds = [];
        const id = action.payload;
        if (state.portalClaimIds.includes(id)) {
            state.portalClaimIds = state.portalClaimIds.filter((claim) => claim !== id);
            return;
        }
        const room = Math.max(0, state.scholarshipsAvailable);
        if (state.portalClaimIds.length >= 3 || state.portalClaimIds.length >= room) return;
        state.portalClaimIds.push(id);
    },
    clearOffseasonMarket: (state) => {
        state.portalClaimIds = [];
        state.draftClaimId = null;
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
    setAutoRecruiting,
    applyAutoRecruitingPlan,
    setPracticeFocus,
    advanceCoachWeek,
    applyPlayoffRoundFatigue,
    allocateProgramResources,
    addCoachXp,
    upgradeCoachSkill,
    setAdPressure,
    applyPrestigeDrift,
    setPendingJobOffers,
    setEmployment,
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
    setPlayerRedshirt,
    togglePortalClaim,
    clearOffseasonMarket,
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

        // Prestige stays with the program, not the coach: leave behind what was built, take over what the new school has.
        const ledger = state.season.programLedger;
        const previousTeamId = state.coach.selectedTeamId;
        if (previousTeamId && previousTeamId !== teamId) {
            dispatch(setProgramLedgerEntry({
                teamId: previousTeamId,
                entry: { ...ledgerEntry(ledger, previousTeamId), prestigeDrift: state.coach.programPrestigeDrift ?? 0 },
            }));
        }
        const inheritedDrift = ledgerEntry(ledger, teamId).prestigeDrift;

        dispatch(applyJobOfferAcceptance({
            teamId,
            seasonYear: state.season.year,
            prestigeDrift: inheritedDrift,
            ...careerSetupFromPrestige(clamp(team.prestige + inheritedDrift, 1, 100)),
        }));
    },
);


/** Archetype, recruiting skill, NIL, and boosters: how far one recruiting hour goes. */
export function programRecruitingBonus(coach: Pick<CoachState, 'profile' | 'skillTree' | 'programResources'>): number {
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
    return archetypeBonus * recruitingSkillBonus * nilBonus * boostersBonus;
}

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

        const recruitingBonus = programRecruitingBonus(coach);
        const coachSkill = coach.profile?.skill ?? 72;
        const teamProfilesByTeamId: Record<string, CpuRecruitingProfile> = {};
        // CPU programs recruit at their current standing, so a program on the rise pulls better classes.
        const currentTeams = withLeaguePrestige(teams, state.season.programLedger);
        currentTeams.forEach((team) => {
            teamProfilesByTeamId[team.id] = team.id === selectedTeam.id
                ? { prestige: selectedTeam.prestige, region: selectedTeam.region }
                : { prestige: team.prestige, region: team.region };
        });

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
            coachSkill,
            teamProfilesByTeamId,
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

export const selectIsCareerReady = createSelector(
    [
        (state: RootState) => state.coach.onboardingStep,
        (state: RootState) => state.coach.selectedTeamId,
    ],
    (onboardingStep, selectedTeamId) => onboardingStep === 'READY' && Boolean(selectedTeamId),
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
