import { useMemo, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import {
  addRecruitToBoard,
  advanceRecruitingWeek,
  initializeRecruitingBoard,
  removeRecruitFromBoard,
  setRecruitHours,
  setRecruitPitch,
  setTactics,
  WEEKLY_HOURS_CAP,
  MAX_HOURS_PER_RECRUIT,
} from '../features/coach/coachSlice';
import { selectTeamRecords } from '../features/season/seasonSlice';
import { estimateRecruitFit, getTeamPitchGrade } from '../sim/recruiting';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { RecruitingPitch, RecruitMotivation } from '../types/sim';

const PITCH_LABELS: Record<RecruitingPitch, string> = {
  PLAYING_TIME: 'Play Time',
  PROXIMITY: 'Home',
  ACADEMIC: 'Academics',
  PRESTIGE: 'Prestige',
  CHAMPIONSHIP: 'Winning',
  CAMPUS_LIFE: 'Campus',
};

function MotivationIcon({ motivation }: { motivation: RecruitMotivation }) {
  const color = motivation.importance === 'HIGH' ? '#ef4444' : motivation.importance === 'MEDIUM' ? '#f59e0b' : '#9ca3af';
  const label = PITCH_LABELS[motivation.pitch];
  return (
    <span
        title={`${label} (${motivation.importance})`}
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold mr-1 border bg-white cursor-help"
        style={{ color, borderColor: color }}
    >
      {label.charAt(0)}
    </span>
  );
}

function CoachCareerPage() {
  const dispatch = useAppDispatch();
  const teams = useAppSelector((state) => state.league.teams);
  const coach = useAppSelector((state) => state.coach);
  const season = useAppSelector((state) => state.season);
  const recordsByTeamId = useAppSelector(selectTeamRecords);

  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [seedInput, setSeedInput] = useState(coach.recruitingSeed || 2026);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY' | 'STRATEGY'>('ACTIVE');

  const selectedTeam = teams.find((team) => team.id === coach.selectedTeamId) ?? null;
  const teamNameById = useMemo(() => new Map(teams.map((team) => [team.id, `${team.schoolName}`])), [teams]);

  const boardSet = useMemo(() => new Set(coach.boardRecruitIds), [coach.boardRecruitIds]);

  const visibleRecruits = useMemo(() => {
      return coach.recruitPool
        .filter((recruit) => (positionFilter === 'ALL' ? true : recruit.position === positionFilter))
        .filter((recruit) => recruit.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 50); // limit for performance
  }, [coach.recruitPool, positionFilter, search]);

  const boardRecruits = useMemo(() => {
      return coach.boardRecruitIds
        .map((id) => coach.recruitPool.find((recruit) => recruit.id === id))
        .filter((recruit): recruit is NonNullable<typeof recruit> => Boolean(recruit));
  }, [coach.boardRecruitIds, coach.recruitPool]);

  const totalHours = boardRecruits.reduce((sum, recruit) => sum + (coach.weeklyHoursByRecruitId[recruit.id] ?? 0), 0);
  const hoursRemaining = WEEKLY_HOURS_CAP - totalHours;

  const boardRows = useMemo(() => {
      return [...boardRecruits]
        .map((recruit) => {
          const fit = selectedTeam ? estimateRecruitFit(recruit, selectedTeam) : 0;
          const hours = coach.weeklyHoursByRecruitId[recruit.id] ?? 0;
          const interest = coach.interestByRecruitId[recruit.id] ?? 0;
          const change = coach.interestChangeByRecruitId[recruit.id] ?? 0;
          const activePitch = coach.activePitchesByRecruitId[recruit.id];
          const pitchGrade = selectedTeam && activePitch ? getTeamPitchGrade(selectedTeam, activePitch, recruit) : '-';

          let dealbreakerWarning = false;
          if (selectedTeam && recruit.dealbreaker) {
              const dbGrade = getTeamPitchGrade(selectedTeam, recruit.dealbreaker, recruit);
              if (dbGrade === 'D' || dbGrade === 'F') {
                  dealbreakerWarning = true;
              }
          }

          return { recruit, fit, hours, interest, change, activePitch, pitchGrade, dealbreakerWarning };
        })
        .sort((a, b) => b.interest - a.interest);
  }, [boardRecruits, coach.weeklyHoursByRecruitId, coach.interestByRecruitId, coach.interestChangeByRecruitId, coach.activePitchesByRecruitId, selectedTeam]);

  const committedToUserCount = coach.recruitPool.filter((recruit) => recruit.committedTeamId && recruit.committedTeamId === coach.selectedTeamId).length;

  const userRecord = coach.selectedTeamId
    ? recordsByTeamId[coach.selectedTeamId] ?? { wins: 0, losses: 0, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 }
    : { wins: 0, losses: 0, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 };

  if (coach.onboardingStep !== 'READY' || !coach.profile || !coach.selectedTeamId) {
    return <Navigate to="/career/setup" replace />;
  }

  function onAdd(recruit: typeof visibleRecruits[0]) {
    if (selectedTeam) {
        const fit = estimateRecruitFit(recruit, selectedTeam);
        const startingInterest = Math.min(60, Math.round(fit * 0.6 + recruit.stars * 2));
        dispatch(addRecruitToBoard({ recruitId: recruit.id, startingInterest }));
    }
  }

  function onHoursChange(recruitId: string, nextHours: number): void {
    const current = coach.weeklyHoursByRecruitId[recruitId] ?? 0;
    const requested = Math.max(0, Math.min(MAX_HOURS_PER_RECRUIT, nextHours));
    const withoutCurrent = totalHours - current;
    const allowed = Math.min(MAX_HOURS_PER_RECRUIT, Math.max(0, WEEKLY_HOURS_CAP - withoutCurrent));
    dispatch(setRecruitHours({ recruitId, hours: Math.min(requested, allowed) }));
  }

  return (
    <div className="flex-col gap-4">
      <div className="card">
        <div className="flex justify-between items-start">
            <div>
                <h2 className="m-0 text-xl">
                    <Link to={`/team/${coach.selectedTeamId}`} className="hover:underline text-black">
                        {selectedTeam?.schoolName} Recruiting
                    </Link>
                </h2>
                <div className="text-gray-500 text-sm mt-1">
                    Coach {coach.profile.name} &bull; {season.year} Season
                </div>
            </div>
            <div className="text-right">
                <div className="text-sm font-semibold">Season Record</div>
                <div className="text-lg font-bold">{userRecord.wins}-{userRecord.losses} ({userRecord.confWins}-{userRecord.confLosses})</div>
            </div>
        </div>

        <div className="flex gap-4 mt-4 pt-4 border-t items-end">
            <div className="flex-1">
                 <div className="flex gap-4">
                    <button
                        className={`pb-1 border-b-2 font-semibold text-sm ${activeTab === 'ACTIVE' ? 'border-blue-600 text-blue-800' : 'border-transparent text-gray-500'}`}
                        onClick={() => setActiveTab('ACTIVE')}
                    >
                        Active Board
                    </button>
                    <button
                        className={`pb-1 border-b-2 font-semibold text-sm ${activeTab === 'STRATEGY' ? 'border-blue-600 text-blue-800' : 'border-transparent text-gray-500'}`}
                        onClick={() => setActiveTab('STRATEGY')}
                    >
                        Strategy
                    </button>
                    <button
                        className={`pb-1 border-b-2 font-semibold text-sm ${activeTab === 'HISTORY' ? 'border-blue-600 text-blue-800' : 'border-transparent text-gray-500'}`}
                        onClick={() => setActiveTab('HISTORY')}
                    >
                        History
                    </button>
                 </div>
            </div>
             {activeTab === 'ACTIVE' && (
                 <>
                    <div className="flex-1 text-center">
                         <div className="text-xs text-gray-500 uppercase">Hours Available</div>
                         <div className={`font-bold ${hoursRemaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {hoursRemaining} / {WEEKLY_HOURS_CAP}
                         </div>
                    </div>
                     <div className="flex-1 text-right">
                         {coach.recruitPool.length === 0 ? (
                             <div className="flex gap-2 justify-end items-center">
                                <input
                                    type="number"
                                    value={seedInput}
                                    onChange={(e) => setSeedInput(Number(e.target.value))}
                                    className="w-20 p-1 text-sm border rounded"
                                    placeholder="Seed"
                                />
                                <button
                                    className="btn btn-primary text-sm"
                                    onClick={() => dispatch(initializeRecruitingBoard({ seed: seedInput }))}
                                >
                                    Start Recruiting
                                </button>
                             </div>
                         ) : (
                            <button
                                className="btn btn-primary"
                                onClick={() => dispatch(advanceRecruitingWeek())}
                                disabled={coach.boardRecruitIds.length === 0}
                            >
                                Advance Week {coach.recruitingWeekIndex + 1}
                            </button>
                         )}
                    </div>
                </>
             )}
        </div>
      </div>

      {activeTab === 'STRATEGY' && (
          <div className="card">
              <h3 className="text-lg font-bold mb-4">Team Strategy</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-4 bg-gray-50 rounded border">
                      <label className="block font-bold mb-2">Offensive Tempo</label>
                      <select
                        value={coach.tactics.tempo}
                        onChange={(e) => dispatch(setTactics({ ...coach.tactics, tempo: e.target.value as any }))}
                        className="w-full p-2 border rounded mb-2"
                      >
                          <option value="slow">Slow (Possession)</option>
                          <option value="normal">Balanced</option>
                          <option value="fast">Fast (Run & Gun)</option>
                      </select>
                      <p className="text-xs text-gray-500">
                          {coach.tactics.tempo === 'slow' && "Reduces total possessions. Good for underdogs."}
                          {coach.tactics.tempo === 'normal' && "Standard pace of play."}
                          {coach.tactics.tempo === 'fast' && "Increases total possessions. High scoring, high variance."}
                      </p>
                  </div>

                  <div className="p-4 bg-gray-50 rounded border">
                      <label className="block font-bold mb-2">Ride / Clear</label>
                      <select
                        value={coach.tactics.rideClear}
                        onChange={(e) => dispatch(setTactics({ ...coach.tactics, rideClear: e.target.value as any }))}
                        className="w-full p-2 border rounded mb-2"
                      >
                          <option value="conservative">Conservative</option>
                          <option value="balanced">Balanced</option>
                          <option value="aggressive">Aggressive (10-Man)</option>
                      </select>
                      <p className="text-xs text-gray-500">
                          {coach.tactics.rideClear === 'conservative' && "Safe clears, light ride. Fewer turnovers for both sides."}
                          {coach.tactics.rideClear === 'balanced' && "Standard pressure."}
                          {coach.tactics.rideClear === 'aggressive' && "High pressure ride. Causes turnovers but risks easy transition goals."}
                      </p>
                  </div>

                  <div className="p-4 bg-gray-50 rounded border">
                      <label className="block font-bold mb-2">Slide Package</label>
                      <select
                        value={coach.tactics.slideAggression}
                        onChange={(e) => dispatch(setTactics({ ...coach.tactics, slideAggression: e.target.value as any }))}
                        className="w-full p-2 border rounded mb-2"
                      >
                          <option value="early">Early (Aggressive)</option>
                          <option value="normal">Normal</option>
                          <option value="late">Late (Hold)</option>
                      </select>
                      <p className="text-xs text-gray-500">
                          {coach.tactics.slideAggression === 'early' && "Slides early to ball. Stops dodgers but leaves shooters open."}
                          {coach.tactics.slideAggression === 'normal' && "Standard help defense."}
                          {coach.tactics.slideAggression === 'late' && "Defenders stay home. Forces 1v1 wins but protects crease."}
                      </p>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'HISTORY' && (
          <div className="card">
              <h3 className="text-lg font-bold mb-4">Past Recruiting Classes</h3>
              {coach.pastRecruitingClasses.length === 0 ? (
                  <p className="text-gray-500 italic py-8 text-center">No recruiting history yet. Complete a season to see results.</p>
              ) : (
                  <div className="flex flex-col gap-6">
                      {coach.pastRecruitingClasses.map((cls) => (
                          <div key={cls.year} className="border rounded bg-gray-50 overflow-hidden">
                              <div className="p-3 border-b bg-gray-100 font-bold flex justify-between">
                                  <span>Class of {cls.year}</span>
                                  <span>{cls.recruits.length} Signees</span>
                              </div>
                              <table className="w-full text-sm">
                                  <thead className="bg-white border-b text-gray-500 text-xs">
                                      <tr>
                                          <th className="p-2 text-left">Name</th>
                                          <th className="p-2 text-center">Pos</th>
                                          <th className="p-2 text-center">Stars</th>
                                          <th className="p-2 text-center">Rank</th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      {cls.recruits.map(r => (
                                          <tr key={r.id} className="border-b last:border-0 hover:bg-white">
                                              <td className="p-2 font-semibold">{r.name}</td>
                                              <td className="p-2 text-center">{r.position}</td>
                                              <td className="p-2 text-center text-yellow-500">{'★'.repeat(r.stars)}</td>
                                              <td className="p-2 text-center text-gray-500">#{r.id.split('-')[1]}</td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      ))}
                  </div>
              )}
          </div>
      )}

      {activeTab === 'ACTIVE' && (
        <div className="grid2">
            <div className="card">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold m-0">Target List ({boardRows.length}/25)</h3>
                <span className="text-sm text-gray-500">{committedToUserCount} / 12 Committed</span>
            </div>

            {boardRows.length === 0 ? (
                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded">
                    <p>Your board is empty.</p>
                    <p className="text-sm">Add prospects from the pool on the right.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                    <tr className="text-left text-gray-500 border-b">
                        <th className="pb-2">Recruit</th>
                        <th className="pb-2">Pitch/Grade</th>
                        <th className="pb-2 w-24">Interest</th>
                        <th className="pb-2 text-right">Hours</th>
                    </tr>
                    </thead>
                    <tbody>
                    {boardRows.map(({ recruit, interest, change, activePitch, pitchGrade, dealbreakerWarning }) => (
                        <tr key={recruit.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-2">
                            <div className="font-semibold flex items-center gap-1">
                                {recruit.name}
                                {dealbreakerWarning && <span title="Dealbreaker Warning" className="text-red-500 cursor-help">⚠</span>}
                            </div>
                            <div className="text-xs text-gray-500">
                                {'★'.repeat(recruit.stars)} {recruit.position}
                                <div className="flex mt-1">
                                    {recruit.motivations?.map((m, i) => <MotivationIcon key={i} motivation={m} />)}
                                </div>
                            </div>
                        </td>
                        <td className="py-2">
                            <select
                                value={activePitch || ''}
                                onChange={(e) => dispatch(setRecruitPitch({ recruitId: recruit.id, pitch: e.target.value as RecruitingPitch }))}
                                className="text-xs p-1 border rounded w-full mb-1"
                            >
                                <option value="">No Pitch</option>
                                {Object.entries(PITCH_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                            {activePitch && (
                                <div className={`text-xs font-bold text-center ${pitchGrade.startsWith('A') ? 'text-green-600' : pitchGrade === 'F' ? 'text-red-600' : 'text-gray-600'}`}>
                                    Grade: {pitchGrade}
                                </div>
                            )}
                        </td>
                        <td className="py-2">
                            <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                            <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${interest}%` }} />
                            </div>
                            <div className="text-xs flex justify-between">
                                <span>{interest}%</span>
                                {change !== 0 && (
                                    <span className={change > 0 ? 'text-green-600' : 'text-red-600'}>
                                        {change > 0 ? '+' : ''}{change}
                                    </span>
                                )}
                            </div>
                        </td>
                        <td className="py-2 text-right">
                            <input
                            type="number"
                            min={0}
                            max={MAX_HOURS_PER_RECRUIT}
                            value={coach.weeklyHoursByRecruitId[recruit.id] ?? 0}
                            onChange={(event) => onHoursChange(recruit.id, Number(event.target.value) || 0)}
                            className="w-12 p-1 border rounded text-center"
                            />
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            )}
            </div>

            <div className="card">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold m-0">Prospect Pool</h3>
                <button
                className="text-xs text-blue-600 hover:underline bg-transparent border-0 cursor-pointer"
                onClick={() => { setSearch(''); setPositionFilter('ALL'); }}
                >
                Reset Filters
                </button>
            </div>

            <div className="flex gap-2 mb-4">
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="flex-1 p-1 text-sm border rounded"
                />
                <select
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                    className="w-20 p-1 text-sm border rounded"
                >
                    <option value="ALL">All</option>
                    <option value="A">A</option>
                    <option value="M">M</option>
                    <option value="D">D</option>
                    <option value="LSM">LSM</option>
                    <option value="FO">FO</option>
                    <option value="G">G</option>
                </select>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: '600px' }}>
                <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-gray-500">
                    <th className="p-2">Name</th>
                    <th className="p-2">Rtg</th>
                    <th className="p-2">Fit</th>
                    <th className="p-2 text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {visibleRecruits.map((recruit) => {
                    const isCommittedElsewhere = Boolean(recruit.committedTeamId && recruit.committedTeamId !== coach.selectedTeamId);
                    const isCommittedToMe = recruit.committedTeamId === coach.selectedTeamId;
                    const onBoard = boardSet.has(recruit.id);
                    const fit = selectedTeam ? estimateRecruitFit(recruit, selectedTeam) : '-';

                    return (
                        <tr key={recruit.id} className={`border-b hover:bg-gray-50 ${isCommittedToMe ? 'bg-green-50' : ''}`}>
                        <td className="p-2">
                            <div className="font-semibold">{recruit.name}</div>
                            <div className="text-xs text-gray-500">{recruit.position} &bull; {recruit.region}</div>
                            {isCommittedElsewhere && <div className="text-xs text-red-500">Committed: {teamNameById.get(recruit.committedTeamId!) || 'Other'}</div>}
                            {isCommittedToMe && <div className="text-xs text-green-600 font-bold">Committed!</div>}
                        </td>
                        <td className="p-2 text-yellow-500 text-xs">
                            {'★'.repeat(recruit.stars)}
                        </td>
                        <td className="p-2 font-mono">
                            {fit}
                        </td>
                        <td className="p-2 text-right">
                            {onBoard ? (
                            <button
                                className="text-xs text-red-600 hover:underline bg-transparent border-0 cursor-pointer"
                                onClick={() => dispatch(removeRecruitFromBoard(recruit.id))}
                            >
                                Remove
                            </button>
                            ) : (
                            !isCommittedElsewhere && !isCommittedToMe && (
                                <button
                                    className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100 cursor-pointer"
                                    onClick={() => onAdd(recruit)}
                                    disabled={boardSet.size >= 25}
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
                            <td colSpan={4} className="p-4 text-center text-gray-500">No recruits found.</td>
                        </tr>
                    )}
                </tbody>
                </table>
            </div>
            </div>
        </div>
      )}
    </div>
  );
}

export default CoachCareerPage;
