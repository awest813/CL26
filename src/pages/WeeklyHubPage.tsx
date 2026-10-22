import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import TeamLogo from '../components/TeamLogo';
import RecruitingReportNote from '../components/RecruitingReportNote';
import StaffRecruitingControls from '../components/StaffRecruitingControls';
import LeagueWirePanel from '../components/LeagueWirePanel';
import {
  selectRankTrends,
  selectTeamRecords,
  selectUserUpcomingGame,
  selectUserLastResult,
  startPlayoffs,
} from '../features/season/seasonSlice';
import {
  setPracticeFocus,
  setRecruitHours,
  selectIsCareerReady,
  processSigningDay,
  WEEKLY_HOURS_CAP,
  MAX_HOURS_PER_RECRUIT,
} from '../features/coach/coachSlice';
import { beginNextCareerSeason, processSeasonEnd, runCareerWeeklyCycle, simCareerConferenceChampionships, simCareerPlayoffRound, simCareerToBracket } from '../features/coach/careerThunks';
import {
  advanceFatigue,
  buildCoachGamePlan,
  gameDayTacticChanges,
  summarizeCoachSkillImpacts,
  PRACTICE_FOCUS_DETAILS,
  PRACTICE_FOCUS_LABELS,
} from '../sim/coachEffects';
import { GameDayEdge, GameDayScheme, InstallPicker, ScoutingReport } from '../components/GamePlan';
import { gameDayProgramTactics, programTactics } from '../sim/schemeMatchups';
import { programRoster, programStarters } from '../sim/programLedger';
import { activeRoster } from '../sim/redshirts';
import { availabilityWeekKey, injuryTimeline, rosterForAvailability, weeklyScratches } from '../sim/injuries';
import { leagueSeasonRosterSeed } from '../sim/leagueRosterSeed';
import { estimateWinChance } from '../sim/winEstimate';
import { isNeutralSiteRound } from '../sim/playoffs';
import { CONFERENCE_SEMIFINAL_KEY, CONFERENCE_TOURNAMENT_SIZE, conferenceSemifinalId, conferenceTournamentSeeds, tournamentRunFor } from '../sim/conferenceTournaments';
import { confirmPlayCopy } from '../features/settings/settingsSlice';
import { nextLoopStep, PLAYOFF_ROUND_LABELS, userPlayoffSpot } from '../sim/gameLoop';
import { buildPositionNeedByPosition } from '../sim/recruiting';
import { careerOffseasonCapabilities } from '../sim/seasonPhase';
import { buildWeeklyDesk } from '../sim/weeklyDesk';
import { buildLeagueWire } from '../sim/leagueWire';
import { buildGameRecap, gameResultToSummary } from '../sim/gameRecap';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { GameResult, Recruit, Tactics, TeamGameStats } from '../types/sim';
import { tacticShortLabel, tacticValue } from '../lib/tacticLabels';
import PageHeader from '../components/PageHeader';
import { seasonPhaseLabel } from '../lib/seasonLabels';

/** The two calls that shape a game most, as the desk's game-plan row reads them. */
function schemeCall(tactics: Tactics): string {
  return `${tacticShortLabel('tempo', tacticValue(tactics, 'tempo'))} · ${tacticShortLabel('defensePackage', tacticValue(tactics, 'defensePackage'))}`;
}

const MAX_COACH_SKILL_LEVEL = 5;

function fatiguePillClass(label: string): string {
  if (label === 'Drained') return 'fatigue-pill fatigue-pill-drained';
  if (label === 'Worn') return 'fatigue-pill fatigue-pill-worn';
  if (label === 'Managed') return 'fatigue-pill fatigue-pill-managed';
  return 'fatigue-pill fatigue-pill-fresh';
}

function winProbClass(prob: number): string {
  if (prob >= 65) return 'matchup-strong';
  if (prob >= 50) return 'matchup-favor';
  if (prob >= 40) return 'matchup-tossup';
  return 'matchup-underdog';
}

interface ScoreboardTeam {
  id: string;
  schoolName: string;
  nickname: string;
}

/** Point differential beside a record, once the team has played. */
function PointDiff({ pointsFor, pointsAgainst, played }: { pointsFor: number; pointsAgainst: number; played: number }) {
  if (played === 0) return null;
  const diff = pointsFor - pointsAgainst;
  return (
    <span className="matchupDiff" title="Point differential">
      {diff > 0 ? '+' : ''}
      {diff}
    </span>
  );
}

