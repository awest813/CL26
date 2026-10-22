export type Position = 'A' | 'M' | 'D' | 'LSM' | 'FO' | 'G';

export const POSITION_ORDER: Position[] = ['A', 'M', 'D', 'LSM', 'FO', 'G'];

export interface Conference {
  id: string;
  name: string;
  // ... other fields if any
}

export type TeamId = string;

export interface Team {
  id: TeamId;
  schoolName: string;
  nickname: string;
  conferenceId: string;
  region: string;
  prestige: number;
}

export interface TeamSimInput {
  team: Team;
  roster: Player[];
  /** When set (non-empty), starters drive team ratings and scoring touches more than bench. */
  starterIds?: string[];
  gameplan?: TeamGameplayModifiers;
}

export interface TeamGameplayModifiers {
  offense: number;
  defense: number;
  goalie: number;
  faceoff: number;
  discipline: number;
  shotQuality: number;
  turnoverAvoidance: number;
  penaltyAvoidance: number;
  groundBallBonus: number;
  /** Share of in-game wear taken off (0–0.35), from a week of conditioning. */
  wearRelief?: number;
}

export type CoachArchetype = 'RECRUITER' | 'TACTICIAN' | 'DEVELOPER';

export interface PlayerRatings {
  shooting: number;
  passing: number;
  speed: number;
  defense: number;
  IQ: number;
  stamina: number;
  discipline: number;
}

export interface Player extends PlayerRatings {
  id: string;
  name: string;
  position: Position;
  year: 1 | 2 | 3 | 4;
  age: number;
  skill: number;
  overall: number;
  /** Faceoff specialist rating. Missing on players saved before it existed; see `faceoffRating`. */
  faceoff?: number;
  /** Goalkeeping rating. Missing on players saved before it existed; see `savingRating`. */
  saving?: number;
  /** The overall he can grow to. Missing on players saved before it existed; see `playerPotential`. */
  potential?: number;
  /** Sitting out this season to keep a year of eligibility. */
  redshirt?: boolean;
  /** Has already taken his one redshirt year. */
  redshirtUsed?: boolean;
}

export interface Recruit {
  id: string;
  name: string;
  position: Position;
  stars: number;
  region: string;
  potential: number;
  committedTeamId: string | null;
  motivations: RecruitMotivation[];
  dealbreaker: RecruitingPitch | null;
  interestByTeamId: Record<string, number>;
}

export interface SignedRecruit {
  recruitId: string;
  signedAtYear: number;
  stars: number;
  position: Position;
  /** 40–99 scouting ceiling; copied from recruit at signing. Drives freshman attribute variance. */
  potential?: number;
}

export type RecruitingPitch = 'PLAYING_TIME' | 'PROXIMITY' | 'ACADEMIC' | 'PRESTIGE' | 'CHAMPIONSHIP' | 'CAMPUS_LIFE';

