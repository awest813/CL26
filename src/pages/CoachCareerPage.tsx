import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  allocateProgramResources,
  initializeRecruitingBoard,
  setPracticeFocus,
  setTactics,
  upgradeCoachSkill,
  selectUserEffectivePrestige,
  WEEKLY_HOURS_CAP,
  processSigningDay,
} from '../features/coach/coachSlice';
import {
  processSeasonEnd,
  beginNextCareerSeason,
} from '../features/coach/careerThunks';
import TeamLogo from '../components/TeamLogo';
import OffseasonMarket from './OffseasonMarket';
import { selectTeamRecords } from '../features/season/seasonSlice';
import {
  advanceFatigue,
  buildCoachGamePlan,
  FATIGUE_SLOWDOWN_THRESHOLD,
  gameDayTacticChanges,
  summarizeCoachGamePlan,
  summarizeCoachSkillImpacts,
} from '../sim/coachEffects';
import { GameDayEdge, GameDayScheme, InstallPicker, TacticSelects } from '../components/GamePlan';
import { recruitingPeriodLabel } from '../sim/recruiting';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { PlayoffRoundName, SeasonHistoryEntry } from '../types/sim';
import { computeAllSOS, computeRankings } from '../sim/rankings';
import { withLeaguePrestige } from '../sim/programLedger';
import { careerOffseasonCapabilities, hasSeasonHistoryForYear } from '../sim/seasonPhase';
import PageHeader from '../components/PageHeader';

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
  if (pressure >= 80) return { label: 'Extreme AD pressure', color: '#b91c1c' };
  if (pressure >= 65) return { label: 'High AD pressure', color: '#dc2626' };
  if (pressure >= 45) return { label: 'Moderate AD pressure', color: '#f59e0b' };
  return { label: 'Low AD pressure', color: '#16a34a' };
}

const PLAYOFF_EXIT_LABELS: Record<PlayoffRoundName, string> = {
  ROUND1: 'Out in the first round',
  QUARTERFINAL: 'Out in the quarterfinals',
  SEMIFINAL: 'Out in the semifinals',
  FINAL: 'Runner-up',
};

function SeasonHistoryRow({ entry, index }: { entry: SeasonHistoryEntry; index: number }) {
  const bracketGames = (entry.playoffWins ?? 0) + (entry.playoffLosses ?? 0);
  return (
    <tr className="border-b last:border-0 text-sm">
      <td className="py-1.5 pr-3 text-gray-500">Yr {index + 1} ({entry.year})</td>
      <td className="py-1.5 pr-3">
        <span className="font-semibold">{entry.wins}–{entry.losses}</span>
        {bracketGames > 0 && (
          <span className="text-xs text-gray-500"> · {entry.playoffWins ?? 0}–{entry.playoffLosses ?? 0} playoffs</span>
        )}
      </td>
      <td className="py-1.5 pr-3">
        {entry.champion ? (
          <span className="text-yellow-500 font-bold">Champion</span>
        ) : entry.madePlayoffs ? (
          <span className="youMark">{entry.playoffRound ? PLAYOFF_EXIT_LABELS[entry.playoffRound] : 'Made the field'}</span>
        ) : (
          <span className="text-gray-400">Missed the field</span>
        )}
      </td>
      <td className="py-1.5 pr-3 text-gray-600">{entry.recruitsSigned} signed ({entry.avgRecruitStars.toFixed(1)}★)</td>
      <td className="py-1.5 text-right">
        <JobSecurityBar value={entry.jobSecurityEnd} />
      </td>
    </tr>
  );
}