function Scoreboard({
  heading,
  won,
  user,
  opponent,
  userScore,
  oppScore,
  ledBy,
  userStats,
  oppStats,
  keyEdge,
  plays = [],
}: {
  heading: string;
  won: boolean;
  user?: ScoreboardTeam;
  opponent?: ScoreboardTeam;
  userScore: number;
  oppScore: number;
  ledBy?: string;
  /** Box-score lines for the strip under the score, yours first. */
  userStats?: TeamGameStats;
  oppStats?: TeamGameStats;
  /** The recap's one line on what decided it. */
  keyEdge?: string;
  /** A few plays from the game. */
  plays?: string[];
}) {
  return (
    <section id="week-result" className={`card matchupBoard resultBoard ${won ? 'resultBoard-win' : 'resultBoard-loss'}`} aria-label={won ? 'Win' : 'Loss'}>
      <div className="matchupBoardTop">
        <h3 className="m-0 text-base font-bold">{heading}</h3>
        <p className={`matchupKicker ${won ? 'resultKicker-win' : 'resultKicker-loss'}`}>{won ? 'Win' : 'Loss'}</p>
      </div>
      <div className="matchupSides">
        <div className="matchupSide">
          <div className="matchupIdentity">
            {user && <TeamLogo team={user} />}
            <div>
              <span className="matchupSchool">{user?.schoolName ?? 'Your program'}</span>
              {user?.nickname && <span className="matchupNick">{user.nickname}</span>}
            </div>
          </div>
        </div>
        <div className="matchupProb">
          <span className={`matchupProbValue ${won ? 'matchup-strong' : 'matchup-underdog'}`}>{userScore}–{oppScore}</span>
          <span className="matchupProbLabel">Final</span>
        </div>
        <div className="matchupSide matchupSide-away">
          <div className="matchupIdentity">
            {opponent && <TeamLogo team={opponent} />}
            <div>
              {opponent ? (
                <Link to={`/team/${opponent.id}`} className="matchupSchool">{opponent.schoolName}</Link>
              ) : (
                <span className="matchupSchool">Opponent</span>
              )}
              {opponent?.nickname && <span className="matchupNick">{opponent.nickname}</span>}
            </div>
          </div>
        </div>
      </div>
      {userStats && oppStats && (
        <div className="resultStats" aria-label="Box score, yours first">
          <div><span>Shots</span><strong>{userStats.shots}–{oppStats.shots}</strong></div>
          <div><span>Saves</span><strong>{userStats.saves}–{oppStats.saves}</strong></div>
          <div><span>Ground balls</span><strong>{userStats.groundBalls}–{oppStats.groundBalls}</strong></div>
          <div><span>Faceoffs</span><strong>{userStats.faceoffPct}%</strong></div>
          <div><span>Turnovers</span><strong>{userStats.turnovers}–{oppStats.turnovers}</strong></div>
          <div><span>Man-up</span><strong>{userStats.extraManGoals ?? 0}/{userStats.extraManOpportunities ?? 0}</strong></div>
        </div>
      )}
      {ledBy && (
        <p className="resultLine">
          Led by <strong>{ledBy}</strong>
        </p>
      )}
      {keyEdge && <p className="resultLine text-sm text-gray-500">{keyEdge}</p>}
      {plays.length > 0 && (
        <ul className="resultPlays" aria-label="Plays from the game">
          {plays.map((play) => <li key={play}>{play}</li>)}
        </ul>
      )}
    </section>
  );
}

function regularLedBy(result: GameResult, selectedTeamId: string): string {
  const isTeamA = result.teamAId === selectedTeamId;
  const topPerfs = isTeamA ? result.topPlayersA.slice(0, 2) : result.topPlayersB.slice(0, 2);
  return topPerfs
    .map((player) => {
      const parts: string[] = [];
      if (player.goals > 0) parts.push(`${player.goals}G`);
      if (player.assists > 0) parts.push(`${player.assists}A`);
      if (player.saves > 0) parts.push(`${player.saves} SV`);
      return parts.length > 0 ? `${player.name} ${parts.join(' ')}` : player.name;
    })
    .join(' · ');
}