export interface RecruitMotivation {
  pitch: RecruitingPitch;
  importance: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ScheduledGame {
  id: string;
  weekIndex: number;
  homeTeamId: string;
  awayTeamId: string;
  conferenceGame: boolean;
  /** Set on an annual rivalry game: the trophy at stake. */
  rivalryTrophy?: string;
}

export interface TeamGameStats {
  teamId: string;
  goals: number;
  shots: number;
  saves: number;
  turnovers: number;
  /** Turnovers forced on the opposing offense (caused turnovers). */
  causedTurnovers?: number;
  groundBalls: number;
  penalties: number;
  faceoffPct: number;
  /** Shots that reached the cage (goals + saves). Missing on games played before it was tracked. */
  shotsOnGoal?: number;
  faceoffWins?: number;
  faceoffsTaken?: number;
  clearsMade?: number;
  clearAttempts?: number;
  /** Goals scored while a man up, and the man-up chances the other side's penalties gave. */
  extraManGoals?: number;
  extraManOpportunities?: number;
}

export interface PlayerGameStats {
  playerId: string;
  teamId: string;
  name: string;
  position: Position;
  goals: number;
  assists: number;
  saves: number;
  /** Missing on games played before per-player shots and ground balls were tracked. */
  shots?: number;
  groundBalls?: number;
  causedTurnovers?: number;
  faceoffWins?: number;
  faceoffsTaken?: number;
  /** For the goalie in net: goals the other side scored. */
  goalsAllowed?: number;
}

export type TopPerformer = PlayerGameStats;

export interface GameResult {
  id?: string;
  weekIndex?: number;
  seed: number;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  statsA: TeamGameStats;
  statsB: TeamGameStats;
  topPlayersA: PlayerGameStats[];
  topPlayersB: PlayerGameStats[];
  highlights: string[];
  /** Every player who recorded a stat. Returned by the engine for season totals; not kept in the save. */
  boxScoreA?: PlayerGameStats[];
  boxScoreB?: PlayerGameStats[];
}

/** One player's regular-season totals. */
export interface PlayerSeasonLine {
  playerId: string;
  name: string;
  teamId: string;
  position: Position;
  year: Player['year'];
  goals: number;
  assists: number;
  shots: number;
  groundBalls: number;
  causedTurnovers: number;
  saves: number;
  goalsAllowed: number;
  faceoffWins: number;
  faceoffsTaken: number;
}

export interface SeasonAward {
  award: string;
  playerId: string;
  name: string;
  teamId: string;
  position: Position;
  /** e.g. "38 G, 21 A". */
  statLine: string;
}

export interface GameSummary {
  id: string;
  weekIndex: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  teamStatsHome: TeamGameStats;
  teamStatsAway: TeamGameStats;
  topPerformers?: PlayerGameStats[];
}

export interface RankingRow {
  rank: number;
  teamId: string;
  points: number;
  record: string;
}

export interface RankingScoreBreakdown {
  overallWinPctPoints: number;
  conferenceWinPctPoints: number;
  pointDifferentialPoints: number;
  prestigePoints: number;
  strengthOfSchedulePoints: number;
  /** Quality-win bonuses minus bad-loss penalties. */
  qualityResultPoints: number;
  totalPoints: number;
}

export interface TeamRecord {
  wins: number;
  losses: number;
  confWins: number;
  confLosses: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface Tactics {
  tempo: 'slow' | 'normal' | 'fast';
  rideClear: 'conservative' | 'balanced' | 'aggressive';
  slideAggression: 'early' | 'normal' | 'late';
  offenseSet?: 'balanced' | 'motion' | 'invert' | 'crease';
  defensePackage?: 'man' | 'zone' | 'pressure';
}

export type PracticeFocus = 'OFFENSE' | 'DEFENSE' | 'CONDITIONING' | 'DISCIPLINE';

export type PlayoffRoundName = 'ROUND1' | 'QUARTERFINAL' | 'SEMIFINAL' | 'FINAL';

export interface PlayoffSeed {
  seed: number;
  teamId: string;
  /** In the field as one of the highest-ranked conference champions. Missing on brackets set before auto bids. */
  autoBid?: boolean;
}

/** One line of the projected (or final) field: seed, poll rank, and how the team got in. */
export interface FieldSeed extends PlayoffSeed {
  pollRank: number;
  record: string;
  points: number;
  autoBid: boolean;
  /** Set when the team leads (or won) its conference. */
  conferenceChampion: boolean;
}

export interface PlayoffGame {
  id: string;
  round: PlayoffRoundName;
  slot: number;
  homeSeed: number; // 0 if not applicable
  awaySeed: number; // 0 if not applicable
  homeTeamId: string;
  awayTeamId: string;
  winnerTeamId: string | null;
  result: GameSummary | null;
}

export interface PlayoffState {
  seeds: PlayoffSeed[];
  rounds: {
    ROUND1: PlayoffGame[];
    QUARTERFINAL: PlayoffGame[];
    SEMIFINAL: PlayoffGame[];
    FINAL: PlayoffGame[];
  };
  currentRound: PlayoffRoundName;
  championTeamId: string | null;
}

export interface SeasonState {
  year: number;
  currentWeekIndex: number;
  completedWeeks: number;
  gameResults: GameResult[];
  scheduleByWeek: ScheduledGame[][];
  isComplete: boolean;
  phase: 'PRE' | 'REGULAR' | 'PLAYOFF' | 'OFFSEASON';
  seasonSeed: number;
  playoffs?: PlayoffState | null;
  standings?: RankingRow[];
  /** Snapshot of each team's rank from the previous week sim; used for movement indicators. */
  previousRankByTeamId: Record<string, number>;
  /** Request id of the week sim the reducer actually applied. Duplicate in-flight sims are ignored. */
  lastAppliedWeekSimId?: string | null;
  /** Each CPU program's earned prestige and roster talent. Missing on saves from before programs could rise and fall. */
  programLedger?: ProgramLedger;
  /** The last season year folded into the ledger, so a season is never counted twice. */
  programLedgerYear?: number | null;
  /** The ledger before `programLedgerYear`'s season was added: that year's pro draft is built from it. */
  programLedgerBefore?: ProgramLedger;
  /** Who holds each rivalry trophy, by trophy name. Carries across seasons. */
  trophyHolders?: Record<string, string>;
  /** This regular season's player totals, by player id. Cleared each new season. */
  playerSeasonStats?: Record<string, PlayerSeasonLine>;
  /** National awards by season year, named when each regular season ends. */
  awardHistory?: Record<number, SeasonAward[]>;
  /** First and second All-American teams by season year. */
  allAmericanHistory?: Record<number, { first: SeasonAward[]; second: SeasonAward[] }>;
  /** This season's conference championships, by conference id; null until they are played. */
  conferenceTournaments?: Record<string, ConferenceTournament> | null;
}

export interface ConferenceTournamentGame {
  id: string;
  round: 'SEMIFINAL' | 'FINAL';
  homeTeamId: string;
  awayTeamId: string;
  homeSeed: number;
  awaySeed: number;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string;
}

/** A four-team conference championship: two semifinals and a final. */
export interface ConferenceTournament {
  conferenceId: string;
  /** Team ids in seed order, 1 to 4. */
  seeds: string[];
  games: ConferenceTournamentGame[];
  championTeamId: string;
}

/** How a program has moved away from its base rating in the league file. */
export interface ProgramLedgerEntry {
  /** Prestige earned or lost through results, added to the base prestige. Fades 10% a year back toward zero. */
  prestigeDrift: number;
  /** Roster talent from recent recruiting classes and early pro departures, in rating points. */
  talent: number;
  /** The class the program signed most recently. */
  lastClass?: { year: number; commits: number; averageStars: number };
}

export type ProgramLedger = Record<string, ProgramLedgerEntry>;

export interface LeagueData {
  conferences: Conference[];
  teams: Team[];
}

export interface SeasonHistoryEntry {
  year: number;
  /** The program and the targets the season was judged against. Missing on older saves. */
  teamId?: string;
  winTarget?: number;
  rankTarget?: number;
  pollRank?: number;
  wins: number;
  losses: number;
  madePlayoffs: boolean;
  champion: boolean;
  /** Bracket games, kept apart from the 12-game regular season. Missing on saves from before they were tracked. */
  playoffWins?: number;
  playoffLosses?: number;
  /** The deepest round the program played in. */
  playoffRound?: PlayoffRoundName | null;
  recruitsSigned: number;
  avgRecruitStars: number;
  jobSecurityEnd: number;
}

export interface CareerRecord {
  totalWins: number;
  totalLosses: number;
  playoffAppearances: number;
  championships: number;
  seasonsCompleted: number;
}

export interface JobOffer {
  teamId: string;
  tier: 'UPGRADE' | 'LATERAL' | 'STEP_DOWN';
  presentedAtYear: number;
}
