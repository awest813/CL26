import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  addRecruitToBoard,
  allocateProgramResources,
  initializeRecruitingBoard,
  removeRecruitFromBoard,
  setRecruitHours,
  setRecruitPitch,
  setPracticeFocus,
  setTactics,
  upgradeCoachSkill,
  acceptJobOffer,
  declineAllJobOffers,
  selectUserEffectivePrestige,
  WEEKLY_HOURS_CAP,
  MAX_HOURS_PER_RECRUIT,
  processSigningDay,
} from '../features/coach/coachSlice';
import {
  runCareerWeeklyCycle,
  processSeasonEnd,
  applyOffseasonRosterTurnover,
  initializeManagedRoster,
} from '../features/coach/careerThunks';
import { selectTeamRecords, startNewSeason } from '../features/season/seasonSlice';
import { buildCoachGamePlan, summarizeCoachGamePlan, summarizeCoachSkillImpacts } from '../sim/coachEffects';
import { buildPositionNeedByPosition, estimateRecruitFit, getTeamPitchGrade } from '../sim/recruiting';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { PracticeFocus, RecruitingPitch, RecruitMotivation, SeasonHistoryEntry, Tactics } from '../types/sim';
import { computeRankings } from '../sim/rankings';

const PITCH_LABELS: Record<RecruitingPitch, string> = {
  PLAYING_TIME: 'Play Time',
  PROXIMITY: 'Home',
  ACADEMIC: 'Academics',
  PRESTIGE: 'Prestige',
  CHAMPIONSHIP: 'Winning',
  CAMPUS_LIFE: 'Campus',
};

const PRACTICE_FOCUS_LABELS: Record<PracticeFocus, string> = {
  OFFENSE: 'Offense Install',
  DEFENSE: 'Defense Install',
  CONDITIONING: 'Conditioning',
  DISCIPLINE: 'Discipline',
};

const ARCHETYPE_BONUSES: Record<string, string[]> = {
  RECRUITER: ['+15% weekly interest gain', 'Expanded recruit reach', 'Faster commitments on key needs'],
  TACTICIAN: ['20% less fatigue build-up', 'Better practice-to-game translation', 'Scheme advantage in late possessions'],
  DEVELOPER: ['Prospects trust your system', 'Signed players develop faster', 'Cleaner sticks and defensive growth'],
};

function jobSecurityLabel(security: number): { label: string; color: string } {
  if (security >= 75) return { label: 'Strong Position', color: '#16a34a' };
  if (security >= 55) return { label: 'Secure', color: '#4ade80' };
  if (security >= 40) return { label: 'Moderate Pressure', color: '#f59e0b' };
  if (security >= 25) return { label: 'Hot Seat', color: '#ef4444' };
  return { label: 'On Thin Ice', color: '#b91c1c' };
}

function JobSecurityBar({ value }: { value: number }) {
  const { label, color } = jobSecurityLabel(value);
  const pct = Math.max(2, Math.min(100, value));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-semibold" style={{ color }}>{label}</span>
        <span className="text-gray-500">{value}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className="h-2.5 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function adPressureLabel(pressure: number): { label: string; color: string } {
  if (pressure >= 80) return { label: 'Board Heat: Extreme', color: '#b91c1c' };
  if (pressure >= 65) return { label: 'Board Heat: High', color: '#dc2626' };
  if (pressure >= 45) return { label: 'Board Heat: Moderate', color: '#f59e0b' };
  return { label: 'Board Heat: Manageable', color: '#16a34a' };
}