function WeeklyHubPage() {
  const dispatch = useAppDispatch();
  const [actionError, setActionError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const pendingScroll = useRef(false);
  const coach = useAppSelector((state) => state.coach);
  const season = useAppSelector((state) => state.season);
  const teams = useAppSelector((state) => state.league.teams);
  const records = useAppSelector(selectTeamRecords);
  const conferences = useAppSelector((state) => state.league.conferences);
  const userUpcomingGame = useAppSelector(selectUserUpcomingGame);
  const userLastResult = useAppSelector(selectUserLastResult);
  const isCoachReady = useAppSelector(selectIsCareerReady);
  const confirmPlay = useAppSelector((state) => state.settings.confirmPlay);
  const showWinChance = useAppSelector((state) => state.settings.showWinChance);
  const selectedTeamId = coach.selectedTeamId ?? '';
  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const userRecord = records[selectedTeamId] ?? {
    wins: 0,
    losses: 0,
    confWins: 0,
    confLosses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  };

  // Opponent info
  const isHome = userUpcomingGame?.homeTeamId === selectedTeamId;
  const opponentId = userUpcomingGame
    ? isHome
      ? userUpcomingGame.awayTeamId
      : userUpcomingGame.homeTeamId
    : null;
  const opponent = opponentId ? teams.find((t) => t.id === opponentId) ?? null : null;

  // Coach game plan
  const gamePlan = useMemo(
    () =>
      buildCoachGamePlan({
        baseTactics: coach.tactics,
        practiceFocus: coach.practiceFocus,
        fatigue: coach.teamFatigue,
        archetype: coach.profile?.archetype,
        coachSkill: coach.profile?.skill,
        skillTree: coach.skillTree,
      }),
    [coach.practiceFocus, coach.profile, coach.skillTree, coach.tactics, coach.teamFatigue],
  );
  const gameDayChanges = useMemo(
    () =>
      gameDayTacticChanges({
        baseTactics: coach.tactics,
        practiceFocus: coach.practiceFocus,
        fatigue: coach.teamFatigue,
      }),
    [coach.practiceFocus, coach.tactics, coach.teamFatigue],
  );

  const playoffSpot = userPlayoffSpot(season.playoffs ?? null, selectedTeamId || null);
  // A seeded program with games left still plays its install in the bracket.
  const inBracket = season.phase === 'PLAYOFF'
    && playoffSpot.seed != null
    && !playoffSpot.eliminated
    && season.playoffs?.championTeamId == null;
  const playoffRoundLabel = season.playoffs ? PLAYOFF_ROUND_LABELS[season.playoffs.currentRound] : null;
  const playoffOpponentId = playoffSpot.currentGame
    ? playoffSpot.currentGame.homeTeamId === selectedTeamId
      ? playoffSpot.currentGame.awayTeamId
      : playoffSpot.currentGame.homeTeamId
    : null;
  const playoffOpponent = playoffOpponentId ? teams.find((team) => team.id === playoffOpponentId) ?? null : null;
  // Between week 12 and selection: the conference championships, with the user's seed and semifinal opponent.
  const canPlayConferenceChampionships = season.phase === 'PLAYOFF'
    && season.playoffs == null
    && !season.conferenceTournaments
    && season.completedWeeks >= season.scheduleByWeek.length;
  const userConference = conferences.find((conference) => conference.id === selectedTeam?.conferenceId) ?? null;
  const conferenceSeeds = useMemo(
    () => (canPlayConferenceChampionships && selectedTeam
      ? conferenceTournamentSeeds(teams.filter((team) => team.conferenceId === selectedTeam.conferenceId), records)
      : []),
    [canPlayConferenceChampionships, records, selectedTeam, teams],
  );
  const userConferenceSeed = selectedTeamId ? conferenceSeeds.indexOf(selectedTeamId) + 1 : 0;
  const inConferenceChampionship = canPlayConferenceChampionships && userConferenceSeed > 0;
  const semifinalOpponentId = inConferenceChampionship ? conferenceSeeds[CONFERENCE_TOURNAMENT_SIZE - userConferenceSeed] : null;
  const semifinalOpponent = semifinalOpponentId ? teams.find((team) => team.id === semifinalOpponentId) ?? null : null;
  const tournamentRun = selectedTeamId ? tournamentRunFor(season.conferenceTournaments, selectedTeamId) : null;
  const lastConferenceGame = tournamentRun?.games[tournamentRun.games.length - 1] ?? null;

  const featuredOpponent = season.phase === 'REGULAR' ? opponent : inConferenceChampionship ? semifinalOpponent : playoffOpponent;
  const featuredIsHome = season.phase === 'REGULAR'
    ? isHome
    : inConferenceChampionship
      ? userConferenceSeed <= 2
      : playoffSpot.currentGame?.homeTeamId === selectedTeamId;
  // The opponent's staff has a base scheme and may adjust it to this week's calls; the hub scouts both.
  const featuredGameId = season.phase === 'REGULAR'
    ? userUpcomingGame?.id ?? null
    : inConferenceChampionship && userConference
      ? conferenceSemifinalId(userConference.id, userConferenceSeed)
      : playoffSpot.currentGame?.id ?? null;
  const opponentBaseScheme = useMemo(() => (featuredOpponent ? programTactics(featuredOpponent) : undefined), [featuredOpponent]);
  const opponentScheme = useMemo(
    () => (featuredOpponent && featuredGameId
      ? gameDayProgramTactics(featuredOpponent, gamePlan.tactics, `${season.seasonSeed}:${featuredGameId}`)
      : opponentBaseScheme),
    [featuredGameId, featuredOpponent, gamePlan.tactics, opponentBaseScheme, season.seasonSeed],
  );
  const featuredRecord = featuredOpponent
    ? records[featuredOpponent.id] ?? {
        wins: 0,
        losses: 0,
        confWins: 0,
        confLosses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      }
    : null;

  const weekKey = inConferenceChampionship
    ? CONFERENCE_SEMIFINAL_KEY
    : availabilityWeekKey(season.phase, season.currentWeekIndex, season.playoffs?.currentRound ?? null);
  const scratches = useMemo(() => {
    if (!weekKey || !selectedTeamId || !coach.managedRoster?.length) return [];
    return weeklyScratches(activeRoster(coach.managedRoster), season.seasonSeed, weekKey, selectedTeamId);
  }, [coach.managedRoster, season.seasonSeed, selectedTeamId, weekKey]);

  // The estimate plays this exact matchup through the engine: both rosters and depth charts,
  // this week's scratches, both schemes, the install and fatigue, and home field.
  const winProb = useMemo(() => {
    if (!selectedTeam || !featuredOpponent || !opponentScheme) return null;
    const roster = activeRoster(coach.managedRoster ?? []);
    if (roster.length === 0) return null;
    const userLineup = rosterForAvailability(roster, coach.starterIds, scratches);
    const opponentRoster = programRoster(featuredOpponent, season.programLedger, leagueSeasonRosterSeed(season.seasonSeed));
    const opponentLineup = rosterForAvailability(
      opponentRoster,
      programStarters(opponentRoster),
      weekKey ? weeklyScratches(opponentRoster, season.seasonSeed, weekKey, featuredOpponent.id) : [],
    );
    return estimateWinChance({
      user: { team: selectedTeam, roster: userLineup.roster, starterIds: userLineup.starterIds, gameplan: gamePlan.modifiers },
      userTactics: gamePlan.tactics,
      opponent: { team: featuredOpponent, roster: opponentLineup.roster, starterIds: opponentLineup.starterIds },
      opponentTactics: opponentScheme,
      isHome: featuredIsHome,
      neutral: season.phase === 'PLAYOFF' && season.playoffs != null && isNeutralSiteRound(season.playoffs.currentRound),
      seedKey: `${season.seasonSeed}:${weekKey ?? 'none'}:${selectedTeam.id}:${featuredOpponent.id}`,
    });
  }, [
    coach.managedRoster,
    coach.starterIds,
    gamePlan.modifiers,
    gamePlan.tactics,
    opponentScheme,
    featuredIsHome,
    featuredOpponent,
    scratches,
    season.phase,
    season.playoffs,
    season.programLedger,
    season.seasonSeed,
    selectedTeam,
    weekKey,
  ]);

  const skillImpactNotes = useMemo(
    () =>
      summarizeCoachSkillImpacts({
        archetype: coach.profile?.archetype,
        skillTree: coach.skillTree,
        resources: coach.programResources,
      }),
    [coach.profile?.archetype, coach.programResources, coach.skillTree],
  );

  const fatigueClass = fatiguePillClass(gamePlan.fatigueLabel);

  const trophyHolders = season.trophyHolders ?? {};
  const trophyHolderLine = (trophy: string) => {
    const holderId = trophyHolders[trophy];
    if (!holderId) return 'up for grabs';
    if (holderId === selectedTeamId) return 'you hold it';
    return `${teams.find((team) => team.id === holderId)?.schoolName ?? 'they'} ${holderId === featuredOpponent?.id ? 'hold' : 'holds'} it`;
  };

  // Projected fatigue after this week — uses the same formula as the actual weekly cycle
  const projectedFatigue = Math.round(
    advanceFatigue(
      coach.teamFatigue,
      coach.practiceFocus,
      coach.profile?.archetype,
      coach.skillTree?.operations,
    ),
  );

  // Board recruits
  const boardRecruits = useMemo(
    () =>
      coach.boardRecruitIds
        .map((id) => coach.recruitPool.find((r) => r.id === id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r)),
    [coach.boardRecruitIds, coach.recruitPool],
  );

  const totalHours = boardRecruits.reduce(
    (sum, r) => sum + (coach.weeklyHoursByRecruitId[r.id] ?? 0),
    0,
  );
  const hoursRemaining = WEEKLY_HOURS_CAP - totalHours;
  const openBoardCount = boardRecruits.filter((r) => !r.committedTeamId).length;
  // Once every recruiting period has run, hours would never apply.
  const recruitingPeriodsDone = season.scheduleByWeek.length > 0 && coach.recruitingWeekIndex >= season.scheduleByWeek.length;

  function onHoursChange(recruitId: string, nextHours: number) {
    const current = coach.weeklyHoursByRecruitId[recruitId] ?? 0;
    const requested = Math.max(0, Math.min(MAX_HOURS_PER_RECRUIT, nextHours));
    const withoutCurrent = totalHours - current;
    const allowed = Math.min(
      MAX_HOURS_PER_RECRUIT,
      Math.max(0, WEEKLY_HOURS_CAP - withoutCurrent),
    );
    dispatch(setRecruitHours({ recruitId, hours: Math.min(requested, allowed) }));
  }

  const top25 = useAppSelector(selectRankTrends);
  const pollRank = season.phase === 'PRE' ? null : top25.find((row) => row.teamId === selectedTeamId)?.rank ?? null;

  const lastResultEdge = useMemo(() => {
    if (!userLastResult || !selectedTeam) return null;
    const opponentTeam = teams.find((team) => team.id === (userLastResult.teamAId === selectedTeamId ? userLastResult.teamBId : userLastResult.teamAId));
    // The recap reads side A as home; names follow the stored sides.
    const nameA = userLastResult.teamAId === selectedTeamId ? selectedTeam.schoolName : opponentTeam?.schoolName ?? 'Opponent';
    const nameB = userLastResult.teamAId === selectedTeamId ? opponentTeam?.schoolName ?? 'Opponent' : selectedTeam.schoolName;
    return buildGameRecap(gameResultToSummary(userLastResult), nameB, nameA).keyEdge;
  }, [selectedTeam, selectedTeamId, teams, userLastResult]);

  // Around the league: the regular-season week just played, while the poll snapshot still describes it.
  const wireWeekIndex = season.phase === 'REGULAR'
    ? season.currentWeekIndex - 1
    : season.phase === 'PLAYOFF' && season.playoffs == null
      ? season.completedWeeks - 1
      : -1;
  const leagueWire = useMemo(() => {
    if (wireWeekIndex < 0) return null;
    const teamById = new Map(teams.map((team) => [team.id, team]));
    return buildLeagueWire({
      results: season.gameResults.filter((result) => result.weekIndex === wireWeekIndex),
      rankBefore: season.previousRankByTeamId,
      rankAfter: Object.fromEntries(top25.map((row) => [row.teamId, row.rank])),
      nextWeek: season.phase === 'REGULAR' ? season.scheduleByWeek[season.currentWeekIndex] ?? [] : [],
      teamName: (teamId) => teamById.get(teamId)?.schoolName ?? 'Unknown',
      userTeamId: selectedTeamId || null,
      conferenceTeamIds: new Set(teams.filter((team) => team.conferenceId === selectedTeam?.conferenceId).map((team) => team.id)),
    });
  }, [season.currentWeekIndex, season.gameResults, season.phase, season.previousRankByTeamId, season.scheduleByWeek, selectedTeam?.conferenceId, selectedTeamId, teams, top25, wireWeekIndex]);
  const blueChipCommits = useMemo(
    () => (coach.recruitingReport?.commits ?? [])
      .filter(({ teamId }) => teamId !== selectedTeamId)
      .map(({ recruitId, teamId }) => ({ recruit: coach.recruitPool.find((recruit) => recruit.id === recruitId), teamId }))
      .filter((row): row is { recruit: Recruit; teamId: string } => Boolean(row.recruit && row.recruit.stars >= 4))
      .sort((a, b) => b.recruit.stars - a.recruit.stars || b.recruit.potential - a.recruit.potential),
    [coach.recruitPool, coach.recruitingReport, selectedTeamId],
  );
  const weeklyDesk = useMemo(
    () =>
      buildWeeklyDesk({
        phase: season.phase,
        practiceLabel: PRACTICE_FOCUS_LABELS[coach.practiceFocus],
        practiceDetail: PRACTICE_FOCUS_DETAILS[coach.practiceFocus],
        schemeLine: schemeCall(gamePlan.tactics),
        recruitPoolCount: coach.recruitPool.length,
        boardCount: openBoardCount,
        hoursAssigned: totalHours,
        hoursCap: WEEKLY_HOURS_CAP,
        autoRecruiting: coach.autoRecruiting ?? false,
        hasRoster: (coach.managedRoster?.length ?? 0) > 0,
        positionNeeds: buildPositionNeedByPosition(coach.managedRoster),
        wins: userRecord.wins,
        winTarget: coach.programExpectations?.winTarget ?? 0,
        pollRank,
        pollKnown: season.phase !== 'PRE',
        rankTarget: coach.programExpectations?.rankTarget ?? 99,
        inBracket: inBracket || inConferenceChampionship,
        fatigue: coach.teamFatigue,
      }),
    [
      openBoardCount,
      coach.autoRecruiting,
      coach.managedRoster,
      coach.practiceFocus,
      coach.programExpectations?.rankTarget,
      coach.programExpectations?.winTarget,
      coach.recruitPool.length,
      gamePlan.tactics,
      inBracket,
      inConferenceChampionship,
      coach.teamFatigue,
      pollRank,
      season.phase,
      totalHours,
      userRecord.wins,
    ],
  );

  const isRegularSeason = season.phase === 'REGULAR';
  const canAdvance =
    isRegularSeason &&
    season.scheduleByWeek.length > 0 &&
    season.currentWeekIndex < season.scheduleByWeek.length;

  const maxWeekDisplay = Math.max(1, season.scheduleByWeek.length);
  const currentWeekDisplay = Math.min(season.currentWeekIndex + 1, maxWeekDisplay);
  const offseasonCaps = careerOffseasonCapabilities({
    phase: season.phase,
    year: season.year,
    hasSelectedTeam: Boolean(selectedTeamId),
    hasProgramExpectations: Boolean(coach.programExpectations),
    signedRecruitsByYear: coach.signedRecruitsByYear,
    seasonHistory: coach.seasonHistory,
  });
  const loopStep = nextLoopStep({
    phase: season.phase,
    weekNumber: currentWeekDisplay,
    canPlayWeek: canAdvance,
    canSetBracket: season.phase === 'PLAYOFF' && season.playoffs == null,
    canPlayConferenceChampionships,
    userConferenceSeedLabel: inConferenceChampionship ? `the No. ${userConferenceSeed} seed in the ${userConference?.name ?? 'conference'}` : null,
    canPlayRound: season.phase === 'PLAYOFF' && season.playoffs != null && !season.playoffs.championTeamId,
    roundLabel: playoffRoundLabel,
    userPlaying: playoffSpot.currentGame != null,
    userBye: playoffSpot.bye,
    userEliminated: playoffSpot.eliminated,
    userMissedField: season.playoffs != null && playoffSpot.seed == null,
    canSign: offseasonCaps.canProcessSigningDay,
    canRecordSeason: offseasonCaps.canFinalizeSeason,
    canBeginNextYear: offseasonCaps.canAdvanceNextYear,
    fired: (coach.employment ?? 'ACTIVE') === 'FIRED',
  });
  const showPrep = season.phase === 'REGULAR' || season.phase === 'PRE';
  const showInstall = showPrep || inBracket || inConferenceChampionship;

  useEffect(() => {
    if (!pendingScroll.current) return;
    pendingScroll.current = false;
    document.getElementById('week-result')?.scrollIntoView({ block: 'start' });
  }, [season.currentWeekIndex, season.phase, season.playoffs?.currentRound, season.playoffs?.championTeamId]);

  async function runLoopStep() {
    if (advancing || !loopStep.button || loopStep.action === 'begin-season') return;
    if (confirmPlay && (loopStep.action === 'play-week' || loopStep.action === 'play-round' || loopStep.action === 'conference-championships')) {
      const label = loopStep.action === 'play-week' ? `week ${currentWeekDisplay}` : (loopStep.button ?? 'This round');
      const kind = loopStep.action === 'play-week' ? 'week' : 'round';
      if (!window.confirm(confirmPlayCopy(kind, label))) return;
    }
    setActionError(null);
    setAdvancing(true);
    try {
      if (loopStep.action === 'play-week') {
        pendingScroll.current = true;
        const outcome = await dispatch(runCareerWeeklyCycle()).unwrap();
        if (outcome === 'skipped') {
          pendingScroll.current = false;
          setActionError('The week did not play. Stay on this hub and try again.');
        }
      } else if (loopStep.action === 'conference-championships') {
        await dispatch(simCareerConferenceChampionships()).unwrap();
      } else if (loopStep.action === 'set-bracket') {
        await dispatch(startPlayoffs()).unwrap();
      } else if (loopStep.action === 'play-round') {
        pendingScroll.current = true;
        await dispatch(simCareerPlayoffRound()).unwrap();
      } else if (loopStep.action === 'signing-day') {
        await dispatch(processSigningDay()).unwrap();
      } else if (loopStep.action === 'record-season') {
        await dispatch(processSeasonEnd()).unwrap();
      } else if (loopStep.action === 'begin-next-year') {
        await dispatch(beginNextCareerSeason()).unwrap();
      }
    } catch (err) {
      pendingScroll.current = false;
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdvancing(false);
    }
  }

  const weeksLeft = Math.max(0, season.scheduleByWeek.length - season.currentWeekIndex);

  async function simToBracket() {
    if (advancing || loopStep.action !== 'play-week') return;
    const recruitingLine = coach.recruitPool.length === 0
      ? ''
      : coach.autoRecruiting
        ? ' Your staff runs recruiting each week.'
        : ' Recruiting keeps your current hours each week. Turn on "Staff runs recruiting" to have them re-planned.';
    if (!window.confirm(`Play the last ${weeksLeft} regular-season weeks?${recruitingLine}`)) return;
    setActionError(null);
    setAdvancing(true);
    pendingScroll.current = true;
    try {
      const played = await dispatch(simCareerToBracket()).unwrap();
      if (played < weeksLeft) {
        setActionError(`Stopped after ${played} of ${weeksLeft} weeks. Stay on this hub and try again.`);
      }
    } catch (err) {
      pendingScroll.current = false;
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdvancing(false);
    }
  }

  if (!isCoachReady) {
    return <Navigate to="/career/setup" replace />;
  }

  return (
    <div className="pageStack">
      <PageHeader
        eyebrow="Program"
        title="Weekly Hub"
        subtitle={
          <>
            {seasonPhaseLabel(season.phase, season.currentWeekIndex, season.scheduleByWeek.length)} · {selectedTeam?.schoolName} {selectedTeam?.nickname} · {userRecord.wins}–{userRecord.losses} overall · {userRecord.confWins}–{userRecord.confLosses} conf
          </>
        }
      />

      {playoffSpot.lastGame?.result && (season.phase === 'PLAYOFF' || season.phase === 'OFFSEASON') ? (
        <Scoreboard
          heading={`${PLAYOFF_ROUND_LABELS[playoffSpot.lastGame.round]} final`}
          won={playoffSpot.lastGame.winnerTeamId === selectedTeamId}
          user={selectedTeam}
          opponent={teams.find((team) => team.id === (playoffSpot.lastGame?.homeTeamId === selectedTeamId ? playoffSpot.lastGame.awayTeamId : playoffSpot.lastGame?.homeTeamId))}
          userScore={playoffSpot.lastGame.homeTeamId === selectedTeamId ? playoffSpot.lastGame.result.homeScore : playoffSpot.lastGame.result.awayScore}
          oppScore={playoffSpot.lastGame.homeTeamId === selectedTeamId ? playoffSpot.lastGame.result.awayScore : playoffSpot.lastGame.result.homeScore}
          userStats={playoffSpot.lastGame.homeTeamId === selectedTeamId ? playoffSpot.lastGame.result.teamStatsHome : playoffSpot.lastGame.result.teamStatsAway}
          oppStats={playoffSpot.lastGame.homeTeamId === selectedTeamId ? playoffSpot.lastGame.result.teamStatsAway : playoffSpot.lastGame.result.teamStatsHome}
        />
      ) : lastConferenceGame && (season.phase === 'PLAYOFF' || season.phase === 'OFFSEASON') ? (
        <Scoreboard
          heading={lastConferenceGame.round === 'FINAL' ? 'Conference final' : 'Conference semifinal'}
          won={lastConferenceGame.winnerTeamId === selectedTeamId}
          user={selectedTeam}
          opponent={teams.find((team) => team.id === (lastConferenceGame.homeTeamId === selectedTeamId ? lastConferenceGame.awayTeamId : lastConferenceGame.homeTeamId))}
          userScore={lastConferenceGame.homeTeamId === selectedTeamId ? lastConferenceGame.homeScore : lastConferenceGame.awayScore}
          oppScore={lastConferenceGame.homeTeamId === selectedTeamId ? lastConferenceGame.awayScore : lastConferenceGame.homeScore}
        />
      ) : userLastResult ? (
        <Scoreboard
          heading={`Week ${(userLastResult.weekIndex ?? 0) + 1} final`}
          won={(userLastResult.teamAId === selectedTeamId ? userLastResult.scoreA : userLastResult.scoreB) > (userLastResult.teamAId === selectedTeamId ? userLastResult.scoreB : userLastResult.scoreA)}
          user={selectedTeam}
          opponent={teams.find((team) => team.id === (userLastResult.teamAId === selectedTeamId ? userLastResult.teamBId : userLastResult.teamAId))}
          userScore={userLastResult.teamAId === selectedTeamId ? userLastResult.scoreA : userLastResult.scoreB}
          oppScore={userLastResult.teamAId === selectedTeamId ? userLastResult.scoreB : userLastResult.scoreA}
          ledBy={regularLedBy(userLastResult, selectedTeamId)}
          userStats={userLastResult.teamAId === selectedTeamId ? userLastResult.statsA : userLastResult.statsB}
          oppStats={userLastResult.teamAId === selectedTeamId ? userLastResult.statsB : userLastResult.statsA}
          keyEdge={lastResultEdge ?? undefined}
          plays={userLastResult.highlights.slice(0, 4)}
        />
      ) : null}

      <section className="card matchupBoard" aria-labelledby="loop-title">
        {actionError && (
          <p className="text-sm text-red-600 mb-3" role="alert">{actionError}</p>
        )}
        <div className="matchupBoardTop">
          <h3 id="loop-title" className="m-0 text-base font-bold">{loopStep.title}</h3>
          {featuredOpponent && (
            <p className="matchupKicker">
              {featuredIsHome ? 'Home' : 'Away'}
              {season.phase === 'REGULAR'
                ? userUpcomingGame?.rivalryTrophy
                  ? ` · Rivalry: ${userUpcomingGame.rivalryTrophy}`
                  : userUpcomingGame?.conferenceGame ? ' · Conference' : ' · Non-conference'
                : playoffRoundLabel ? ` · ${playoffRoundLabel}` : ''}
              {season.phase === 'REGULAR' && userUpcomingGame?.rivalryTrophy && (
                <> · {trophyHolderLine(userUpcomingGame.rivalryTrophy)}</>
              )}
            </p>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-1 mb-0">{loopStep.detail}</p>
        {tournamentRun && season.phase === 'PLAYOFF' && (
          <p className="text-sm mt-1 mb-0">
            <strong>{userConference?.name ?? 'Conference'} championship:</strong>{' '}
            {tournamentRun.games.map((game) => {
              const isHomeSide = game.homeTeamId === selectedTeamId;
              const opponentName = teams.find((team) => team.id === (isHomeSide ? game.awayTeamId : game.homeTeamId))?.schoolName ?? 'Opponent';
              const own = isHomeSide ? game.homeScore : game.awayScore;
              const theirs = isHomeSide ? game.awayScore : game.homeScore;
              return `${game.winnerTeamId === selectedTeamId ? 'beat' : 'lost to'} ${opponentName} ${own}–${theirs}${game.round === 'FINAL' ? ' in the final' : ' in the semifinal'}`;
            }).join(', ')}
            {tournamentRun.tournament.championTeamId === selectedTeamId ? '. Conference champions.' : '.'}
          </p>
        )}
        {featuredOpponent && featuredRecord && selectedTeam && (
          <div className="matchupSides">
            <div className="matchupSide">
              <div className="matchupIdentity">
                <TeamLogo team={selectedTeam} />
                <div>
                  <Link to={`/team/${selectedTeam.id}`} className="matchupSchool">{selectedTeam.schoolName}</Link>
                  <span className="matchupNick">{selectedTeam.nickname}</span>
                  <span className="matchupRecord">
                    {userRecord.wins}–{userRecord.losses}
                    <PointDiff pointsFor={userRecord.pointsFor} pointsAgainst={userRecord.pointsAgainst} played={userRecord.wins + userRecord.losses} />
                  </span>
                </div>
              </div>
            </div>
            <div className="matchupProb">
              {winProb !== null && showWinChance ? (
                <>
                  <span className={`matchupProbValue ${winProbClass(winProb)}`}>{winProb}%</span>
                  <span className="matchupProbLabel">Estimate</span>
                  <div
                    className="meter meter-lg"
                    role="progressbar"
                    aria-valuenow={winProb}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Win estimate"
                  >
                    <span style={{ width: `${winProb}%` }} />
                  </div>
                </>
              ) : (
                <span className="matchupProbLabel">vs</span>
              )}
            </div>
            <div className="matchupSide matchupSide-away">
              <div className="matchupIdentity">
                <TeamLogo team={featuredOpponent} />
                <div>
                  <Link to={`/team/${featuredOpponent.id}`} className="matchupSchool">{featuredOpponent.schoolName}</Link>
                  <span className="matchupNick">{featuredOpponent.nickname}</span>
                  <span className="matchupRecord">
                    {featuredRecord.wins}–{featuredRecord.losses}
                    <PointDiff pointsFor={featuredRecord.pointsFor} pointsAgainst={featuredRecord.pointsAgainst} played={featuredRecord.wins + featuredRecord.losses} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        {scratches.length > 0 && (
          <p className="text-sm text-red-600 mt-3 mb-0">
            Out this week: {scratches
              .map((scratch) => `${scratch.name} (${scratch.position}, ${scratch.injury.toLowerCase()}, ${injuryTimeline(scratch)})`)
              .join('; ')}
          </p>
        )}
        <div className="loopActions">
          {loopStep.action === 'begin-season' ? (
            <Link to="/season" className="btn btn-primary">Begin season</Link>
          ) : loopStep.action === 'take-job' ? (
            <Link to="/career" className="btn btn-primary">Take a job</Link>
          ) : loopStep.button ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={advancing}
              aria-busy={advancing}
              onClick={runLoopStep}
            >
              {advancing ? 'Working…' : loopStep.button}
            </button>
          ) : null}
          {loopStep.action === 'play-week' && weeksLeft > 1 && (
            <button type="button" className="btn" disabled={advancing} onClick={simToBracket}>
              Sim to the bracket
            </button>
          )}
          {season.phase === 'PLAYOFF' && (season.playoffs
            ? <Link to="/playoffs" className="btn">Full bracket</Link>
            : <Link to="/rankings" className="btn">Projected field</Link>)}
          {season.phase === 'OFFSEASON' && (
            <Link to="/career" className="btn">Coach Office</Link>
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="weekly-desk-title">
        <h3 id="weekly-desk-title" className="m-0 text-base font-bold">This week</h3>
        <p className="text-sm text-gray-500 mt-1 mb-3">
          {season.phase === 'PLAYOFF'
            ? inBracket
              ? 'The bracket is the job. Set the install for this round, then play it.'
              : inConferenceChampionship
                ? 'Conference championship week. Set the install, then play your semifinal.'
                : season.playoffs == null
                  ? 'Selection is next. A program outside the automatic bids can still get in at-large.'
                  : 'Your season is over. The install comes back next regular season.'
              : season.phase === 'OFFSEASON'
              ? (coach.employment ?? 'ACTIVE') === 'FIRED'
                ? 'The AD let you go. Take a landing job on the office before the next year.'
                : offseasonCaps.canProcessSigningDay
                  ? 'Signing day and the season record are the next clicks. The portal can wait.'
                  : offseasonCaps.canFinalizeSeason
                    ? 'The class is signed. Record the season next.'
                    : 'Before the new year: check the portal, the pro draft, and the depth chart.'
              : 'Set the install and the board, then play the week.'}
        </p>
        <ul className="deskList">
          {weeklyDesk.map((task) => (
            <li key={task.id} className={`deskItem deskItem-${task.tone}`}>
              <span className="deskStatus">{task.tone === 'ready' ? 'Ready' : task.tone === 'watch' ? 'Watch' : 'Open'}</span>
              <div>
                <div className="deskTitle">{task.title}</div>
                <p className="deskDetail">{task.detail}</p>
              </div>
              {task.href?.startsWith('#') ? (
                <a href={task.href} className="deskAction">{task.action}</a>
              ) : task.href ? (
                <Link to={task.href} className="deskAction">{task.action}</Link>
              ) : task.action ? (
                <span className="deskAction">{task.action}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {leagueWire && (
        <LeagueWirePanel
          wire={leagueWire}
          weekIndex={wireWeekIndex}
          teams={teams}
          userTeamId={selectedTeamId || null}
          conferenceName={userConference?.name ?? null}
          blueChipCommits={blueChipCommits}
        />
      )}

      <div className={showInstall ? 'grid2' : undefined}>
        {showInstall && (
        <section className="card" id="week-practice" aria-labelledby="week-practice-title">
          <h3 id="week-practice-title" className="m-0 mb-1 text-base font-bold">Install</h3>
          <p className="text-xs text-gray-500 mt-0 mb-3">
            What practice works on this week: its game-day edge, the traits it grows, and its fatigue cost. An install can override a base-scheme call on game day.
          </p>
          <InstallPicker
            value={coach.practiceFocus}
            onChange={(focus) => dispatch(setPracticeFocus(focus))}
            archetype={coach.profile?.archetype}
            operationsSkill={coach.skillTree?.operations}
          />
          <div className="planReadout planReadout-pair mt-3">
            <div>
              <div className="planReadoutLabel">Fatigue</div>
              <div className="planReadoutValue">
                <span className={fatigueClass}>{gamePlan.fatigueLabel}</span>
                {' '}
                {Math.round(coach.teamFatigue)}%
                <span className="planReadoutMeta"> → {projectedFatigue}%</span>
              </div>
            </div>
            <div>
              <div className="planReadoutLabel">Game-day edge</div>
              <GameDayEdge plan={gamePlan} opponent={opponentScheme} />
            </div>
          </div>
          <div className="planReadoutLabel mt-3">Game day</div>
          <GameDayScheme plan={gamePlan} changes={gameDayChanges} />
          {featuredOpponent && opponentScheme && (
            <>
              <div className="planReadoutLabel mt-3">Scouting: {featuredOpponent.schoolName}</div>
              <ScoutingReport
                plan={gamePlan}
                opponent={opponentScheme}
                opponentBase={opponentBaseScheme}
                opponentName={featuredOpponent.schoolName}
                respond={featuredGameId
                  ? (calls) => gameDayProgramTactics(featuredOpponent, calls, `${season.seasonSeed}:${featuredGameId}`)
                  : undefined}
              />
            </>
          )}
          <Link to="/career#game-plan" className="text-sm hover:underline inline-block mt-3">
            Change the base scheme in the Coach Office
          </Link>
        </section>
        )}

        <div className="card">
          <h3 className="m-0 mb-3 text-base font-bold">Coach skill snapshot</h3>
          <div className="text-xs text-gray-500 mb-2">
            Recruiting {coach.skillTree.recruiting}/{MAX_COACH_SKILL_LEVEL} · Development {coach.skillTree.development}/{MAX_COACH_SKILL_LEVEL} · Operations {coach.skillTree.operations}/{MAX_COACH_SKILL_LEVEL}
          </div>
          <ul className="m-0 pl-4 text-sm text-gray-600 space-y-1">
            {skillImpactNotes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="mt-3">
            <Link to="/career" className="text-sm hover:underline">
              Upgrade coach skills in the Coach Office
            </Link>
          </div>
        </div>
      </div>

      {/* ── Recruiting board compact ── */}
      {showPrep && boardRecruits.length > 0 && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="m-0 text-base font-bold">Active recruiting board</h3>
              <div className="text-xs text-gray-500 mt-0.5">
                {openBoardCount} open of {boardRecruits.length} targets · Hours remaining:{' '}
                <span className={`font-semibold ${hoursRemaining < 0 ? 'text-hours-over' : 'text-hours-ok'}`}>
                  {hoursRemaining}/{WEEKLY_HOURS_CAP}
                </span>
              </div>
            </div>
            <Link to="/career/recruiting" className="text-sm hover:underline">
              Full board
            </Link>
          </div>
          <div className="mb-3">
            <StaffRecruitingControls canPlan={isRegularSeason && coach.recruitingWeekIndex < season.scheduleByWeek.length} />
          </div>
          {coach.recruitingReport && (
            <div className="mb-3">
              <RecruitingReportNote report={coach.recruitingReport} recruitPool={coach.recruitPool} teams={teams} />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b">
                  <th scope="col" className="text-left pb-1.5 pr-3">Recruit</th>
                  <th scope="col" className="text-left pb-1.5 pr-3">Interest</th>
                  <th scope="col" className="text-right pb-1.5 w-20">Hours</th>
                </tr>
              </thead>
              <tbody>
                {boardRecruits.slice(0, 8).map((recruit) => {
                  const interest =
                    (recruit.interestByTeamId?.[selectedTeamId] ?? 0);
                  const committed = recruit.committedTeamId === selectedTeamId;
                  return (
                    <tr key={recruit.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-3">
                        <span className="font-semibold">{recruit.name}</span>
                        {committed && (
                          <span className="ml-1.5 text-xs text-green-600 font-bold">
                            ✓
                          </span>
                        )}
                        {recruit.committedTeamId && !committed && (
                          <span className="ml-1.5 text-xs text-red-500">
                            Committed: {teams.find((t) => t.id === recruit.committedTeamId)?.schoolName ?? 'Other'}
                          </span>
                        )}
                        <div className="text-xs text-gray-400">
                          <span className="text-yellow-500" aria-label={`${recruit.stars} stars`}>{'★'.repeat(recruit.stars)}</span> {recruit.position} · {recruit.region}
                        </div>
                      </td>
                      <td className="py-1.5 pr-3">
                        <div
                          className={`meter mb-0.5 ${interest >= 100 ? 'meter-full' : ''}`}
                          role="progressbar"
                          aria-valuenow={Math.min(100, interest)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${recruit.name} interest`}
                        >
                          <span style={{ width: `${Math.min(100, interest)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{interest}%</span>
                      </td>
                      <td className="py-1.5 text-right">
                        <input
                          type="number"
                          min={0}
                          max={MAX_HOURS_PER_RECRUIT}
                          value={coach.weeklyHoursByRecruitId[recruit.id] ?? 0}
                          onChange={(e) =>
                            onHoursChange(recruit.id, Number(e.target.value) || 0)
                          }
                          disabled={Boolean(recruit.committedTeamId) || recruitingPeriodsDone}
                          className="w-12 p-1 border rounded text-center text-sm"
                          aria-label={`Recruiting hours for ${recruit.name}`}
                        />
                      </td>
                    </tr>
                  );
                })}
                {boardRecruits.length > 8 && (
                  <tr>
                    <td colSpan={3} className="py-1.5 text-xs text-gray-400 text-center">
                      +{boardRecruits.length - 8} more on board —{' '}
                      <Link to="/career/recruiting" className="hover:underline">
                        view all
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPrep && boardRecruits.length === 0 && coach.recruitPool.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="m-0 text-base font-bold">Recruiting board</h3>
              <p className="text-sm text-gray-500 mt-1 mb-0">
                {coach.autoRecruiting
                  ? 'No active targets yet. Your staff fills the board before the week plays.'
                  : 'No active targets. Add prospects to your board to allocate recruiting hours this week.'}
              </p>
            </div>
            <Link to="/career/recruiting" className="btn btn-primary text-sm">
              Open board
            </Link>
          </div>
          <div className="mt-3">
            <StaffRecruitingControls canPlan={isRegularSeason && coach.recruitingWeekIndex < season.scheduleByWeek.length} />
          </div>
        </div>
      )}

    </div>
  );
}

export default WeeklyHubPage;
