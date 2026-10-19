import { useMemo, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import {
  selectRankTrends,
  selectTeamRecords,
  selectUserUpcomingGame,
  selectUserLastResult,
} from '../features/season/seasonSlice';
import {
  setPracticeFocus,
  setRecruitHours,
  selectIsCareerReady,
  selectUserEffectivePrestige,
  WEEKLY_HOURS_CAP,
  MAX_HOURS_PER_RECRUIT,
} from '../features/coach/coachSlice';
import { runCareerWeeklyCycle } from '../features/coach/careerThunks';
import { advanceFatigue, buildCoachGamePlan, summarizeCoachSkillImpacts, PRACTICE_FOCUS_LABELS } from '../sim/coachEffects';
import { buildPositionNeedByPosition } from '../sim/recruiting';
import { buildWeeklyDesk } from '../sim/weeklyDesk';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { PracticeFocus, GameResult, Tactics } from '../types/sim';

function schemeCall(tactics: Tactics): string {
  const tempo = tactics.tempo === 'fast' ? 'Fast tempo' : tactics.tempo === 'slow' ? 'Slow tempo' : 'Balanced tempo';
  const defense =
    tactics.defensePackage === 'zone'
      ? 'Zone defense'
      : tactics.defensePackage === 'pressure'
        ? 'Pressure defense'
        : 'Man defense';
  return `${tempo} · ${defense}`;
}

const PRACTICE_FOCUS_DESCRIPTIONS: Record<PracticeFocus, string> = {
  OFFENSE: 'Boosts attack edge and tempo; defensive ratings dip slightly.',
  DEFENSE: 'Hardens D and goalie; may tighten offensive rhythm.',
  CONDITIONING: 'Builds faceoff & ground-ball legs; lowest fatigue build.',
  DISCIPLINE: 'Cuts turnovers and penalties; no direct scoring edge.',
};

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

interface ResultBannerProps {
  result: GameResult;
  selectedTeamId: string;
  teams: { id: string; schoolName: string; nickname: string }[];
}

function ResultBanner({ result, selectedTeamId, teams }: ResultBannerProps) {
  const isTeamA = result.teamAId === selectedTeamId;
  const userScore = isTeamA ? result.scoreA : result.scoreB;
  const oppScore = isTeamA ? result.scoreB : result.scoreA;
  const oppId = isTeamA ? result.teamBId : result.teamAId;
  const opp = teams.find((t) => t.id === oppId);
  const won = userScore > oppScore;

  const topPerfs = isTeamA
    ? result.topPlayersA.slice(0, 2)
    : result.topPlayersB.slice(0, 2);

  return (
    <div className={`card border-l-4 ${won ? 'border-win' : 'border-loss'}`}>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-500 uppercase font-semibold">
          Last Game — Week {(result.weekIndex ?? 0) + 1}
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${won ? 'badge-win' : 'badge-loss'}`}>
          {won ? 'WIN' : 'LOSS'}
        </span>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold">{userScore}</span>
        <span className="text-gray-400 text-sm">–</span>
        <span className="text-xl text-gray-600">{oppScore}</span>
        <span className="text-sm text-gray-500 ml-2">
          vs {opp?.schoolName ?? 'Opponent'}
        </span>
      </div>
      {topPerfs.length > 0 && (
        <div className="text-xs text-gray-500 mt-1.5">
          Top performers:{' '}
          {topPerfs
            .map((p) => {
              const parts: string[] = [];
              if (p.goals > 0) parts.push(`${p.goals}g`);
              if (p.assists > 0) parts.push(`${p.assists}a`);
              if (p.saves > 0) parts.push(`${p.saves}sv`);
              return `${p.name}${parts.length ? ` (${parts.join(' ')})` : ''}`;
            })
            .join(' · ')}
        </div>
      )}
    </div>
  );
}

function WeeklyHubPage() {
  const dispatch = useAppDispatch();
  const [actionError, setActionError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const coach = useAppSelector((state) => state.coach);
  const season = useAppSelector((state) => state.season);
  const teams = useAppSelector((state) => state.league.teams);
  const records = useAppSelector(selectTeamRecords);
  const userUpcomingGame = useAppSelector(selectUserUpcomingGame);
  const userLastResult = useAppSelector(selectUserLastResult);
  const effectivePrestige = useAppSelector(selectUserEffectivePrestige);
  const isCoachReady = useAppSelector(selectIsCareerReady);
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
  const opponent = opponentId ? teams.find((t) => t.id === opponentId) : null;
  const opponentRecord = opponentId
    ? records[opponentId] ?? {
        wins: 0,
        losses: 0,
        confWins: 0,
        confLosses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      }
    : null;

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

  // Win probability blends prestige, roster quality, home edge, fatigue, and practice mods.
  const winProb = useMemo(() => {
    if (!selectedTeam || !opponent) return null;
    const roster = coach.managedRoster ?? [];
    const rosterEdge =
      roster.length > 0
        ? roster.reduce((sum, player) => sum + player.overall, 0) / roster.length - 72
        : 0;
    const modEdge =
      (gamePlan.modifiers.offense ?? 0) +
      (gamePlan.modifiers.defense ?? 0) +
      (gamePlan.modifiers.faceoff ?? 0) * 0.5;
    const fatiguePenalty = coach.teamFatigue * 0.08;
    const homeEdge = isHome ? 3 : -1;
    const userStrength = Math.max(
      20,
      (effectivePrestige ?? selectedTeam.prestige) + rosterEdge + modEdge + homeEdge - fatiguePenalty,
    );
    const oppStrength = Math.max(20, opponent.prestige);
    return Math.round((userStrength / (userStrength + oppStrength)) * 100);
  }, [
    coach.managedRoster,
    coach.teamFatigue,
    effectivePrestige,
    gamePlan.modifiers.defense,
    gamePlan.modifiers.faceoff,
    gamePlan.modifiers.offense,
    isHome,
    opponent,
    selectedTeam,
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
  const weeklyDesk = useMemo(
    () =>
      buildWeeklyDesk({
        phase: season.phase,
        practiceLabel: PRACTICE_FOCUS_LABELS[coach.practiceFocus],
        practiceDetail: PRACTICE_FOCUS_DESCRIPTIONS[coach.practiceFocus],
        schemeLine: schemeCall(coach.tactics),
        recruitPoolCount: coach.recruitPool.length,
        boardCount: boardRecruits.length,
        hoursAssigned: totalHours,
        hoursCap: WEEKLY_HOURS_CAP,
        hasRoster: (coach.managedRoster?.length ?? 0) > 0,
        positionNeeds: buildPositionNeedByPosition(coach.managedRoster),
        wins: userRecord.wins,
        winTarget: coach.programExpectations?.winTarget ?? 0,
        pollRank,
        pollKnown: season.phase !== 'PRE',
        rankTarget: coach.programExpectations?.rankTarget ?? 99,
      }),
    [
      boardRecruits.length,
      coach.managedRoster,
      coach.practiceFocus,
      coach.programExpectations?.rankTarget,
      coach.programExpectations?.winTarget,
      coach.recruitPool.length,
      coach.tactics,
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

  if (!isCoachReady) {
    return <Navigate to="/career/setup" replace />;
  }

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h2 className="m-0">Week {currentWeekDisplay} Hub</h2>
        <p className="pageHeader-sub">
          {selectedTeam?.schoolName} {selectedTeam?.nickname} · {userRecord.wins}–{userRecord.losses} overall · {userRecord.confWins}–{userRecord.confLosses} conf
        </p>
      </div>

      <div className="card">
        {actionError && (
          <p className="text-sm text-red-600 mb-3" role="alert">
            {actionError}
          </p>
        )}
        <div className="weekActionBar">
          <div>
            <h3 className="m-0 text-base font-bold">
              {canAdvance ? `Advance week ${currentWeekDisplay}` : 'Season locked'}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5 mb-0">
              {canAdvance
                ? 'Plays every game this week, then updates recruiting and your roster.'
                : season.phase === 'PLAYOFF'
                  ? 'Regular season complete. Go to playoffs.'
                  : season.phase === 'OFFSEASON'
                    ? 'Head to the coach office to finish the offseason.'
                    : season.phase === 'PRE'
                      ? 'Begin the season from the season dashboard to unlock weekly advances.'
                      : 'Season complete.'}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {canAdvance && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={advancing}
                aria-busy={advancing}
                onClick={async () => {
                  if (advancing) return;
                  setActionError(null);
                  setAdvancing(true);
                  try {
                    await dispatch(runCareerWeeklyCycle()).unwrap();
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setAdvancing(false);
                  }
                }}
              >
                {advancing ? 'Advancing…' : `Advance week ${currentWeekDisplay}`}
              </button>
            )}
            {season.phase === 'PLAYOFF' && (
              <Link to="/playoffs" className="btn btn-primary">
                Go to playoffs
              </Link>
            )}
            {season.phase === 'OFFSEASON' && (
              <Link to="/career" className="btn btn-primary">
                Coach office
              </Link>
            )}
            {season.phase === 'PRE' && (
              <Link to="/season" className="btn btn-primary">
                Begin season
              </Link>
            )}
            <Link to="/season" className="btn text-sm">
              Season dashboard
            </Link>
          </div>
        </div>
      </div>

      <section className="card" aria-labelledby="weekly-desk-title">
        <h3 id="weekly-desk-title" className="m-0 text-base font-bold">This week</h3>
        <p className="text-sm text-gray-500 mt-1 mb-3">
          {season.phase === 'PLAYOFF'
            ? 'The regular-season desk is closed. The bracket is the job now.'
            : season.phase === 'OFFSEASON'
              ? 'Close the class and the AD review before next year.'
              : 'Set the game plan and the board, then play the week.'}
        </p>
        <ul className="deskList">
          {weeklyDesk.map((task) => (
            <li key={task.id} className={`deskItem deskItem-${task.tone}`}>
              <span className="deskStatus">{task.tone === 'ready' ? 'Ready' : task.tone === 'watch' ? 'Watch' : 'Open'}</span>
              <div>
                <div className="deskTitle">{task.title}</div>
                <p className="deskDetail">{task.detail}</p>
              </div>
              {task.href ? (
                <Link to={task.href} className="deskAction">{task.action}</Link>
              ) : (
                <span className="deskAction">{task.action}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Last game result banner ── */}
      {userLastResult && (
        <ResultBanner
          result={userLastResult}
          selectedTeamId={selectedTeamId}
          teams={teams}
        />
      )}

      <div className="grid2">
        {/* ── Upcoming opponent ── */}
        <div className="card">
          <h3 className="m-0 mb-3 text-base font-bold">
            {isRegularSeason ? `Week ${currentWeekDisplay} Matchup` : 'No Upcoming Game'}
          </h3>
          {opponent && opponentRecord ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-bold text-lg">
                    {isHome ? 'vs' : '@'}{' '}
                    <Link to={`/team/${opponent.id}`}>{opponent.schoolName}</Link>
                  </div>
                  <div className="text-sm text-gray-500">{opponent.nickname}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Prestige {opponent.prestige} · {isHome ? 'Home' : 'Away'}
                    {userUpcomingGame?.conferenceGame && ' · Conference'}
                  </div>
                </div>
                {winProb !== null && (
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${winProbClass(winProb)}`}>
                      {winProb}%
                    </div>
                    <div className="text-xs text-gray-500">Win prob.</div>
                  </div>
                )}
              </div>
              <div className="flex gap-6 text-sm border-t pt-3">
                <div>
                  <div className="text-xs text-gray-400 uppercase mb-0.5">Overall</div>
                  <div className="font-semibold">
                    {opponentRecord.wins}–{opponentRecord.losses}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase mb-0.5">Conference</div>
                  <div className="font-semibold">
                    {opponentRecord.confWins}–{opponentRecord.confLosses}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase mb-0.5">Scoring Diff</div>
                  {(() => {
                    const diff = opponentRecord.pointsFor - opponentRecord.pointsAgainst;
                    return (
                      <div className={diff >= 0 ? 'text-success font-semibold' : 'text-danger font-semibold'}>
                        {diff > 0 ? '+' : ''}{diff}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              {season.phase === 'PRE'
                ? 'Season has not started yet.'
                : season.phase === 'PLAYOFF'
                  ? 'Regular season complete — playoffs are underway.'
                  : season.phase === 'OFFSEASON'
                    ? 'Season complete. Start the next season from the Career page.'
                    : 'No game scheduled this week.'}
            </p>
          )}
        </div>

        {/* ── Practice focus ── */}
        <div className="card">
          <h3 className="m-0 mb-3 text-base font-bold">Practice Focus</h3>
          <div className="choiceGrid mb-3">
            {(Object.keys(PRACTICE_FOCUS_LABELS) as PracticeFocus[]).map((focus) => (
              <button
                key={focus}
                type="button"
                aria-pressed={coach.practiceFocus === focus}
                onClick={() => dispatch(setPracticeFocus(focus))}
                className="choiceChip"
              >
                <span className="font-semibold">{PRACTICE_FOCUS_LABELS[focus]}</span>
                <span className="choiceChipHelp">{PRACTICE_FOCUS_DESCRIPTIONS[focus]}</span>
              </button>
            ))}
          </div>
          <div className="border-t pt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-gray-400 uppercase mb-1">Fatigue now</div>
              <div className="flex items-center gap-1.5">
                <span className={fatigueClass}>
                  {gamePlan.fatigueLabel}
                </span>
                <span className="text-gray-600">{coach.teamFatigue}%</span>
                <span className="text-gray-400">→</span>
                <span className="font-semibold text-gray-700">{projectedFatigue}%</span>
              </div>
            </div>
            <div>
              <div className="text-gray-400 uppercase mb-1">Gameplan edge</div>
              <div className="text-gray-600">
                Off {gamePlan.modifiers.offense >= 0 ? '+' : ''}
                {gamePlan.modifiers.offense.toFixed(1)} · Def{' '}
                {gamePlan.modifiers.defense >= 0 ? '+' : ''}
                {gamePlan.modifiers.defense.toFixed(1)} · Disc{' '}
                {gamePlan.modifiers.discipline >= 0 ? '+' : ''}
                {gamePlan.modifiers.discipline.toFixed(1)}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="m-0 mb-3 text-base font-bold">Coach Skill Snapshot</h3>
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
              Upgrade coach skills in the coach office
            </Link>
          </div>
        </div>
      </div>

      {/* ── Recruiting board compact ── */}
      {boardRecruits.length > 0 && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="m-0 text-base font-bold">Active Recruiting Board</h3>
              <div className="text-xs text-gray-500 mt-0.5">
                {boardRecruits.length} targets · Hours remaining:{' '}
                <span className={`font-semibold ${hoursRemaining < 0 ? 'text-hours-over' : 'text-hours-ok'}`}>
                  {hoursRemaining}/{WEEKLY_HOURS_CAP}
                </span>
              </div>
            </div>
            <Link to="/career/recruiting" className="text-sm hover:underline">
              Full board
            </Link>
          </div>
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
                        <div className="text-xs text-gray-400">
                          {'★'.repeat(recruit.stars)} {recruit.position} · {recruit.region}
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

      {boardRecruits.length === 0 && coach.recruitPool.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="m-0 text-base font-bold">Recruiting Board</h3>
              <p className="text-sm text-gray-500 mt-1 mb-0">
                No active targets. Add prospects to your board to allocate recruiting hours this week.
              </p>
            </div>
            <Link to="/career/recruiting" className="btn btn-primary text-sm">
              Open Board →
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}

export default WeeklyHubPage;
