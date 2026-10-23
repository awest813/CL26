import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TeamLogo from '../components/TeamLogo';
import {
  selectSeasonCapabilities,
  selectSeasonHasStarted,
  selectSeasonSummary,
  selectWeekGames,
  simCurrentWeek,
  simSeason,
  resetSeason,
} from '../features/season/seasonSlice';
import { beginFirstSeason } from '../features/coach/careerThunks';
import { selectIsCareerReady } from '../features/coach/coachSlice';
import { confirmPlayCopy } from '../features/settings/settingsSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { seasonPhaseLabel } from '../lib/seasonLabels';
import PageHeader from '../components/PageHeader';

interface NextStepAction {
  label: string;
  link: string | null;
  cta: string | null;
}

function SeasonPage() {
  const dispatch = useAppDispatch();
  const [seedInput, setSeedInput] = useState(2026);
  const [conferenceFilter, setConferenceFilter] = useState('ALL');
  const [startError, setStartError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const summary = useAppSelector(selectSeasonSummary);
  const hasSeason = useAppSelector(selectSeasonHasStarted);
  const capabilities = useAppSelector(selectSeasonCapabilities);
  const teams = useAppSelector((state) => state.league.teams);
  const conferences = useAppSelector((state) => state.league.conferences);
  const scheduleLength = useAppSelector((state) => state.season.scheduleByWeek.length);
  const displayWeek = Math.min(summary.currentWeekIndex, Math.max(scheduleLength - 1, 0));
  const weekSelector = useMemo(() => selectWeekGames(displayWeek), [displayWeek]);
  const thisWeekGames = useAppSelector(weekSelector);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const filteredGames = useMemo(() => {
    return thisWeekGames.filter(({ game }) => {
      if (conferenceFilter === 'ALL') return true;
      const home = teamById.get(game.homeTeamId);
      const away = teamById.get(game.awayTeamId);
      return home?.conferenceId === conferenceFilter || away?.conferenceId === conferenceFilter;
    });
  }, [thisWeekGames, conferenceFilter, teamById]);

  const hasValidSeed = Number.isFinite(seedInput);
  const coachReady = useAppSelector(selectIsCareerReady);
  const confirmPlay = useAppSelector((state) => state.settings.confirmPlay);
  const selectedTeamId = useAppSelector((state) => state.coach.selectedTeamId);

  const nextStep = useMemo<NextStepAction>(() => {
    if (!hasSeason) return { label: 'Start this season to unlock the weekly loop.', link: null, cta: null };
    if (summary.phase === 'REGULAR') {
      if (coachReady) {
        return {
          label: 'Your game is pinned at the top of the slate. Play the week from the hub.',
          link: '/career/week',
          cta: 'Open Weekly Hub',
        };
      }
      return {
        label: 'Sim from this page, or create a coach to run the full weekly loop.',
        link: '/career/setup',
        cta: 'Set up coach',
      };
    }
    if (summary.phase === 'PLAYOFF') {
      if (coachReady) {
        return { label: 'The next round is on the Weekly Hub. The full bracket stays on the playoff page.', link: '/career/week', cta: 'Continue in the Weekly Hub' };
      }
      return { label: 'Regular season is complete. Continue into the playoff bracket.', link: '/playoffs', cta: 'Open playoffs' };
    }
    if (summary.phase === 'OFFSEASON') {
      if (coachReady) {
        return { label: 'Signing day, the season record, and the next season continue in the Weekly Hub.', link: '/career/week', cta: 'Continue in the Weekly Hub' };
      }
      return { label: 'Season is complete. Begin a fresh season when ready.', link: null, cta: null };
    }
    return { label: 'Season is in preseason setup.', link: null, cta: null };
  }, [coachReady, hasSeason, summary.phase]);

  const handleStartSeason = async () => {
    if (!hasValidSeed) return;
    setStartError(null);
    try {
      await dispatch(beginFirstSeason({ seed: seedInput })).unwrap();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSimWeek = async () => {
    if (confirmPlay && !window.confirm(confirmPlayCopy('week', `week ${displayWeek + 1}`))) return;
    setActionError(null);
    try {
      await dispatch(simCurrentWeek()).unwrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSimSeason = async () => {
    if (!confirm('Simulate the rest of the regular season?')) return;
    setActionError(null);
    try {
      await dispatch(simSeason()).unwrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleReset = () => {
    if (!capabilities.canResetSeason) return;
    const message = coachReady
      ? 'Reset this season\'s schedule and results? Your career and roster stay, the year stays the same, and the recruiting class starts over. You begin the season again from preseason.'
      : 'Are you sure you want to reset the season? This cannot be undone.';
    if (confirm(message)) {
      dispatch(resetSeason(coachReady ? { preserveYear: true } : undefined));
    }
  };

  const handleNewSeason = () => {
    if (confirm('Start a fresh season from preseason? This will clear current season progression.')) {
      // Non-career OFFSEASON path — force past soft-reset lock.
      dispatch(resetSeason({ force: true }));
    }
  };

  if (!hasSeason) {
    return (
      <div className="pageStack">
        <PageHeader
          eyebrow="Season"
          title="Begin season"
          subtitle={coachReady
            ? 'Set the season seed to generate schedules, refresh your roster draw, and open recruiting.'
            : 'Configure your seed to generate this year\'s schedules and CPU rosters.'}
        />

        {!coachReady && (
          <div className="card border border-amber-200 bg-amber-50 text-sm text-amber-900">
            Career setup is not finished. You can still start a spectator season, or{' '}
            <Link to="/career/setup" className="underline font-semibold">create your coach</Link> first for the full loop.
          </div>
        )}

        <div className="card max-w-lg mx-auto">
          <p className="m-0 mb-4 text-sm text-gray-600">
            The season seed controls schedule generation and the entire CPU league roster draw. Those rosters stay
            fixed for this year and refresh when you start a later season with a new seed.
            {coachReady && ' Your managed roster and recruiting board will sync to this seed when you begin.'}
          </p>

          <div className="flex flex-wrap gap-4 items-end mb-4">
            <label className="flex-1">
              <span className="text-sm font-semibold">Season seed</span>
              <input
                type="number"
                value={seedInput}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.trim() === '') {
                    setSeedInput(Number.NaN);
                    return;
                  }
                  setSeedInput(Number(value));
                }}
                className="p-2 border rounded w-full"
              />
            </label>
            <button type="button" className="btn" onClick={() => setSeedInput(Math.floor(Math.random() * 10000))}>
              Random
            </button>
          </div>

          {!hasValidSeed && <p className="text-sm text-red-600 mt-1">Enter a valid numeric seed to begin.</p>}
          {startError && <p className="text-sm text-red-600 mt-1">{startError}</p>}

          <div className="flex justify-end">
            <button type="button" className="btn btn-primary" onClick={handleStartSeason} disabled={!hasValidSeed}>
              Begin season
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pageStack">
      <PageHeader
        eyebrow="Season"
        title="Dashboard"
        subtitle={`${summary.year} · ${seasonPhaseLabel(summary.phase, summary.currentWeekIndex, scheduleLength)}`}
        actions={
          <>
            {summary.phase === 'REGULAR' && (
              coachReady ? (
                <Link to="/career/week" className="btn btn-primary">
                  Play the week in the Weekly Hub
                </Link>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" onClick={handleSimWeek}>
                    Sim week {displayWeek + 1}
                  </button>
                  <button type="button" className="btn" onClick={handleSimSeason}>
                    Sim to the end
                  </button>
                </>
              )
            )}
            {summary.phase === 'PLAYOFF' && (
              <>
                {coachReady && (
                  <Link to="/career/week" className="btn btn-primary">
                    Continue in the Weekly Hub
                  </Link>
                )}
                <Link to="/playoffs" className={coachReady ? 'btn' : 'btn btn-primary'}>
                  {coachReady ? 'Full bracket' : 'Go to the playoffs'}
                </Link>
              </>
            )}
            {summary.phase === 'OFFSEASON' && (
              <>
                <Link to="/playoffs" className="btn">
                  Playoff results
                </Link>
                {coachReady ? (
                  <Link to="/career/week" className="btn btn-primary">
                    Continue in the Weekly Hub
                  </Link>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={handleNewSeason}>
                    Begin new season
                  </button>
                )}
              </>
            )}
          </>
        }
      />

      {actionError && (
        <div className="card border border-red-200 bg-red-50 text-sm text-red-700" role="alert">
          {actionError}
        </div>
      )}

      <div className="card">
        <div className="seasonLinkRow seasonLinkRow-flush">
          <Link to="/season/standings" className="seasonInlineLink">
            Standings
          </Link>
          <Link to={`/season/week/${displayWeek}`} className="seasonInlineLink">
            Week {displayWeek + 1} results
          </Link>
          <Link to="/rankings" className="seasonInlineLink">
            Top 25
          </Link>
          {capabilities.canResetSeason && (
            <button type="button" onClick={handleReset} className="seasonInlineLink seasonInlineLink-danger ml-auto">
              Reset season
            </button>
          )}
        </div>
        {!coachReady && (
          <div className="mt-3 border-t pt-3 flex items-center justify-between gap-3">
            <div className="text-sm text-gray-600">{nextStep.label}</div>
            {nextStep.link && nextStep.cta && (
              <Link to={nextStep.link} className="btn btn-primary text-sm">
                {nextStep.cta}
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="seasonHeaderRow">
          <div>
            <h3 className="m-0 text-lg font-semibold">Week {displayWeek + 1}</h3>
            <p className="pageHeader-sub">Visitor on the left. Home on the right.</p>
          </div>
          <label className="seasonFilter">
            <span>Conference</span>
            <select value={conferenceFilter} onChange={(e) => setConferenceFilter(e.target.value)}>
              <option value="ALL">All conferences</option>
              {conferences.map((conf) => (
                <option key={conf.id} value={conf.id}>
                  {conf.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="seasonMatchupList">
          {[...filteredGames]
            .sort((a, b) => {
              const aUser = Boolean(selectedTeamId) && (a.game.homeTeamId === selectedTeamId || a.game.awayTeamId === selectedTeamId);
              const bUser = Boolean(selectedTeamId) && (b.game.homeTeamId === selectedTeamId || b.game.awayTeamId === selectedTeamId);
              if (aUser === bUser) return 0;
              return aUser ? -1 : 1;
            })
            .slice(0, 10)
            .map(({ game, result }) => {
            const home = teamById.get(game.homeTeamId);
            const away = teamById.get(game.awayTeamId);
            const isUserGame = Boolean(selectedTeamId) && (game.homeTeamId === selectedTeamId || game.awayTeamId === selectedTeamId);
            return (
              <div key={game.id} className={`seasonMatchupRow ${isUserGame ? 'seasonMatchupRow-user' : ''}`}>
                <div className="seasonSide">
                  <div className="seasonIdentity seasonIdentity-away">
                    {away && <TeamLogo team={away} size="sm" />}
                    <div>
                      {away ? <Link to={`/team/${away.id}`} className="seasonSchool">{away.schoolName}</Link> : <span className="seasonSchool">Away</span>}
                      <span className="seasonNick">
                        {away?.nickname}
                        {game.awayTeamId === selectedTeamId && <span className="youMark"> (You)</span>}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={result ? 'seasonScore' : 'seasonScore seasonScore-pending'}>
                  {result ? `${result.scoreB}–${result.scoreA}` : 'vs'}
                </div>
                <div className="seasonSide seasonSide-home">
                  <div className="seasonIdentity">
                    {home && <TeamLogo team={home} size="sm" />}
                    <div>
                      {home ? <Link to={`/team/${home.id}`} className="seasonSchool">{home.schoolName}</Link> : <span className="seasonSchool">Home</span>}
                      <span className="seasonNick">
                        {home?.nickname}
                        {game.homeTeamId === selectedTeamId && <span className="youMark"> (You)</span>}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredGames.length === 0 && <p className="text-center text-gray-500 py-4">No games found for this filter.</p>}

          {filteredGames.length > 10 && (
            <div className="seasonMatchupFooter">
              <Link to={`/season/week/${displayWeek}`} className="text-sm font-semibold block">
                View all {filteredGames.length} games for Week {displayWeek + 1} &rarr;
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SeasonPage;