function SeasonHistoryRow({ entry, index }: { entry: SeasonHistoryEntry; index: number }) {
  return (
    <tr className="border-b last:border-0 text-sm">
      <td className="py-1.5 pr-3 text-gray-500">Yr {index + 1} ({entry.year})</td>
      <td className="py-1.5 pr-3 font-semibold">{entry.wins}–{entry.losses}</td>
      <td className="py-1.5 pr-3">
        {entry.champion ? (
          <span className="text-yellow-500 font-bold">Champion</span>
        ) : entry.madePlayoffs ? (
          <span className="text-blue-600">Playoffs</span>
        ) : (
          <span className="text-gray-400">No Playoffs</span>
        )}
      </td>
      <td className="py-1.5 pr-3 text-gray-600">{entry.recruitsSigned} signed ({entry.avgRecruitStars.toFixed(1)}★)</td>
      <td className="py-1.5 text-right">
        <JobSecurityBar value={entry.jobSecurityEnd} />
      </td>
    </tr>
  );
}

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
  const conferences = useAppSelector((state) => state.league.conferences);
  const coach = useAppSelector((state) => state.coach);
  const season = useAppSelector((state) => state.season);
  const recordsByTeamId = useAppSelector(selectTeamRecords);
  const effectivePrestige = useAppSelector(selectUserEffectivePrestige);

  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [seedInput, setSeedInput] = useState(coach.recruitingSeed || 2026);
  const [jobOfferError, setJobOfferError] = useState<string | null>(null);

  const selectedTeam = teams.find((team) => team.id === coach.selectedTeamId) ?? null;
  const teamNameById = useMemo(() => new Map(teams.map((team) => [team.id, `${team.schoolName}`])), [teams]);
  const conferenceNameById = useMemo(
    () => new Map(conferences.map((conference) => [conference.id, conference.name])),
    [conferences],
  );
  const effectiveRecruitingTeams = useMemo(() => {
    if (!coach.selectedTeamId || effectivePrestige === null) return teams;
    return teams.map((team) =>
      team.id === coach.selectedTeamId ? { ...team, prestige: effectivePrestige } : team,
    );
  }, [coach.selectedTeamId, effectivePrestige, teams]);

  const boardSet = useMemo(() => new Set(coach.boardRecruitIds), [coach.boardRecruitIds]);
  const positionNeedByPosition = useMemo(() => buildPositionNeedByPosition(coach.managedRoster), [coach.managedRoster]);

  const visibleRecruits = useMemo(() => {
    return coach.recruitPool
      .filter((recruit) => (positionFilter === 'ALL' ? true : recruit.position === positionFilter))
      .filter((recruit) => recruit.name.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 50);
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
        const interestMap = recruit.interestByTeamId || {};
        const interest = selectedTeam ? (interestMap[selectedTeam.id] || 0) : 0;
        const activePitch = coach.activePitchesByRecruitId[recruit.id];
        const pitchGrade = selectedTeam && activePitch
          ? getTeamPitchGrade(selectedTeam, activePitch, recruit, positionNeedByPosition)
          : '-';

        const topSuitors = Object.entries(interestMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([teamId, score]) => {
            const team = teams.find(t => t.id === teamId);
            return { name: team?.schoolName || 'Unknown', score };
          });

        let dealbreakerWarning = false;
        if (selectedTeam && recruit.dealbreaker) {
          const dbGrade = getTeamPitchGrade(selectedTeam, recruit.dealbreaker, recruit, positionNeedByPosition);
          if (dbGrade === 'D' || dbGrade === 'F') {
            dealbreakerWarning = true;
          }
        }

        return { recruit, fit, hours, interest, activePitch, pitchGrade, dealbreakerWarning, topSuitors };
      })
      .sort((a, b) => b.interest - a.interest);
  }, [boardRecruits, coach.weeklyHoursByRecruitId, coach.activePitchesByRecruitId, selectedTeam, teams, positionNeedByPosition]);

  const committedToUserCount = coach.recruitPool.filter(
    (recruit) => recruit.committedTeamId && recruit.committedTeamId === coach.selectedTeamId
  ).length;
  const signedClassThisYear = useMemo(
    () => coach.signedRecruitsByYear[season.year] ?? [],
    [coach.signedRecruitsByYear, season.year],
  );
  const signedClassSummary = useMemo(() => {
    if (signedClassThisYear.length === 0) {
      return { totalStars: 0, averageStars: 0, blueChipCount: 0 };
    }
    const totalStars = signedClassThisYear.reduce((sum, recruit) => sum + recruit.stars, 0);
    return {
      totalStars,
      averageStars: Number((totalStars / signedClassThisYear.length).toFixed(2)),
      blueChipCount: signedClassThisYear.filter((recruit) => recruit.stars >= 4).length,
    };
  }, [signedClassThisYear]);

  const userRecord = coach.selectedTeamId
    ? recordsByTeamId[coach.selectedTeamId] ?? { wins: 0, losses: 0, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 }
    : { wins: 0, losses: 0, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 };

  const expectations = coach.programExpectations;
  const winTarget = expectations?.winTarget ?? 0;
  const rankTarget = expectations?.rankTarget ?? 99;
  const careerYear = coach.careerRecord.seasonsCompleted + 1;

  const pollRank = useMemo(() => {
    if (!coach.selectedTeamId || season.phase === 'PRE') return null;
    const table = computeRankings(teams, recordsByTeamId, 128);
    return table.find((r) => r.teamId === coach.selectedTeamId)?.rank ?? null;
  }, [coach.selectedTeamId, season.phase, teams, recordsByTeamId]);

  const coachGamePlan = useMemo(
    () =>
      buildCoachGamePlan({
        baseTactics: coach.tactics,
        practiceFocus: coach.practiceFocus,
        fatigue: coach.teamFatigue,
        archetype: coach.profile?.archetype,
        coachSkill: coach.profile?.skill,
        skillTree: coach.skillTree,
      }),
    [coach.practiceFocus, coach.profile?.archetype, coach.profile?.skill, coach.skillTree, coach.tactics, coach.teamFatigue],
  );
  const prepNotes = useMemo(() => summarizeCoachGamePlan(coachGamePlan), [coachGamePlan]);
  const skillImpactNotes = useMemo(
    () =>
      summarizeCoachSkillImpacts({
        archetype: coach.profile?.archetype,
        skillTree: coach.skillTree,
        resources: coach.programResources,
      }),
    [coach.profile?.archetype, coach.programResources, coach.skillTree],
  );

  if (coach.onboardingStep !== 'READY' || !coach.profile || !coach.selectedTeamId) {
    return <Navigate to="/career/setup" replace />;
  }

  const archetype = coach.profile.archetype;
  const archetypeBonuses = ARCHETYPE_BONUSES[archetype] ?? [];
  const adPressure = coach.adPressure ?? 45;
  const coachLevel = coach.coachLevel ?? 1;
  const coachXp = coach.coachXp ?? 0;
  const coachSkillPoints = coach.coachSkillPoints ?? 0;
  const skillTree = coach.skillTree ?? { recruiting: 0, development: 0, operations: 0 };
  const programResources = coach.programResources ?? { nil: 50, boosters: 50, facilities: 50 };
  const pressureState = adPressureLabel(adPressure);

  function onAdd(recruit: typeof visibleRecruits[0]) {
    if (selectedTeam) {
      const fit = estimateRecruitFit(recruit, selectedTeam);
      const startingInterest = Math.min(40, Math.round(fit * 0.4 + recruit.stars * 2));
      dispatch(addRecruitToBoard({ recruitId: recruit.id, startingInterest }));
    }
  }

  function onAdvance() {
    dispatch(runCareerWeeklyCycle());
  }

  function onHoursChange(recruitId: string, nextHours: number): void {
    const current = coach.weeklyHoursByRecruitId[recruitId] ?? 0;
    const requested = Math.max(0, Math.min(MAX_HOURS_PER_RECRUIT, nextHours));
    const withoutCurrent = totalHours - current;
    const allowed = Math.min(MAX_HOURS_PER_RECRUIT, Math.max(0, WEEKLY_HOURS_CAP - withoutCurrent));
    dispatch(setRecruitHours({ recruitId, hours: Math.min(requested, allowed) }));
  }

  function onResourceChange(resource: 'nil' | 'boosters' | 'facilities', value: number): void {
    dispatch(
      allocateProgramResources({
        ...programResources,
        [resource]: value,
      }),
    );
  }

  async function onEndSeason() {
    await dispatch(processSeasonEnd());
  }

  async function onNewSeason() {
    const nextSeed = season.seasonSeed + 1;
    await dispatch(applyOffseasonRosterTurnover({ newSeed: nextSeed }));
    await dispatch(startNewSeason({ seed: nextSeed }));
  }

  const isOffseason = season.phase === 'OFFSEASON';
  const canAdvanceWeeklyCycle =
    season.phase === 'REGULAR' &&
    season.scheduleByWeek.length > 0 &&
    season.currentWeekIndex < season.scheduleByWeek.length;
  const seasonEndProcessed = isOffseason && coach.seasonHistory.some(e => e.year === season.year);
  const latestSeasonHistory = coach.seasonHistory.length > 0
    ? coach.seasonHistory[coach.seasonHistory.length - 1]
    : null;
  const recordedSeason = seasonEndProcessed && latestSeasonHistory?.year === season.year ? latestSeasonHistory : null;
  const displayedWins = recordedSeason?.wins ?? userRecord.wins;
  const displayedLosses = recordedSeason?.losses ?? userRecord.losses;
  const seasonStatusLabel = recordedSeason ? 'Final Season Record' : 'Season Performance';

  async function onAcceptOffer(teamId: string) {
    setJobOfferError(null);
    try {
      await dispatch(acceptJobOffer(teamId)).unwrap();
      await dispatch(initializeManagedRoster()).unwrap();
    } catch (error) {
      console.error('Failed to accept coach job offer.', error);
      setJobOfferError('The coaching move did not complete. Reload the page and try again.');
    }
  }

  return (
    <div className="flex-col gap-4">
      {/* ── Career Dashboard ── */}
      <div className="card">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="m-0 text-xl">
              Coach {coach.profile.name}
              <span className="ml-2 text-sm font-normal text-gray-500">Year {careerYear}</span>
            </h2>
            <div className="text-gray-500 text-sm mt-0.5">
              {selectedTeam?.schoolName} {selectedTeam?.nickname} &bull; {coach.careerTier} Program &bull; Skill {coach.profile.skill} &bull; Age {coach.profile.age}
            </div>
            {selectedTeam && effectivePrestige != null && (
              <div className="text-xs text-gray-500 mt-1">
                Effective prestige:{' '}
                <span className="font-semibold text-gray-700">{effectivePrestige}</span>
                {coach.programPrestigeDrift !== 0 && (
                  <span className={coach.programPrestigeDrift > 0 ? 'text-green-600 font-semibold ml-1' : 'text-red-500 font-semibold ml-1'}>
                    {coach.programPrestigeDrift > 0 ? `↑${coach.programPrestigeDrift}` : `↓${Math.abs(coach.programPrestigeDrift)}`} from base
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase mb-1">Career Record</div>
            <div className="text-lg font-bold">{coach.careerRecord.totalWins}–{coach.careerRecord.totalLosses}</div>
            <div className="text-xs text-gray-500">
              {coach.careerRecord.playoffAppearances} playoff app{coach.careerRecord.playoffAppearances !== 1 ? 's' : ''}
              {coach.careerRecord.championships > 0 && ` · ${coach.careerRecord.championships} title${coach.careerRecord.championships !== 1 ? 's' : ''}`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-3 border-t">
          {/* Season Performance */}
          <div>
            <div className="text-xs text-gray-500 uppercase mb-2">{seasonStatusLabel}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{displayedWins}–{displayedLosses}</span>
              {!recordedSeason && (
                <span className="text-gray-400 text-sm">({userRecord.confWins}–{userRecord.confLosses} conf)</span>
              )}
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Win target: {winTarget}</span>
                <span className={displayedWins >= winTarget ? 'text-green-600 font-bold' : 'text-amber-600'}>{displayedWins}/{winTarget}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${displayedWins >= winTarget ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, Math.round((displayedWins / Math.max(1, winTarget)) * 100))}%` }}
                />
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-1.5">
              Rank target: Top {rankTarget}
              {pollRank != null && season.phase !== 'PRE' && (
                <span className="block mt-0.5 text-gray-600">
                  Current poll: #{pollRank}
                  {pollRank <= rankTarget ? ' (meeting target)' : ' (below target)'}
                </span>
              )}
            </div>
          </div>

          {/* Job Security */}
          <div>
            <div className="text-xs text-gray-500 uppercase mb-2">Job Security</div>
            <JobSecurityBar value={coach.jobSecurity} />
            <div className="text-xs mt-2" style={{ color: pressureState.color }}>
              {pressureState.label} ({adPressure}%)
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {coach.jobSecurity < 30
                ? 'Meeting expectations is critical this season.'
                : coach.jobSecurity >= 75
                  ? 'You have strong administrative support.'
                  : 'Keep performing to stay secure.'}
            </div>
          </div>

          {/* Archetype */}
          <div>
            <div className="text-xs text-gray-500 uppercase mb-2">Archetype: {archetype.charAt(0) + archetype.slice(1).toLowerCase()}</div>
            <ul className="text-xs space-y-1">
              {archetypeBonuses.map((bonus, i) => (
                <li key={i} className="flex items-center gap-1 text-blue-700">
                  <span className="text-blue-400">+</span> {bonus}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-3 mt-3 border-t text-xs">
          <div>
            <div className="text-gray-400 uppercase mb-1">Weekly prep</div>
            <div className="font-semibold text-gray-700">{coachGamePlan.focusLabel}</div>
            <div className="text-gray-500 mt-1">
              Fatigue status: <span className="font-semibold">{coachGamePlan.fatigueLabel}</span>
            </div>
          </div>
          <div>
            <div className="text-gray-400 uppercase mb-1">Gameplan edge</div>
            <div className="text-gray-600">
              Off {coachGamePlan.modifiers.offense >= 0 ? '+' : ''}{coachGamePlan.modifiers.offense.toFixed(1)}
              {' · '}
              Def {coachGamePlan.modifiers.defense >= 0 ? '+' : ''}{coachGamePlan.modifiers.defense.toFixed(1)}
              {' · '}
              Disc {coachGamePlan.modifiers.discipline >= 0 ? '+' : ''}{coachGamePlan.modifiers.discipline.toFixed(1)}
            </div>
            <div className="text-gray-500 mt-1">
              FO {coachGamePlan.modifiers.faceoff >= 0 ? '+' : ''}{coachGamePlan.modifiers.faceoff.toFixed(1)}
              {' · '}
              GB {coachGamePlan.modifiers.groundBallBonus >= 0 ? '+' : ''}{coachGamePlan.modifiers.groundBallBonus.toFixed(1)}
            </div>
          </div>
          <div>
            <div className="text-gray-400 uppercase mb-1">Expected impact</div>
            <ul className="m-0 pl-4 text-gray-600 space-y-1">
              {prepNotes.length > 0 ? prepNotes.map((note) => <li key={note}>{note}</li>) : <li>Balanced week with no major swing factors.</li>}
            </ul>
          </div>
        </div>

        {/* Career History — always visible when available */}
        {coach.seasonHistory.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs text-gray-400 uppercase font-semibold mb-2">
              Career History ({coach.seasonHistory.length} season{coach.seasonHistory.length !== 1 ? 's' : ''})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b">
                    <th className="pb-1 pr-3">Season</th>
                    <th className="pb-1 pr-3">Record</th>
                    <th className="pb-1 pr-3">Playoff</th>
                    <th className="pb-1 pr-3">Recruiting</th>
                    <th className="pb-1 text-right">Security</th>
                  </tr>
                </thead>
                <tbody>
                  {coach.seasonHistory.map((entry, i) => (
                    <SeasonHistoryRow key={entry.year} entry={entry} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Quick Links ── */}
      <div className="flex gap-3 mt-2 flex-wrap">
        <Link to="/career/week" className="text-sm text-blue-600 hover:underline font-medium">
          Weekly Hub →
        </Link>
        <span className="text-gray-300">|</span>
        <Link to="/career/recruiting" className="text-sm text-blue-600 hover:underline font-medium">
          Recruiting Board →
        </Link>
        <span className="text-gray-300">|</span>
        <Link to="/career/roster" className="text-sm text-blue-600 hover:underline font-medium">
          Roster &amp; Depth Chart →
        </Link>
        <span className="text-gray-300">|</span>
        <Link to="/season" className="text-sm text-blue-600 hover:underline">Season Dashboard</Link>
      </div>

      <div className="card">
        <h3 className="text-base font-bold m-0">Gameplan</h3>
        <p className="text-xs text-gray-500 mt-1 mb-3">
          Your base scheme for every game. Practice focus still shifts tempo and slides during the weekly cycle.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <label className="text-xs font-semibold text-gray-600">
            Tempo
            <select
              value={coach.tactics.tempo}
              onChange={(e) =>
                dispatch(setTactics({ ...coach.tactics, tempo: e.target.value as Tactics['tempo'] }))
              }
              className="p-1.5 text-sm border rounded w-full mt-1 font-normal"
            >
              <option value="slow">Slow — limit possessions</option>
              <option value="normal">Balanced</option>
              <option value="fast">Fast — push transition</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Ride / clear
            <select
              value={coach.tactics.rideClear}
              onChange={(e) =>
                dispatch(setTactics({ ...coach.tactics, rideClear: e.target.value as Tactics['rideClear'] }))
              }
              className="p-1.5 text-sm border rounded w-full mt-1 font-normal"
            >
              <option value="conservative">Conservative</option>
              <option value="balanced">Balanced</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Slide timing
            <select
              value={coach.tactics.slideAggression}
              onChange={(e) =>
                dispatch(
                  setTactics({ ...coach.tactics, slideAggression: e.target.value as Tactics['slideAggression'] }),
                )
              }
              className="p-1.5 text-sm border rounded w-full mt-1 font-normal"
            >
              <option value="early">Early help</option>
              <option value="normal">Standard</option>
              <option value="late">Late slides — pack in</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Offense set
            <select
              value={coach.tactics.offenseSet ?? 'balanced'}
              onChange={(e) =>
                dispatch(setTactics({ ...coach.tactics, offenseSet: e.target.value as NonNullable<Tactics['offenseSet']> }))
              }
              className="p-1.5 text-sm border rounded w-full mt-1 font-normal"
            >
              <option value="balanced">Balanced</option>
              <option value="motion">Motion — off-ball movement</option>
              <option value="invert">Invert — midfield dodges</option>
              <option value="crease">Crease — inside finishing</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Defense package
            <select
              value={coach.tactics.defensePackage ?? 'man'}
              onChange={(e) =>
                dispatch(
                  setTactics({ ...coach.tactics, defensePackage: e.target.value as NonNullable<Tactics['defensePackage']> }),
                )
              }
              className="p-1.5 text-sm border rounded w-full mt-1 font-normal"
            >
              <option value="man">Man-to-man</option>
              <option value="zone">Zone — protect the slot</option>
              <option value="pressure">Pressure — force pace</option>
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="text-base font-bold m-0">Staff &amp; Program Levers</h3>
            <p className="text-xs text-gray-500 mt-1 mb-0">
              Practice focus drives weekly trait growth; staff upgrades and resources shape recruiting, development, and AD pressure.
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>Coach Level {coachLevel}</div>
            <div>XP {coachXp}/100</div>
            <div className="font-semibold text-blue-700">Skill Points: {coachSkillPoints}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          {([
            ['recruiting', 'Recruiting Tree', 'Boosts weekly recruiting gains plus faceoff/ground-ball edge.'],
            ['development', 'Development Tree', 'Improves weekly/offseason trait growth and turnover discipline.'],
            ['operations', 'Operations Tree', 'Improves fatigue control, goalie prep, and penalty avoidance.'],
          ] as const).map(([key, label, hint]) => (
            <div key={key} className="border rounded p-2">
              <div className="text-xs uppercase text-gray-500">{label}</div>
              <div className="text-lg font-bold">
                {skillTree[key]}/5
              </div>
              <div className="text-xs text-gray-500 mb-2">{hint}</div>
              <button
                className="btn btn-primary text-xs"
                disabled={coachSkillPoints <= 0 || skillTree[key] >= 5}
                onClick={() => dispatch(upgradeCoachSkill(key))}
              >
                Upgrade (+1)
              </button>
            </div>
          ))}
        </div>

        <div className="border rounded p-3 mb-3">
          <div className="text-xs uppercase text-gray-500 mb-1">Current Skill Effects</div>
          <ul className="m-0 pl-4 text-sm text-gray-600 space-y-1">
            {skillImpactNotes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            ['nil', 'NIL Budget', programResources.nil, 'Recruiting close rate and leverage'],
            ['boosters', 'Booster Alignment', programResources.boosters, 'Raises support but can increase AD pressure'],
            ['facilities', 'Facilities', programResources.facilities, 'Player growth and pressure shielding'],
          ] as const).map(([key, label, value, hint]) => (
            <label key={key} className="text-xs font-semibold text-gray-600 border rounded p-2">
              {label}
              <div className="text-xs text-gray-500 mt-0.5 mb-1 font-normal">{hint}</div>
              <input
                type="range"
                min={25}
                max={key === 'nil' ? 90 : 95}
                value={value}
                onChange={(e) => onResourceChange(key, Number(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-gray-700 font-bold">{value}</div>
            </label>
          ))}
        </div>
      </div>

      {/* ── Offseason Panel ── */}
      {isOffseason && (
        <div className="card" style={{ borderLeft: '4px solid #3b82f6' }}>
          <h3 className="text-base font-bold mb-1">Offseason</h3>
          <div className="flex gap-6 mb-4">
            <div>
              <div className="text-xs text-gray-500">Final Record</div>
              <div className="font-semibold">{displayedWins}–{displayedLosses}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Signing Class</div>
              <div className="font-semibold">{signedClassThisYear.length} signed ({signedClassSummary.averageStars.toFixed(2)}★ avg)</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Blue-chips</div>
              <div className="font-semibold">{signedClassSummary.blueChipCount}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">vs Expectation</div>
              <div className={`font-semibold ${displayedWins >= winTarget ? 'text-green-600' : 'text-red-500'}`}>
                {displayedWins >= winTarget ? `+${displayedWins - winTarget} wins` : `${displayedWins - winTarget} wins`}
              </div>
            </div>
          </div>

          {coach.pendingJobOffers.length > 0 && (
            <div className="mb-4 p-3 rounded border bg-white">
              <div className="flex justify-between items-start gap-3 mb-3">
                <div>
                  <h4 className="m-0 text-sm font-bold">Career Opportunity</h4>
                  <p className="text-xs text-gray-500 mt-0.5 mb-0">
                    Strong results have created interest from other programs. Accepting resets your roster and recruiting board.
                  </p>
                  {jobOfferError && <p className="text-xs text-red-600 mt-2 mb-0">{jobOfferError}</p>}
                </div>
                <button className="btn text-xs" onClick={() => dispatch(declineAllJobOffers())}>
                  Decline All (+3 security)
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {coach.pendingJobOffers.map((offer) => {
                  const offerTeam = teams.find((team) => team.id === offer.teamId);
                  if (!offerTeam) return null;
                  return (
                    <div key={offer.teamId} className="border rounded p-3">
                      <div className="flex justify-between gap-2">
                        <div>
                          <div className="font-semibold">
                            {offerTeam.schoolName} {offerTeam.nickname}
                          </div>
                          <div className="text-xs text-gray-500">
                            {conferenceNameById.get(offerTeam.conferenceId) ?? 'Independent'} · Prestige {offerTeam.prestige}
                          </div>
                        </div>
                        <span className={offer.tier === 'UPGRADE' ? 'text-green-600 text-xs font-bold' : 'text-blue-600 text-xs font-bold'}>
                          {offer.tier}
                        </span>
                      </div>
                      <button
                        className="btn btn-primary text-xs mt-3"
                        onClick={() => void onAcceptOffer(offer.teamId)}
                      >
                        Accept Offer
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {signedClassThisYear.length === 0 && (
              <button
                className="btn btn-primary"
                onClick={() => dispatch(processSigningDay())}
              >
                Resolve Signing Day
              </button>
            )}
            {!seasonEndProcessed && signedClassThisYear.length > 0 && (
              <button
                className="btn btn-primary"
                onClick={onEndSeason}
              >
                Finalize Season &amp; Update Record
              </button>
            )}
            {seasonEndProcessed && (
              <button
                className="btn btn-primary"
                onClick={onNewSeason}
              >
                Begin Next Season →
              </button>
            )}
            {signedClassThisYear.length > 0 && (
              <div className="text-xs text-gray-500 self-center">
                {!seasonEndProcessed
                  ? 'Finalize to update career record and job security.'
                  : 'Season recorded. Start next year when ready.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Recruiting Section ── */}
      <div className="card">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="text-base font-bold m-0">Recruiting Dashboard</h3>
            <div className="text-xs text-gray-500 mt-0.5">Week {coach.recruitingWeekIndex} &bull; Seed {coach.recruitingSeed}</div>
          </div>
          <div className="flex gap-4 text-sm items-start">
            <div className="text-right">
              <div className="text-xs text-gray-500">Committed</div>
              <div className="font-bold">{committedToUserCount} / 12</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Hours Left</div>
              <div className={`font-bold ${hoursRemaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {hoursRemaining} / {WEEKLY_HOURS_CAP}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Practice</div>
              <select
                value={coach.practiceFocus}
                onChange={(event) => dispatch(setPracticeFocus(event.target.value as PracticeFocus))}
                className="p-1 text-sm border rounded"
              >
                {Object.entries(PRACTICE_FOCUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <div className="text-xs text-gray-400 mt-0.5">Fatigue: {coach.teamFatigue}%</div>
            </div>
            <div className="text-right">
              {coach.recruitPool.length === 0 ? (
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={seedInput}
                    onChange={(e) => setSeedInput(Number(e.target.value))}
                    className="w-20 p-1 text-sm border rounded"
                    placeholder="Seed"
                  />
                  <button
                    className="btn btn-primary text-sm"
                    onClick={() => dispatch(initializeRecruitingBoard({ seed: seedInput, teams: effectiveRecruitingTeams }))}
                  >
                    Start Recruiting
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  {canAdvanceWeeklyCycle ? (
                    <button className="btn btn-primary" onClick={onAdvance}>
                      Advance Week {coach.recruitingWeekIndex + 1}
                    </button>
                  ) : null}
                  {coach.boardRecruitIds.length === 0 && canAdvanceWeeklyCycle && (
                    <div className="text-xs text-amber-700">No active targets: season advances with CPU recruiting only.</div>
                  )}
                  {season.phase === 'PRE' && (
                    <div className="text-xs text-gray-500">Start the season from the Season Dashboard to unlock weekly advancement.</div>
                  )}
                  {season.phase === 'PLAYOFF' && (
                    <div className="text-xs text-gray-500">Weekly cycle is locked during playoffs.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h3 className="text-lg font-bold mb-2">Target List ({boardRows.length}/25)</h3>

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
                    <th className="pb-2">Competition</th>
                    <th className="pb-2">Pitch/Grade</th>
                    <th className="pb-2 w-24">Interest</th>
                    <th className="pb-2 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {boardRows.map(({ recruit, interest, activePitch, pitchGrade, dealbreakerWarning, topSuitors }) => (
                    <tr key={recruit.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2">
                        <div className="font-semibold flex items-center gap-1">
                          {recruit.name}
                          {dealbreakerWarning && <span title="Dealbreaker Warning" className="text-red-500 cursor-help">⚠</span>}
                          {recruit.committedTeamId === coach.selectedTeamId && (
                            <span className="text-xs text-green-600 font-bold ml-1">✓ Committed</span>
                          )}
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
                        <div className="text-xs font-bold text-center">{interest}%</div>
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
                      <td className="p-2 text-yellow-500 text-xs">{'★'.repeat(recruit.stars)}</td>
                      <td className="p-2 font-mono">{fit}</td>
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