function CoachCareerPage() {
  const dispatch = useAppDispatch();
  const teams = useAppSelector((state) => state.league.teams);
  const coach = useAppSelector((state) => state.coach);
  const season = useAppSelector((state) => state.season);
  const recordsByTeamId = useAppSelector(selectTeamRecords);
  const gameResults = useAppSelector((state) => state.season.gameResults);
  const effectivePrestige = useAppSelector(selectUserEffectivePrestige);

  const [seedInput, setSeedInput] = useState(coach.recruitingSeed || 2026);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedTeam = teams.find((team) => team.id === coach.selectedTeamId) ?? null;
  const effectiveRecruitingTeams = useMemo(() => {
    if (!coach.selectedTeamId || effectivePrestige === null) return teams;
    return teams.map((team) =>
      team.id === coach.selectedTeamId ? { ...team, prestige: effectivePrestige } : team,
    );
  }, [coach.selectedTeamId, effectivePrestige, teams]);

  const boardRecruits = useMemo(() => {
    return coach.boardRecruitIds
      .map((id) => coach.recruitPool.find((recruit) => recruit.id === id))
      .filter((recruit): recruit is NonNullable<typeof recruit> => Boolean(recruit));
  }, [coach.boardRecruitIds, coach.recruitPool]);

  const totalHours = boardRecruits.reduce((sum, recruit) => sum + (coach.weeklyHoursByRecruitId[recruit.id] ?? 0), 0);
  const hoursRemaining = WEEKLY_HOURS_CAP - totalHours;

  const committedToUserCount = coach.recruitPool.filter(
    (recruit) => recruit.committedTeamId && recruit.committedTeamId === coach.selectedTeamId
  ).length;
  const signingDayResolved = Object.prototype.hasOwnProperty.call(coach.signedRecruitsByYear, season.year);
  const offseasonCaps = careerOffseasonCapabilities({
    phase: season.phase,
    year: season.year,
    hasSelectedTeam: Boolean(coach.selectedTeamId),
    hasProgramExpectations: Boolean(coach.programExpectations),
    signedRecruitsByYear: coach.signedRecruitsByYear,
    seasonHistory: coach.seasonHistory,
  });
  const signedClassThisYear = coach.signedRecruitsByYear[season.year] ?? [];
  const signedClassSummary = signedClassThisYear.length === 0
    ? { totalStars: 0, averageStars: 0, blueChipCount: 0 }
    : (() => {
      const totalStars = signedClassThisYear.reduce((sum, recruit) => sum + recruit.stars, 0);
      return {
        totalStars,
        averageStars: Number((totalStars / signedClassThisYear.length).toFixed(2)),
        blueChipCount: signedClassThisYear.filter((recruit) => recruit.stars >= 4).length,
      };
    })();

  const userRecord = coach.selectedTeamId
    ? recordsByTeamId[coach.selectedTeamId] ?? { wins: 0, losses: 0, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 }
    : { wins: 0, losses: 0, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 };

  const expectations = coach.programExpectations;
  const winTarget = expectations?.winTarget ?? 0;
  const rankTarget = expectations?.rankTarget ?? 99;
  const careerYear = coach.careerRecord.seasonsCompleted + 1;

  const pollRank = useMemo(() => {
    if (!coach.selectedTeamId || season.phase === 'PRE') return null;
    const sos = computeAllSOS(gameResults, recordsByTeamId);
    const table = computeRankings(
      withLeaguePrestige(teams, season.programLedger, coach.selectedTeamId, coach.programPrestigeDrift ?? 0),
      recordsByTeamId,
      128,
      sos,
    );
    return table.find((r) => r.teamId === coach.selectedTeamId)?.rank ?? null;
  }, [coach.selectedTeamId, coach.programPrestigeDrift, season.phase, season.programLedger, teams, recordsByTeamId, gameResults]);

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
  const gameDayChanges = useMemo(
    () =>
      gameDayTacticChanges({
        baseTactics: coach.tactics,
        practiceFocus: coach.practiceFocus,
        fatigue: coach.teamFatigue,
      }),
    [coach.practiceFocus, coach.tactics, coach.teamFatigue],
  );
  const projectedFatigue = Math.round(
    advanceFatigue(coach.teamFatigue, coach.practiceFocus, coach.profile?.archetype, coach.skillTree?.operations),
  );
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

  function onResourceChange(resource: 'nil' | 'boosters' | 'facilities', value: number): void {
    dispatch(
      allocateProgramResources({
        ...programResources,
        [resource]: value,
      }),
    );
  }

  async function onEndSeason() {
    setActionError(null);
    try {
      await dispatch(processSeasonEnd()).unwrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onNewSeason() {
    setActionError(null);
    try {
      const nextSeed = await dispatch(beginNextCareerSeason()).unwrap();
      if (typeof nextSeed === 'number') {
        setSeedInput(nextSeed);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  const isOffseason = season.phase === 'OFFSEASON';
  const canAdvanceWeeklyCycle =
    season.phase === 'REGULAR' &&
    season.scheduleByWeek.length > 0 &&
    season.currentWeekIndex < season.scheduleByWeek.length;
  const seasonEndProcessed = isOffseason && hasSeasonHistoryForYear(coach.seasonHistory, season.year);
  const fired = (coach.employment ?? 'ACTIVE') === 'FIRED';
  const canBeginNextYear = offseasonCaps.canAdvanceNextYear && !fired;
  const latestSeasonHistory = coach.seasonHistory.length > 0
    ? coach.seasonHistory[coach.seasonHistory.length - 1]
    : null;
  const recordedSeason = seasonEndProcessed && latestSeasonHistory?.year === season.year ? latestSeasonHistory : null;
  const displayedWins = recordedSeason?.wins ?? userRecord.wins;
  const displayedLosses = recordedSeason?.losses ?? userRecord.losses;
  const seasonStatusLabel = recordedSeason ? 'Final Season Record' : 'Season Performance';

  return (
    <div className="pageStack">
      <PageHeader
        eyebrow="Program"
        title="Coach Office"
        subtitle="Your job, the recruiting class, the game plan, and the staff behind it."
      />
      {actionError && (
        <div className="card border border-red-200 bg-red-50 text-sm text-red-800" role="alert">
          {actionError}
        </div>
      )}
      {/* ── Career Dashboard ── */}
      <div className="card">
        <div className="cardHeadRow mb-3">
          <div>
            <h3 className="m-0 text-xl">
              Coach {coach.profile.name}
              <span className="ml-2 text-sm font-normal text-gray-500">Year {careerYear}</span>
            </h3>
            <div className="text-gray-500 text-sm mt-0.5 programLockup">
              {selectedTeam && <TeamLogo team={selectedTeam} size="sm" />}
              <span>
                {selectedTeam?.schoolName} {selectedTeam?.nickname} &bull; {coach.careerTier} Program &bull; Skill {coach.profile.skill} &bull; Age {coach.profile.age}
              </span>
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
            <div className="text-xs text-gray-500 uppercase mb-1">Career record</div>
            <div className="text-lg font-bold">{coach.careerRecord.totalWins}–{coach.careerRecord.totalLosses}</div>
            <div className="text-xs text-gray-500">
              {coach.careerRecord.playoffAppearances} playoff appearance{coach.careerRecord.playoffAppearances === 1 ? '' : 's'}
              {coach.careerRecord.championships > 0 && ` · ${coach.careerRecord.championships} title${coach.careerRecord.championships !== 1 ? 's' : ''}`}
            </div>
          </div>
        </div>

        <div className="officeStats">
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
              <div className={`meter ${displayedWins >= winTarget ? 'meter-full' : ''}`}>
                <span style={{ width: `${Math.min(100, Math.round((displayedWins / Math.max(1, winTarget)) * 100))}%` }} />
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
              {pressureState.label} · {adPressure}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {(coach.employment ?? 'ACTIVE') === 'FIRED'
                ? 'The AD let you go. A landing job is in the coach pool.'
                : coach.jobSecurity < 30
                ? 'Meeting expectations is critical this season.'
                : coach.jobSecurity >= 75
                  ? 'You have strong administrative support.'
                  : 'Keep performing to stay secure.'}
            </div>
          </div>

          {/* Archetype */}
          <div>
            <div className="text-xs text-gray-500 uppercase mb-2">Archetype: {archetype.charAt(0) + archetype.slice(1).toLowerCase()}</div>
            <ul className="text-xs space-y-1 m-0 p-0 list-none">
              {archetypeBonuses.map((bonus, i) => (
                <li key={i} className="flex items-center gap-1 youMark">
                  <span>+</span> {bonus}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Career History — always visible when available */}
        {coach.seasonHistory.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs text-gray-400 uppercase font-semibold mb-2">
              Career history ({coach.seasonHistory.length} season{coach.seasonHistory.length !== 1 ? 's' : ''})
            </div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs text-gray-400 border-b">
                    <th scope="col" className="pb-1 pr-3">Season</th>
                    <th scope="col" className="pb-1 pr-3">Record</th>
                    <th scope="col" className="pb-1 pr-3">Playoff</th>
                    <th scope="col" className="pb-1 pr-3">Recruiting</th>
                    <th scope="col" className="pb-1 text-right">Security</th>
                  </tr>
                </thead>
                <tbody>
                  {[...coach.seasonHistory].reverse().map((entry, i) => (
                    <SeasonHistoryRow key={entry.year} entry={entry} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Offseason Panel ── */}
      {isOffseason && (
        <div className="card noticeCard">
          <h3 className="text-base font-bold mb-1">Offseason</h3>
          <div className="flex gap-6 mb-4 flex-wrap">
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

          <div className="flex gap-2 flex-wrap">
            {offseasonCaps.canProcessSigningDay && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => dispatch(processSigningDay())}
              >
                Resolve Signing Day
              </button>
            )}
            {offseasonCaps.canFinalizeSeason && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onEndSeason}
              >
                Finalize Season &amp; Update Record
              </button>
            )}
            {canBeginNextYear && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onNewSeason}
              >
                Begin next season
              </button>
            )}
            {signingDayResolved && (
              <div className="text-xs text-gray-500 self-center">
                {fired
                  ? 'The AD let you go. Take a landing job in the coach pool. The next year waits on that.'
                  : !seasonEndProcessed
                  ? signedClassThisYear.length === 0
                    ? 'No signees this year — finalize to update career record and continue.'
                    : 'Finalize to update career record and job security.'
                  : 'Season recorded. Start next year when ready.'}
              </div>
            )}
          </div>
        </div>
      )}

      {isOffseason && <OffseasonMarket />}

      <div className="card">
        <div className="weekActionBar">
          <div>
            <h3 className="text-base font-bold m-0">Recruiting</h3>
            <p className="text-xs text-gray-500 mt-1 mb-0">
              {recruitingPeriodLabel(season.phase, coach.recruitingWeekIndex, season.scheduleByWeek.length)} · Seed {coach.recruitingSeed}
              {' · '}
              {committedToUserCount} commit{committedToUserCount === 1 ? '' : 's'}
              {' · '}
              {coach.scholarshipsAvailable} scholarships left
              {' · '}
              <span className={hoursRemaining < 0 ? 'text-red-600 font-bold' : 'font-semibold text-gray-700'}>
                {hoursRemaining}/{WEEKLY_HOURS_CAP} hours left
              </span>
            </p>
          </div>
          {coach.recruitPool.length === 0 ? (
            isOffseason ? (
              <p className="text-xs text-gray-500 m-0">The high school class is closed. Use the roster market for the portal and the pro draft.</p>
            ) : (
              <div className="recruitSeed">
                <label className="text-xs font-semibold text-gray-600">
                  Seed
                  <input
                    type="number"
                    value={seedInput}
                    onChange={(e) => setSeedInput(Number(e.target.value))}
                    className="w-20 p-1 text-sm"
                    aria-label="Recruiting seed"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary text-sm"
                  onClick={() => dispatch(initializeRecruitingBoard({ seed: seedInput, teams: effectiveRecruitingTeams }))}
                >
                  Start Recruiting
                </button>
              </div>
            )
          ) : (
            <Link to="/career/recruiting" className="btn btn-primary text-sm">
              Open recruiting board
            </Link>
          )}
        </div>
        <div className="officeFollowup">
          <div className="text-xs text-gray-500">
            {canAdvanceWeeklyCycle && (
              <Link to="/career/week" className="block">
                Advance week {season.currentWeekIndex + 1} from the Weekly Hub
              </Link>
            )}
            {season.phase === 'PRE' && coach.recruitPool.length > 0 && (
              <div className="mt-1">Begin the season to advance hours. You can still build the board now.</div>
            )}
            {season.phase === 'PLAYOFF' && (
              <Link to="/career/week" className="block mt-1">
                Play the next round from the Weekly Hub
              </Link>
            )}
            {season.phase === 'OFFSEASON' && (
              <Link to="/career/week" className="block mt-1">
                Signing day and next year continue on the Weekly Hub
              </Link>
            )}
          </div>
        </div>
      </div>

      <section className="card" id="game-plan" aria-labelledby="game-plan-title">
        <h3 id="game-plan-title" className="text-base font-bold m-0">Game plan</h3>
        <p className="text-xs text-gray-500 mt-1 mb-0">
          The base scheme carries into every game. The week&apos;s install can override a call, and a tired team
          slows down at {FATIGUE_SLOWDOWN_THRESHOLD}% fatigue.
        </p>

        <h4 className="planSubhead">Base scheme</h4>
        <TacticSelects
          idPrefix="office-tactic"
          tactics={coach.tactics}
          onChange={(next) => dispatch(setTactics(next))}
        />

        <h4 className="planSubhead">This week&apos;s install</h4>
        <InstallPicker
          value={coach.practiceFocus}
          onChange={(focus) => dispatch(setPracticeFocus(focus))}
          archetype={coach.profile.archetype}
          operationsSkill={coach.skillTree?.operations}
        />

        <div className="planReadout">
          <div>
            <div className="planReadoutLabel">Game day</div>
            <GameDayScheme plan={coachGamePlan} changes={gameDayChanges} />
          </div>
          <div>
            <div className="planReadoutLabel">Game-day edge</div>
            <GameDayEdge plan={coachGamePlan} />
            <div className="planReadoutMeta">
              Fatigue {Math.round(coach.teamFatigue)}% ({coachGamePlan.fatigueLabel.toLowerCase()}), {projectedFatigue}% after this week.
            </div>
          </div>
          <div>
            <div className="planReadoutLabel">What it changes</div>
            <ul className="planReadoutList">
              {prepNotes.length > 0 ? prepNotes.map((note) => <li key={note}>{note}</li>) : <li>A balanced week, with no major swing.</li>}
            </ul>
          </div>
        </div>
      </section>

      <div className="card">
        <div className="cardHeadRow mb-3">
          <div>
            <h3 className="text-base font-bold m-0">Staff and program levers</h3>
            <p className="text-xs text-gray-500 mt-1 mb-0">
              The week&apos;s install picks which traits grow. Staff upgrades and resources shape recruiting, development, and AD pressure.
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>Coach level {coachLevel}</div>
            <div>XP {coachXp}/100</div>
            <div className="font-semibold youMark">Skill points: {coachSkillPoints}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          {([
            ['recruiting', 'Recruiting Tree', 'Boosts weekly recruiting gains plus faceoff/ground-ball edge.'],
            ['development', 'Development Tree', 'Improves weekly/offseason trait growth and turnover discipline.'],
            ['operations', 'Operations Tree', 'Improves fatigue control, goalie prep, and penalty avoidance.'],
          ] as const).map(([key, label, hint]) => (
            <div key={key} className="leverCard">
              <div className="text-xs uppercase text-gray-500">{label}</div>
              <div className="text-lg font-bold">
                {skillTree[key]}/5
              </div>
              <div className="text-xs text-gray-500 mb-2">{hint}</div>
              <button
                type="button"
                className="btn btn-primary text-xs"
                disabled={coachSkillPoints <= 0 || skillTree[key] >= 5}
                onClick={() => dispatch(upgradeCoachSkill(key))}
              >
                Upgrade (+1)
              </button>
            </div>
          ))}
        </div>

        <div className="leverCard mb-3">
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
            <label key={key} className="leverCard text-xs font-semibold text-gray-600">
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

    </div>
  );
}

export default CoachCareerPage;
