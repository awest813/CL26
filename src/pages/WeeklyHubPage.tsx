import { useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import {
  selectTeamRecords,
  selectUserUpcomingGame,
  selectUserLastResult,
} from '../features/season/seasonSlice';
import {
  setPracticeFocus,
  setRecruitHours,
  WEEKLY_HOURS_CAP,
  MAX_HOURS_PER_RECRUIT,
} from '../features/coach/coachSlice';
import { runCareerWeeklyCycle } from '../features/coach/careerThunks';
import { buildCoachGamePlan } from '../sim/coachEffects';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { PracticeFocus, GameResult } from '../types/sim';

const PRACTICE_FOCUS_LABELS: Record<PracticeFocus, string> = {
  OFFENSE: 'Offense Install',
  DEFENSE: 'Defense Install',
  CONDITIONING: 'Conditioning',
  DISCIPLINE: 'Discipline',
};

const PRACTICE_FOCUS_DESCRIPTIONS: Record<PracticeFocus, string> = {
  OFFENSE: 'Boosts attack edge and tempo; defensive ratings dip slightly.',
  DEFENSE: 'Hardens D and goalie; may tighten offensive rhythm.',
  CONDITIONING: 'Builds faceoff & ground-ball legs; lowest fatigue build.',
  DISCIPLINE: 'Cuts turnovers and penalties; no direct scoring edge.',
};

const FOCUS_FATIGUE_DELTA: Record<PracticeFocus, number> = {
  OFFENSE: 6,
  DEFENSE: 7,
  CONDITIONING: -3,
  DISCIPLINE: 3,
};

function fatiguePill(label: string): { bg: string; text: string } {
  if (label === 'Drained') return { bg: '#fef2f2', text: '#b91c1c' };
  if (label === 'Worn') return { bg: '#fff7ed', text: '#c2410c' };
  if (label === 'Managed') return { bg: '#fefce8', text: '#92400e' };
  return { bg: '#f0fdf4', text: '#15803d' };
}

function winProbColor(prob: number): string {
  if (prob >= 65) return '#16a34a';
  if (prob >= 50) return '#4ade80';
  if (prob >= 40) return '#f59e0b';
  return '#ef4444';
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
    <div
      className="card"
      style={{ borderLeft: `4px solid ${won ? '#16a34a' : '#ef4444'}` }}
    >
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-500 uppercase font-semibold">
          Last Game — Week {(result.weekIndex ?? 0) + 1}
        </span>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{
            background: won ? '#dcfce7' : '#fee2e2',
            color: won ? '#15803d' : '#b91c1c',
          }}
        >
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
  const coach = useAppSelector((state) => state.coach);
  const season = useAppSelector((state) => state.season);
  const teams = useAppSelector((state) => state.league.teams);
  const records = useAppSelector(selectTeamRecords);
  const userUpcomingGame = useAppSelector(selectUserUpcomingGame);
  const userLastResult = useAppSelector(selectUserLastResult);

  if (coach.onboardingStep !== 'READY' || !coach.selectedTeamId) {
    return <Navigate to="/career/setup" replace />;
  }

  const selectedTeamId = coach.selectedTeamId;
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

  // Win probability (prestige-based)
  const winProb =
    selectedTeam && opponent
      ? Math.round(
          (selectedTeam.prestige / (selectedTeam.prestige + opponent.prestige)) * 100,
        )
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

  const { bg: fatigueBg, text: fatigueText } = fatiguePill(gamePlan.fatigueLabel);

  // Projected fatigue after this week
  const focusDelta = FOCUS_FATIGUE_DELTA[coach.practiceFocus];
  const projectedFatigue = Math.max(0, Math.min(100, coach.teamFatigue + focusDelta));

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

  const isRegularSeason = season.phase === 'REGULAR';
  const canAdvance =
    isRegularSeason &&
    season.scheduleByWeek.length === 12 &&
    season.currentWeekIndex < 12;

  const currentWeekDisplay = season.currentWeekIndex + 1;

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h2 className="m-0">Week {currentWeekDisplay} Hub</h2>
        <p className="pageHeader-sub">
          {selectedTeam?.schoolName} {selectedTeam?.nickname} · {userRecord.wins}–{userRecord.losses} overall · {userRecord.confWins}–{userRecord.confLosses} conf
        </p>
      </div>

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
                    {isHome ? 'vs' : '@'} {opponent.schoolName}
                  </div>
                  <div className="text-sm text-gray-500">{opponent.nickname}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Prestige {opponent.prestige} · {isHome ? 'Home' : 'Away'}
                    {userUpcomingGame?.conferenceGame && ' · Conference'}
                  </div>
                </div>
                {winProb !== null && (
                  <div className="text-center">
                    <div
                      className="text-2xl font-bold"
                      style={{ color: winProbColor(winProb) }}
                    >
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
                      <div
                        className="font-semibold"
                        style={{ color: diff >= 0 ? '#ef4444' : '#16a34a' }}
                      >
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
          <div className="grid grid-cols-2 gap-2 mb-3">
            {(Object.keys(PRACTICE_FOCUS_LABELS) as PracticeFocus[]).map((focus) => (
              <button
                key={focus}
                onClick={() => dispatch(setPracticeFocus(focus))}
                className={`border rounded p-2 text-left text-xs transition-colors ${
                  coach.practiceFocus === focus
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className="font-semibold mb-0.5">
                  {PRACTICE_FOCUS_LABELS[focus]}
                </div>
                <div className="text-gray-500 font-normal">
                  {PRACTICE_FOCUS_DESCRIPTIONS[focus]}
                </div>
              </button>
            ))}
          </div>
          <div className="border-t pt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-gray-400 uppercase mb-1">Fatigue now</div>
              <div className="flex items-center gap-1.5">
                <span
                  className="px-1.5 py-0.5 rounded text-xs font-bold"
                  style={{ background: fatigueBg, color: fatigueText }}
                >
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
      </div>

      {/* ── Recruiting board compact ── */}
      {boardRecruits.length > 0 && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="m-0 text-base font-bold">Active Recruiting Board</h3>
              <div className="text-xs text-gray-500 mt-0.5">
                {boardRecruits.length} targets · Hours remaining:{' '}
                <span
                  className="font-semibold"
                  style={{ color: hoursRemaining < 0 ? '#dc2626' : '#15803d' }}
                >
                  {hoursRemaining}/{WEEKLY_HOURS_CAP}
                </span>
              </div>
            </div>
            <Link to="/career/recruiting" className="text-sm text-blue-600 hover:underline">
              Full Board →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b">
                  <th className="text-left pb-1.5 pr-3">Recruit</th>
                  <th className="text-left pb-1.5 pr-3">Interest</th>
                  <th className="text-right pb-1.5 w-20">Hours</th>
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
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-0.5" style={{ minWidth: '80px' }}>
                          <div
                            className={`h-1.5 rounded-full ${interest >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(100, interest)}%` }}
                          />
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
                        />
                      </td>
                    </tr>
                  );
                })}
                {boardRecruits.length > 8 && (
                  <tr>
                    <td colSpan={3} className="py-1.5 text-xs text-gray-400 text-center">
                      +{boardRecruits.length - 8} more on board —{' '}
                      <Link to="/career/recruiting" className="text-blue-600 hover:underline">
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

      {/* ── Advance Week ── */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="m-0 text-base font-bold">
              {canAdvance ? `Advance Week ${currentWeekDisplay}` : 'Season Locked'}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5 mb-0">
              {canAdvance
                ? 'Simulates all games and processes recruiting this week.'
                : season.phase === 'PLAYOFF'
                  ? 'Regular season complete. Go to playoffs.'
                  : season.phase === 'OFFSEASON'
                    ? 'Head to Career to finalize the offseason.'
                    : season.phase === 'PRE'
                      ? 'Start the season from the Season Dashboard.'
                      : 'Season complete.'}
            </p>
          </div>
          <div className="flex gap-3">
            {canAdvance && (
              <button
                className="btn btn-primary"
                onClick={() => dispatch(runCareerWeeklyCycle())}
              >
                ▶ Advance Week {currentWeekDisplay}
              </button>
            )}
            {season.phase === 'PLAYOFF' && (
              <Link to="/playoffs" className="btn btn-primary">
                Go to Playoffs →
              </Link>
            )}
            {season.phase === 'OFFSEASON' && (
              <Link to="/career" className="btn btn-primary">
                Career Office →
              </Link>
            )}
            {season.phase === 'PRE' && (
              <Link to="/season" className="btn btn-primary">
                Season Dashboard →
              </Link>
            )}
            <Link to="/season" className="btn text-sm">
              Season Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WeeklyHubPage;
