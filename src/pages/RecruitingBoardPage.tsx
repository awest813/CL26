import { useMemo, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import {
  addRecruitToBoard,
  clearRecruitPitch,
  removeRecruitFromBoard,
  setRecruitHours,
  setRecruitPitch,
  selectIsCareerReady,
  WEEKLY_HOURS_CAP,
  MAX_HOURS_PER_RECRUIT,
  selectUserEffectivePrestige,
  programRecruitingBonus,
} from '../features/coach/coachSlice';
import { selectSeasonSummary } from '../features/season/seasonSlice';
import {
  buildPositionNeedByPosition,
  dealbreakerConflict,
  estimateRecruitFit,
  getTeamPitchGrade,
  isRecruitingPitch,
  pitchGradesFor,
  PITCH_LABELS,
  recruitingPeriodLabel,
  RECRUITING_POSITION_FILTERS,
} from '../sim/recruiting';
import { programPull, userWeeklyGain } from '../sim/recruitingWeek';
import { recruitingEdges } from '../sim/coachPerks';
import { PROGRAM_PULL_LABELS, programPullBand } from '../sim/prestige';
import PrestigeStars from '../components/PrestigeStars';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import RecruitingReportNote from '../components/RecruitingReportNote';
import StaffRecruitingControls from '../components/StaffRecruitingControls';
import { boardStartingInterest, RECRUITING_BOARD_LIMIT } from '../sim/autoRecruit';
import { Recruit, RecruitingPitch, RecruitMotivation } from '../types/sim';
import PageHeader from '../components/PageHeader';

type PositionFilterValue = (typeof RECRUITING_POSITION_FILTERS)[number];
type StarFilterValue = 'ALL' | '5' | '4' | '3' | '2';
type PoolSort = 'fit' | 'stars' | 'interest';

/** Interest a dealbreaker costs each week the program cannot meet it (see `simulateRecruitingWeek`). */
const DEALBREAKER_WEEKLY_COST = 5;

const IMPORTANCE_MARK: Record<RecruitMotivation['importance'], string> = {
  HIGH: '★★★',
  MEDIUM: '★★',
  LOW: '★',
};

function PullTag({ prestige, recruit }: { prestige: number | null; recruit: Recruit }) {
  if (prestige == null) return null;
  const pull = programPull(prestige, recruit.stars);
  const band = programPullBand(pull);
  return (
    <span
      className={`pullTag pullTag-${band}`}
      title={`How a ${recruit.stars}-star prospect sees your program: hours go ${Math.round(pull * 100)}% as far.`}
    >
      {PROGRAM_PULL_LABELS[band]}
    </span>
  );
}

function cappedInterest(value: number) {
  return Math.min(100, value);
}

function getRecruitInterest(recruit: { interestByTeamId?: Record<string, number> }, teamId: string) {
  return recruit.interestByTeamId?.[teamId] ?? 0;
}

function MotivationIcon({ motivation }: { motivation: RecruitMotivation }) {
  const color =
    motivation.importance === 'HIGH'
      ? 'var(--danger)'
      : motivation.importance === 'MEDIUM'
        ? 'var(--warning-border)'
        : 'var(--text-muted)';
  const label = PITCH_LABELS[motivation.pitch as RecruitingPitch] ?? motivation.pitch;
  const description = `${label}, ${motivation.importance.toLowerCase()} importance`;
  return (
    <span
      role="img"
      aria-label={description}
      title={description}
      className="motivationMark"
      style={{ color, borderColor: color }}
    >
      {label.charAt(0)}
    </span>
  );
}

function RecruitingBoardPage() {
  const dispatch = useAppDispatch();
  const coach = useAppSelector((state) => state.coach);
  const teams = useAppSelector((state) => state.league.teams);
  const season = useAppSelector(selectSeasonSummary);
  const scheduleLength = useAppSelector((state) => state.season.scheduleByWeek.length);
  // Once every recruiting period has run, board edits would never apply.
  const periodsDone = scheduleLength > 0 && coach.recruitingWeekIndex >= scheduleLength;

  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<PositionFilterValue>('ALL');
  const [starFilter, setStarFilter] = useState<StarFilterValue>('ALL');
  const [hideTaken, setHideTaken] = useState(true);
  const [poolSort, setPoolSort] = useState<PoolSort>('fit');
  const isCoachReady = useAppSelector(selectIsCareerReady);
  const selectedTeamId = coach.selectedTeamId ?? '';
  const baseTeam = teams.find((t) => t.id === selectedTeamId) ?? null;
  const effectivePrestige = useAppSelector(selectUserEffectivePrestige);
  // Grades and fit read the prestige the recruiting week uses: base plus career drift.
  const selectedTeam = useMemo(
    () => (baseTeam && effectivePrestige != null ? { ...baseTeam, prestige: effectivePrestige } : baseTeam),
    [baseTeam, effectivePrestige],
  );
  const teamNameById = useMemo(() => new Map(teams.map((t) => [t.id, t.schoolName])), [teams]);

  const boardSet = useMemo(() => new Set(coach.boardRecruitIds), [coach.boardRecruitIds]);
  const positionNeedByPosition = useMemo(
    () => buildPositionNeedByPosition(coach.managedRoster),
    [coach.managedRoster],
  );

  const gainMultiplier = programRecruitingBonus(coach);
  const coachSkill = coach.profile?.skill ?? 72;
  const edges = recruitingEdges(coach.coachPerks, coach.assistants, selectedTeam?.region);
  /** What this week's hours add, before the random swing; the same formula the recruiting week plays. */
  const projectedGain = (recruit: Recruit, hours: number, pitch: RecruitingPitch | undefined, pitchGrade: string | undefined, dealbreaker: boolean) => {
    const gain = userWeeklyGain({
      recruit,
      hours,
      pitch,
      pitchGrade,
      gainMultiplier,
      coachSkill,
      programPrestige: effectivePrestige,
      positionNeedBonus: Math.max(0, Math.min(3, positionNeedByPosition[recruit.position] ?? 0)),
      edges,
    });
    return gain - (dealbreaker ? DEALBREAKER_WEEKLY_COST : 0);
  };

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

  const boardRows = useMemo(() => {
    return [...boardRecruits]
      .map((recruit) => {
        const fit = selectedTeam ? estimateRecruitFit(recruit, selectedTeam) : 0;
        const hours = coach.weeklyHoursByRecruitId[recruit.id] ?? 0;
        const interest = selectedTeam
          ? (recruit.interestByTeamId?.[selectedTeam.id] ?? 0)
          : 0;
        const activePitch = coach.activePitchesByRecruitId[recruit.id];
        const pitchGrade =
          selectedTeam && activePitch
            ? getTeamPitchGrade(selectedTeam, activePitch, recruit, positionNeedByPosition)
            : '-';

        // Your own interest has its own column; this one is the rivals.
        const topSuitors = Object.entries(recruit.interestByTeamId ?? {})
          .filter(([teamId]) => teamId !== selectedTeamId)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 2)
          .map(([teamId, score]) => ({
            teamId,
            name: teamNameById.get(teamId) ?? 'Unknown',
            score: Math.round(score),
          }));

        const dealbreaker = selectedTeam ? dealbreakerConflict(selectedTeam, recruit, positionNeedByPosition) : null;
        const pitchOptions = selectedTeam ? pitchGradesFor(selectedTeam, recruit, positionNeedByPosition) : [];

        return { recruit, fit, hours, interest, activePitch, pitchGrade, dealbreaker, topSuitors, pitchOptions };
      })
      .sort((a, b) => b.interest - a.interest);
  }, [boardRecruits, coach.weeklyHoursByRecruitId, coach.activePitchesByRecruitId, selectedTeam, selectedTeamId, teamNameById, positionNeedByPosition]);

  const filteredRecruits = useMemo(() => {
    return coach.recruitPool
      .filter((r) => (positionFilter === 'ALL' ? true : r.position === positionFilter))
      .filter((r) => (starFilter === 'ALL' ? true : starFilter === '2' ? r.stars <= 2 : r.stars === Number(starFilter)))
      .filter((r) => !hideTaken || !r.committedTeamId || r.committedTeamId === selectedTeamId)
      .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
  }, [coach.recruitPool, hideTaken, positionFilter, search, selectedTeamId, starFilter]);

  const visibleRecruits = useMemo(() => {
    return filteredRecruits
      .map((recruit) => ({
        recruit,
        fit: selectedTeam ? estimateRecruitFit(recruit, selectedTeam) : 0,
        interest: selectedTeam ? getRecruitInterest(recruit, selectedTeam.id) : 0,
      }))
      .sort((a, b) => {
        const aCommittedToUser = a.recruit.committedTeamId === selectedTeamId ? 1 : 0;
        const bCommittedToUser = b.recruit.committedTeamId === selectedTeamId ? 1 : 0;
        if (bCommittedToUser !== aCommittedToUser) return bCommittedToUser - aCommittedToUser;

        const aCommittedElsewhere = a.recruit.committedTeamId && a.recruit.committedTeamId !== selectedTeamId ? 1 : 0;
        const bCommittedElsewhere = b.recruit.committedTeamId && b.recruit.committedTeamId !== selectedTeamId ? 1 : 0;
        if (aCommittedElsewhere !== bCommittedElsewhere) return aCommittedElsewhere - bCommittedElsewhere;

        const aOnBoard = boardSet.has(a.recruit.id) ? 1 : 0;
        const bOnBoard = boardSet.has(b.recruit.id) ? 1 : 0;
        if (bOnBoard !== aOnBoard) return bOnBoard - aOnBoard;

        if (poolSort === 'stars' && b.recruit.stars !== a.recruit.stars) return b.recruit.stars - a.recruit.stars;
        if (poolSort === 'stars' && b.recruit.potential !== a.recruit.potential) return b.recruit.potential - a.recruit.potential;
        if (b.interest !== a.interest) return b.interest - a.interest;
        if (poolSort !== 'interest' && b.fit !== a.fit) return b.fit - a.fit;

        if (b.recruit.stars !== a.recruit.stars) return b.recruit.stars - a.recruit.stars;
        if (b.fit !== a.fit) return b.fit - a.fit;
        return b.recruit.potential - a.recruit.potential;
      })
      .map(({ recruit }) => recruit)
      .slice(0, 75);
  }, [boardSet, filteredRecruits, poolSort, selectedTeam, selectedTeamId]);

  const committedToUserCount = coach.recruitPool.filter(
    (r) => r.committedTeamId === selectedTeamId,
  ).length;

  if (!isCoachReady) {
    return <Navigate to="/career/setup" replace />;
  }

  function onAdd(recruitId: string) {
    if (!selectedTeam) return;
    const recruit = coach.recruitPool.find((r) => r.id === recruitId);
    if (!recruit) return;
    dispatch(addRecruitToBoard({ recruitId, startingInterest: boardStartingInterest(recruit, selectedTeam) }));
  }

  function onHoursChange(recruitId: string, nextHours: number) {
    const current = coach.weeklyHoursByRecruitId[recruitId] ?? 0;
    const requested = Math.max(0, Math.min(MAX_HOURS_PER_RECRUIT, nextHours));
    const withoutCurrent = totalHours - current;
    const allowed = Math.min(MAX_HOURS_PER_RECRUIT, Math.max(0, WEEKLY_HOURS_CAP - withoutCurrent));
    dispatch(setRecruitHours({ recruitId, hours: Math.min(requested, allowed) }));
  }

  function onPitchChange(recruitId: string, nextPitch: string) {
    if (!nextPitch) {
      dispatch(clearRecruitPitch(recruitId));
      return;
    }

    if (!isRecruitingPitch(nextPitch)) {
      return;
    }

    dispatch(
      setRecruitPitch({
        recruitId,
        pitch: nextPitch,
      }),
    );
  }

  if (coach.recruitPool.length === 0) {
    const classClosed = season.phase === 'OFFSEASON';
    return (
      <div className="pageStack">
        <PageHeader
          eyebrow="Program"
          title="Recruiting"
          subtitle={classClosed
            ? 'The high school class is closed. The portal and the pro draft are in the Coach Office.'
            : 'Start recruiting to manage your prospect pool.'}
        />
        <div className="card emptyState">
          <h3>{classClosed ? 'The high school class is closed' : 'No recruit pool yet'}</h3>
          <div className="emptyState-actions">
            <Link to="/career" className="btn btn-primary">
              {classClosed ? 'Open the portal and the pro draft' : 'Start the class in the Coach Office'}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pageStack">
      <PageHeader
        eyebrow="Program"
        title="Recruiting"
        subtitle={
          <>
            {recruitingPeriodLabel(season.phase, coach.recruitingWeekIndex, scheduleLength)}{' '}
            · {season.year} class ·{' '}
            {effectivePrestige != null && <><PrestigeStars prestige={effectivePrestige} /> program ·{' '}</>}
            {committedToUserCount} committed · {coach.scholarshipsAvailable} scholarships available
            {committedToUserCount > coach.scholarshipsAvailable
              ? ' · Signing day will keep only the best fits up to your scholarship cap'
              : ''}
          </>
        }
      />

      {/* ── Summary bar ── */}
      <div className="card">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <div className="text-xs text-gray-400 uppercase mb-0.5">Board size</div>
            <div className="font-bold">{boardRecruits.length} / {RECRUITING_BOARD_LIMIT}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase mb-0.5">Hours used</div>
            <div className={`font-bold ${hoursRemaining < 0 ? 'text-hours-over' : 'text-hours-ok'}`}>
              {totalHours} / {WEEKLY_HOURS_CAP}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase mb-0.5">Committed</div>
            <div className={`font-bold ${committedToUserCount > coach.scholarshipsAvailable ? 'text-amber-600' : ''}`}>
              {committedToUserCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase mb-0.5">Scholarships left</div>
            <div className="font-bold">{coach.scholarshipsAvailable}</div>
          </div>
          <div className="ml-auto self-center">
            <Link to="/career/week" className="btn text-sm">
              Weekly Hub
            </Link>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t">
          <StaffRecruitingControls canPlan={season.phase === 'REGULAR' && coach.recruitingWeekIndex < scheduleLength} />
        </div>

        {coach.recruitingReport && (
          <div className="mt-3 pt-3 border-t">
            <RecruitingReportNote report={coach.recruitingReport} recruitPool={coach.recruitPool} teams={teams} />
          </div>
        )}

        {/* Position need indicators */}
        {positionNeedByPosition && (
          <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
            {Object.entries(positionNeedByPosition).map(([pos, need]) => (
              <span
                key={pos}
                className={need > 0 ? 'needChip needChip-short' : 'needChip'}
              >
                {pos}: {need > 0 ? `need ${need}` : 'full'}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid2 grid2-lead">
        {/* ── Target list ── */}
        <div className="card">
          <h3 className="text-base font-bold m-0 mb-3">
            Target list ({boardRows.length}/{RECRUITING_BOARD_LIMIT})
          </h3>

          {boardRows.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded">
              <p className="mb-1">Your board is empty.</p>
              <p className="text-sm">Add prospects from the prospect pool.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm targetTable">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b">
                    <th scope="col" className="pb-2 pr-2">Recruit</th>
                    <th scope="col" className="pb-2 pr-2">Pitch</th>
                    <th scope="col" className="pb-2 w-20">Interest</th>
                    <th scope="col" className="pb-2 text-right">Hrs</th>
                    <th scope="col" className="pb-2"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  {boardRows.map(({ recruit, interest, hours, activePitch, pitchGrade, dealbreaker, topSuitors, pitchOptions }) => {
                    const open = !recruit.committedTeamId && !periodsDone;
                    const gain = open ? projectedGain(recruit, hours, activePitch, activePitch ? pitchGrade : undefined, Boolean(dealbreaker)) : 0;
                    const periodsToCommit = gain > 0 ? Math.ceil((100 - Math.min(100, interest)) / gain) : null;
                    return (
                    <tr key={recruit.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 pr-2 targetRecruit targetCell-recruit">
                        <div className="font-semibold flex items-center gap-1">
                          {recruit.name}
                          {dealbreaker && (
                            <span
                              title={`Dealbreaker: ${PITCH_LABELS[dealbreaker.pitch]} grades ${dealbreaker.grade} here. Costs ${DEALBREAKER_WEEKLY_COST} interest every period.`}
                              className="text-red-500 cursor-help"
                            >
                              ⚠<span className="sr-only">Dealbreaker: {PITCH_LABELS[dealbreaker.pitch]} grades {dealbreaker.grade}</span>
                            </span>
                          )}
                          {recruit.committedTeamId === selectedTeamId && (
                            <span className="text-xs text-green-600 font-bold">✓</span>
                          )}
                        </div>
                        {recruit.committedTeamId && recruit.committedTeamId !== selectedTeamId && (
                          <div className="text-xs text-red-500">
                            Committed: {teamNameById.get(recruit.committedTeamId) ?? 'Other'}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 nowrap">
                          <span className="text-yellow-500" aria-label={`${recruit.stars} stars`}>{'★'.repeat(recruit.stars)}</span>{' '}
                          {recruit.position} · {recruit.region}{' '}
                          {!recruit.committedTeamId && <PullTag prestige={effectivePrestige} recruit={recruit} />}
                        </div>
                        {dealbreaker && !recruit.committedTeamId && (
                          <div className="text-xs text-red-500">
                            Dealbreaker: {PITCH_LABELS[dealbreaker.pitch]} ({dealbreaker.grade}), −{DEALBREAKER_WEEKLY_COST} a period
                          </div>
                        )}
                        <div className="flex mt-0.5">
                          {recruit.motivations?.map((m, i) => (
                            <MotivationIcon key={i} motivation={m} />
                          ))}
                        </div>
                        {!recruit.committedTeamId && (
                          <div className="suitorLine">
                            <span className="sr-only">Rivals: </span>
                            {topSuitors.length === 0 && <span>No rivals yet</span>}
                            {topSuitors.map((suitor) => (
                              <span
                                key={suitor.teamId}
                                className={`suitorChip ${suitor.score > interest ? 'suitorChip-ahead' : ''}`}
                                title={suitor.score > interest ? `${suitor.name} leads you at ${suitor.score}%` : `${suitor.name} at ${suitor.score}%`}
                              >
                                <span className="suitorName">{suitor.name}</span> {suitor.score}%
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-2 targetCell-pitch">
                        <select
                          id={`pitch-${recruit.id}`}
                          value={activePitch ?? ''}
                          disabled={Boolean(recruit.committedTeamId) || periodsDone}
                          onChange={(e) => onPitchChange(recruit.id, e.target.value)}
                          className="text-xs p-1 border rounded w-full mb-1 pitchSelect"
                          aria-label={`Recruiting pitch for ${recruit.name}`}
                        >
                          <option value="">No pitch</option>
                          {pitchOptions.map(({ pitch, grade, importance }) => (
                            <option key={pitch} value={pitch}>
                              {PITCH_LABELS[pitch]} ({grade}){importance ? ` ${IMPORTANCE_MARK[importance]}` : ''}
                            </option>
                          ))}
                        </select>
                        {activePitch && (
                          <div
                            className={`text-xs font-bold text-center ${
                              pitchGrade.startsWith('A')
                                ? 'text-green-600'
                                : pitchGrade === 'F'
                                  ? 'text-red-600'
                                  : 'text-gray-600'
                            }`}
                          >
                            Grade: {pitchGrade}
                          </div>
                        )}
                      </td>
                      <td className="py-2 targetCell-interest">
                        <div
                          className={`meter mb-0.5 ${interest >= 100 ? 'meter-full' : ''}`}
                          role="progressbar"
                          aria-valuenow={cappedInterest(interest)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${recruit.name} interest`}
                        >
                          <span style={{ width: `${cappedInterest(interest)}%` }} />
                        </div>
                        <div className="text-xs text-center text-gray-500">{cappedInterest(interest)}%</div>
                        {open && (
                          <div
                            className={`text-xs text-center ${gain > 0 ? 'text-green-600' : 'text-gray-400'}`}
                            title="This period's hours, pitch, and position need, before the weekly swing of about a point either way"
                          >
                            {gain > 0 ? `+${gain}` : gain < 0 ? `${gain}` : '+0'}/wk
                            {periodsToCommit != null && <span className="text-gray-500"> · ~{periodsToCommit} to commit</span>}
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-right targetCell-hours">
                        <input
                          type="number"
                          min={0}
                          max={MAX_HOURS_PER_RECRUIT}
                          value={coach.weeklyHoursByRecruitId[recruit.id] ?? 0}
                          onChange={(e) => onHoursChange(recruit.id, Number(e.target.value) || 0)}
                          disabled={Boolean(recruit.committedTeamId) || periodsDone}
                          title={recruit.committedTeamId ? 'Committed prospects take no hours' : periodsDone ? 'The recruiting periods are over' : undefined}
                          className="w-12 p-1 border rounded text-center text-sm"
                          aria-label={`Recruiting hours for ${recruit.name}`}
                        />
                      </td>
                      <td className="py-2 pl-2 targetCell-remove">
                        <button
                          type="button"
                          className="removeTarget"
                          aria-label={`Remove ${recruit.name} from board`}
                          onClick={() => dispatch(removeRecruitFromBoard(recruit.id))}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Prospect pool ── */}
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-base font-bold m-0">Prospect pool</h3>
              <div className="text-xs text-gray-500 mt-1">
                Showing {visibleRecruits.length} of {filteredRecruits.length} matches
              </div>
            </div>
            <button
              type="button"
              className="textButton"
              onClick={() => { setSearch(''); setPositionFilter('ALL'); setStarFilter('ALL'); setHideTaken(true); setPoolSort('fit'); }}
            >
              Reset filters
            </button>
          </div>

          <div className="flex gap-2 mb-3">
            <label className="flex-1 text-sm">
              Search
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name…"
                className="block w-full p-1.5 text-sm border rounded mt-0.5"
              />
            </label>
            <label className="text-sm">
              Position
              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value as PositionFilterValue)}
                className="block p-1.5 text-sm border rounded w-20 mt-0.5"
              >
                {RECRUITING_POSITION_FILTERS.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Stars
              <select
                value={starFilter}
                onChange={(e) => setStarFilter(e.target.value as StarFilterValue)}
                className="block p-1.5 text-sm border rounded w-20 mt-0.5"
              >
                <option value="ALL">All</option>
                <option value="5">5★</option>
                <option value="4">4★</option>
                <option value="3">3★</option>
                <option value="2">2★</option>
              </select>
            </label>
            <label className="text-sm">
              Sort
              <select
                value={poolSort}
                onChange={(e) => setPoolSort(e.target.value as PoolSort)}
                className="block p-1.5 text-sm border rounded mt-0.5"
              >
                <option value="fit">Best fit</option>
                <option value="stars">Stars</option>
                <option value="interest">Interest</option>
              </select>
            </label>
            </div>
          <label className="text-xs text-gray-500 flex items-center gap-1 mb-2">
            <input type="checkbox" checked={hideTaken} onChange={(e) => setHideTaken(e.target.checked)} />
            Hide prospects committed elsewhere
          </label>

          <div className="overflow-y-auto" style={{ maxHeight: '560px' }}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-xs text-gray-400">
                  <th scope="col" className="p-2">Name</th>
                  <th scope="col" className="p-2">Stars</th>
                  <th scope="col" className="p-2 num">
                    <abbr title="How well your program matches this prospect: prestige, region, stars, and what the prospect wants">Fit</abbr>
                  </th>
                  <th scope="col" className="p-2 text-right"><span className="sr-only">Board</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleRecruits.map((recruit) => {
                  const isCommittedElsewhere = Boolean(
                    recruit.committedTeamId && recruit.committedTeamId !== selectedTeamId,
                  );
                  const isCommittedToMe = recruit.committedTeamId === selectedTeamId;
                  const onBoard = boardSet.has(recruit.id);
                  const fit = selectedTeam ? estimateRecruitFit(recruit, selectedTeam) : '-';

                  return (
                    <tr
                      key={recruit.id}
                      className={`border-b hover:bg-gray-50 ${isCommittedToMe ? 'bg-green-50' : ''}`}
                    >
                      <td className="p-2">
                        <div className="font-semibold">{recruit.name}</div>
                        <div className="text-xs text-gray-500">
                          {recruit.position} · {recruit.region}{' '}
                          {!recruit.committedTeamId && <PullTag prestige={effectivePrestige} recruit={recruit} />}
                        </div>
                        {selectedTeam && (
                          <div className="text-xs text-gray-400">
                            Interest {cappedInterest(getRecruitInterest(recruit, selectedTeam.id))}%
                          </div>
                        )}
                        {isCommittedElsewhere && (
                          <div className="text-xs text-red-500">
                            Committed: {teamNameById.get(recruit.committedTeamId!) ?? 'Other'}
                          </div>
                        )}
                        {isCommittedToMe && (
                          <div className="text-xs text-green-600 font-bold">Committed!</div>
                        )}
                      </td>
                      <td className="p-2 text-yellow-500 text-xs nowrap" aria-label={`${recruit.stars} stars`}>{'★'.repeat(recruit.stars)}</td>
                      <td className="p-2 num text-xs">{fit}</td>
                      <td className="p-2 text-right">
                        {onBoard ? (
                          <button
                            type="button"
                            className="text-xs text-red-500 hover:underline bg-transparent border-0 cursor-pointer"
                            aria-label={`Remove ${recruit.name} from board`}
                            onClick={() => dispatch(removeRecruitFromBoard(recruit.id))}
                          >
                            Remove
                          </button>
                        ) : (
                          !isCommittedElsewhere && !isCommittedToMe && (
                            <button
                              type="button"
                              className="chipAdd"
                              aria-label={`Add ${recruit.name} to board`}
                              onClick={() => onAdd(recruit.id)}
                              disabled={boardSet.size >= RECRUITING_BOARD_LIMIT || periodsDone}
                              title={periodsDone
                                ? 'The recruiting periods are over'
                                : boardSet.size >= RECRUITING_BOARD_LIMIT
                                  ? `The board holds ${RECRUITING_BOARD_LIMIT}. Remove a target first.`
                                  : undefined}
                            >
                              Add
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visibleRecruits.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">
                      No recruits found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RecruitingBoardPage;
