import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  addRecruitToBoard,
  initializeRecruitingBoard,
  removeRecruitFromBoard,
  setRecruitHours,
  setRecruitPitch,
  setTactics,
  WEEKLY_HOURS_CAP,
  MAX_HOURS_PER_RECRUIT,
} from '../features/coach/coachSlice';
import { runCareerWeeklyCycle } from '../features/coach/careerThunks';
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
  const recordsByTeamId = useAppSelector(selectTeamRecords);

  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [seedInput, setSeedInput] = useState(coach.recruitingSeed || 2026);
  const [boardFilter, setBoardFilter] = useState<'ALL' | 'HOT' | 'RISK'>('ALL');
  const [prospectSort, setProspectSort] = useState<'STARS' | 'FIT'>('STARS');

  const selectedTeam = teams.find((team) => team.id === coach.selectedTeamId) ?? null;
  const teamNameById = useMemo(() => new Map(teams.map((team) => [team.id, `${team.schoolName}`])), [teams]);

  const boardSet = useMemo(() => new Set(coach.boardRecruitIds), [coach.boardRecruitIds]);

  const visibleRecruits = useMemo(() => {
    const pool = coach.recruitPool
      .filter((recruit) => (positionFilter === 'ALL' ? true : recruit.position === positionFilter))
      .filter((recruit) => recruit.name.toLowerCase().includes(search.toLowerCase()));

    const sortedPool = [...pool].sort((a, b) => {
      if (prospectSort === 'STARS') {
        return b.stars - a.stars;
      }
      const fitA = selectedTeam ? estimateRecruitFit(a, selectedTeam) : 0;
      const fitB = selectedTeam ? estimateRecruitFit(b, selectedTeam) : 0;
      return fitB - fitA;
    });

    return sortedPool.slice(0, 50);
  }, [coach.recruitPool, positionFilter, search, prospectSort, selectedTeam]);

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
          const interestMap = recruit.interestByTeamId || {};
          const interest = selectedTeam ? (interestMap[selectedTeam.id] || 0) : 0;
          const activePitch = coach.activePitchesByRecruitId[recruit.id];
          const pitchGrade = selectedTeam && activePitch ? getTeamPitchGrade(selectedTeam, activePitch, recruit) : '-';

          // Sort suitors
          const topSuitors = Object.entries(interestMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([teamId, score]) => {
                const team = teams.find(t => t.id === teamId);
                return { name: team?.schoolName || 'Unknown', score };
            });

          let dealbreakerWarning = false;
          if (selectedTeam && recruit.dealbreaker) {
              const dbGrade = getTeamPitchGrade(selectedTeam, recruit.dealbreaker, recruit);
              if (dbGrade === 'D' || dbGrade === 'F') {
                  dealbreakerWarning = true;
              }
          }

          return { recruit, fit, hours, interest, activePitch, pitchGrade, dealbreakerWarning, topSuitors };
        })
        .sort((a, b) => b.interest - a.interest);
  }, [boardRecruits, coach.weeklyHoursByRecruitId, coach.recruitPool, coach.activePitchesByRecruitId, selectedTeam, teams]);

  const filteredBoardRows = useMemo(() => {
    if (boardFilter === 'HOT') {
      return boardRows.filter((row) => row.interest >= 60);
    }

    if (boardFilter === 'RISK') {
      return boardRows.filter((row) => row.dealbreakerWarning);
    }

    return boardRows;
  }, [boardFilter, boardRows]);

  const targetListTitle =
    boardFilter === 'HOT' ? 'Target List • Hot Leads' : boardFilter === 'RISK' ? 'Target List • Dealbreaker Risks' : 'Target List';

  const averageBoardInterest =
    boardRows.length === 0 ? 0 : Math.round(boardRows.reduce((sum, row) => sum + row.interest, 0) / boardRows.length);
  const riskCount = boardRows.filter((row) => row.dealbreakerWarning).length;
  const hotLeadCount = boardRows.filter((row) => row.interest >= 60).length;

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
        // Starting interest: 0 to 40 roughly based on fit, similar to CPU logic
        const startingInterest = Math.min(40, Math.round(fit * 0.4 + recruit.stars * 2));
        dispatch(addRecruitToBoard({ recruitId: recruit.id, startingInterest }));
    }
  }

  function onAdvance() {
     // If in season, run full cycle
     // For now, always try running cycle if possible, fallback to just recruiting if not in season
     dispatch(runCareerWeeklyCycle());
     // Note: if user is not in regular season (e.g. offseason), runCareerWeeklyCycle returns 'skipped'
     // We might want a fallback `advanceRecruitingWeek()` here if we want offseason recruiting decoupled.
     // For now, let's assume recruiting only happens during season.
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
      <div className="card dashboardHero">
        <div>
          <p className="eyebrow">Career Mode Overhaul • Session 3</p>
          <h2 className="m-0 text-xl">Recruiting Command Center</h2>
          <p className="text-sm text-gray-500 mb-1">
            Session three introduces a lightweight career-systems layer with tactical identity controls and program expectation context.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between items-start">
            <div>
                <h2 className="m-0 text-xl">{selectedTeam?.schoolName} Recruiting</h2>
                <div className="text-gray-500 text-sm mt-1">
                    Coach {coach.profile.name} &bull; Tier {coach.careerTier}
                </div>
            </div>
            <div className="text-right">
                <div className="text-sm font-semibold">Season Record</div>
                <div className="text-lg font-bold">{userRecord.wins}-{userRecord.losses} ({userRecord.confWins}-{userRecord.confLosses})</div>
            </div>
        </div>

        <div className="flex gap-4 mt-4 pt-4 border-t">
            <div className="flex-1">
                 <div className="text-xs text-gray-500 uppercase">Classes</div>
                 <div className="font-bold">{committedToUserCount} / 12 Committed</div>
            </div>
             <div className="flex-1">
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
                            onClick={() => dispatch(initializeRecruitingBoard({ seed: seedInput, teams }))}
                        >
                            Start Recruiting
                        </button>
                     </div>
                 ) : (
                    <div className="flex flex-col items-end gap-1">
                      <button
                          className="btn btn-primary"
                          onClick={onAdvance}
                      >
                          Advance Week {coach.recruitingWeekIndex + 1}
                      </button>
                      {coach.boardRecruitIds.length === 0 && (
                        <div className="text-xs text-amber-700">No active targets: season will advance with CPU recruiting only.</div>
                      )}
                    </div>
                 )}
            </div>
        </div>

        <div className="careerHintRow">
          <span>Progress map:</span>
          <span>1) Shell + nav</span>
          <span>2) Recruiting triage</span>
          <span>3) Career systems layer</span>
          <span>4) Polish + balancing pass</span>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h3 className="text-lg font-bold m-0">Program Strategy</h3>
          <p className="text-sm text-gray-500 mt-1">Tune team identity and monitor recruiting momentum week to week.</p>
          <div className="strategyGrid">
            <label>
              Tempo
              <select
                value={coach.tactics.tempo}
                onChange={(event) => dispatch(setTactics({ ...coach.tactics, tempo: event.target.value as typeof coach.tactics.tempo }))}
              >
                <option value="slow">Slow</option>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
              </select>
            </label>
            <label>
              Ride/Clear
              <select
                value={coach.tactics.rideClear}
                onChange={(event) => dispatch(setTactics({ ...coach.tactics, rideClear: event.target.value as typeof coach.tactics.rideClear }))}
              >
                <option value="conservative">Conservative</option>
                <option value="balanced">Balanced</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </label>
            <label>
              Slide Aggression
              <select
                value={coach.tactics.slideAggression}
                onChange={(event) => dispatch(setTactics({ ...coach.tactics, slideAggression: event.target.value as typeof coach.tactics.slideAggression }))}
              >
                <option value="early">Early</option>
                <option value="normal">Normal</option>
                <option value="late">Late</option>
              </select>
            </label>
          </div>
          <div className="insightRow">
            <div><span>Avg Board Interest</span><strong>{averageBoardInterest}%</strong></div>
            <div><span>Hot Leads</span><strong>{hotLeadCount}</strong></div>
            <div><span>Dealbreaker Risk</span><strong>{riskCount}</strong></div>
          </div>
          {coach.programExpectations && (
            <div className="insightSubtle text-sm">
              Expectations: {coach.programExpectations.winTarget}+ wins, Top {coach.programExpectations.rankTarget}, security {coach.programExpectations.securityBaseline}%
            </div>
          )}
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-bold m-0">{targetListTitle} ({filteredBoardRows.length}/25)</h3>
            <select
              value={boardFilter}
              onChange={(event) => setBoardFilter(event.target.value as 'ALL' | 'HOT' | 'RISK')}
              className="w-20 p-1 text-sm border rounded"
            >
              <option value="ALL">All</option>
              <option value="HOT">Hot</option>
              <option value="RISK">Risk</option>
            </select>
          </div>

          {filteredBoardRows.length === 0 ? (
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
                    <th className="pb-2">Competition</th>
                    <th className="pb-2">Pitch/Grade</th>
                    <th className="pb-2 w-24">Interest</th>
                    <th className="pb-2 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBoardRows.map(({ recruit, interest, activePitch, pitchGrade, dealbreakerWarning, topSuitors }) => (
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
                          <div className="text-xs">
                              {topSuitors.map((s, i) => (
                                  <div key={i} className={`flex justify-between ${s.name === selectedTeam?.schoolName ? 'font-bold text-blue-700' : 'text-gray-600'}`}>
                                      <span className="truncate max-w-[100px]" title={s.name}>{s.name}</span>
                                      <span>{s.score}%</span>
                                  </div>
                              ))}
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
                          <div className={`h-2 rounded-full ${interest >= 100 ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, interest)}%` }} />
                        </div>
                        <div className="text-xs font-bold text-center">
                            {interest}%
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
            <select
                value={prospectSort}
                onChange={(e) => setProspectSort(e.target.value as 'STARS' | 'FIT')}
                className="w-24 p-1 text-sm border rounded"
            >
                <option value="STARS">Sort: Stars</option>
                <option value="FIT">Sort: Fit</option>
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
    </div>
  );
}

export default CoachCareerPage;
