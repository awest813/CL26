import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  selectSeasonHasStarted,
  selectSeasonSummary,
  selectWeekGames,
  simCurrentWeek,
  simSeason,
  startNewSeason,
  resetSeason,
} from '../features/season/seasonSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

const PHASE_LABELS: Record<string, string> = {
  PRE: 'Pre-Season',
  REGULAR: 'Regular Season',
  PLAYOFF: 'Playoffs',
  OFFSEASON: 'Offseason',
};

interface NextStepAction {
  label: string;
  link: string | null;
  cta: string | null;
}

function SeasonPage() {
  const dispatch = useAppDispatch();
  const [seedInput, setSeedInput] = useState(2026);
  const [conferenceFilter, setConferenceFilter] = useState('ALL');
  const summary = useAppSelector(selectSeasonSummary);
  const hasSeason = useAppSelector(selectSeasonHasStarted);
  const teams = useAppSelector((state) => state.league.teams);
  const conferences = useAppSelector((state) => state.league.conferences);
  const coach = useAppSelector((state) => state.coach);

  const displayWeek = Math.min(summary.currentWeekIndex, 11);
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
  const coachReady = coach.onboardingStep === 'READY' && Boolean(coach.selectedTeamId);

  const nextStep = useMemo<NextStepAction>(() => {
    if (!hasSeason) return { label: 'Start this season to unlock the weekly loop.', link: null, cta: null };
    if (summary.phase === 'REGULAR') {
      if (coachReady) {
        return {
          label: 'Use Weekly Hub to advance season + recruiting together.',
          link: '/career/week',
          cta: 'Open Weekly Hub →',
        };
      }
      return {
        label: 'Sim from this page, or create a coach to run the full weekly loop.',
        link: '/career/setup',
        cta: 'Set Up Coach →',
      };
    }
    if (summary.phase === 'PLAYOFF') return { label: 'Regular season is complete. Continue into the playoff bracket.', link: '/playoffs', cta: 'Open Playoffs →' };
    if (summary.phase === 'OFFSEASON') {
      if (coachReady) {
        return { label: 'Finalize offseason actions, then begin the next year.', link: '/career', cta: 'Open Career Office →' };
      }
      return { label: 'Season is complete. Begin a fresh season when ready.', link: null, cta: null };
    }
    return { label: 'Season is in pre-season setup.', link: null, cta: null };
  }, [coachReady, hasSeason, summary.phase]);

  const handleStartSeason = () => {
    if (!hasValidSeed) return;
    dispatch(startNewSeason({ seed: seedInput }));
  };

  const handleSimWeek = () => {
    dispatch(simCurrentWeek());
  };

  const handleSimSeason = () => {
    if (confirm('Simulate the rest of the regular season?')) {
      dispatch(simSeason());
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset the season? This cannot be undone.')) {
      dispatch(resetSeason());
    }
  };

  const handleNewSeason = () => {
    if (confirm('Start a fresh season from pre-season? This will clear current season progression.')) {
      dispatch(resetSeason());
    }
  };

  if (!hasSeason) {
    return (
      <div className="pageStack">
        <div className="pageHeader">
          <h2>Start New Season</h2>
          <p className="pageHeader-sub">Configure your seed to generate this year&apos;s schedules and CPU rosters.</p>
        </div>

        <div className="card max-w-lg mx-auto w-full">
          <p className="m-0 mb-4 text-sm text-gray-600">
            The season seed controls schedule generation and the entire CPU league roster draw. Those rosters stay
            fixed for this year and refresh when you start a later season with a new seed.
          </p>

          <div className="flex gap-4 items-end mb-4">
            <label className="flex-1">
              <span className="text-sm font-semibold">Season Seed</span>
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
            <button className="btn" onClick={() => setSeedInput(Math.floor(Math.random() * 10000))}>
              Random
            </button>
          </div>

          {!hasValidSeed && <p className="text-sm text-red-600 mt-1">Enter a valid numeric seed to begin.</p>}

          <div className="flex justify-end">
            <button className="btn btn-primary" onClick={handleStartSeason} disabled={!hasValidSeed}>
              Begin Season
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pageStack">
      <div className="card">
        <div className="seasonHeaderRow">
          <div className="pageHeader m-0">
            <h2 className="m-0 text-xl font-bold">Season Dashboard</h2>
            <p className="pageHeader-sub">
              Week {displayWeek + 1} of 12 &bull; {PHASE_LABELS[summary.phase] ?? summary.phase}
            </p>
          </div>

          {summary.phase === 'REGULAR' && (
            <div className="seasonActionGroup">
              <button className="btn btn-primary" onClick={handleSimWeek}>
                Sim Week {displayWeek + 1}
              </button>
              <button className="btn" onClick={handleSimSeason}>
                Sim To End
              </button>
            </div>
          )}
          {summary.phase === 'PLAYOFF' && (
            <div className="seasonActionGroup">
              <Link to="/playoffs" className="btn btn-primary">
                Go to Playoffs
              </Link>
            </div>
          )}
          {summary.phase === 'OFFSEASON' && (
            <div className="seasonActionGroup">
              <Link to="/playoffs" className="btn">
                View Playoff Results
              </Link>
              {coachReady ? (
                <Link to="/career" className="btn btn-primary">
                  Open Career Office
                </Link>
              ) : (
                <button className="btn btn-primary" onClick={handleNewSeason}>
                  Begin New Season
                </button>
              )}
            </div>
          )}
        </div>

        <div className="seasonLinkRow">
          <Link to="/season/standings" className="seasonInlineLink">
            View Standings
          </Link>
          <Link to={`/season/week/${displayWeek}`} className="seasonInlineLink">
            Full Weekly Schedule
          </Link>
          <button onClick={handleReset} className="seasonInlineLink seasonInlineLink-danger ml-auto">
            Reset Season
          </button>
        </div>
        <div className="mt-3 border-t pt-3 flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">{nextStep.label}</div>
          {nextStep.link && nextStep.cta && (
            <Link to={nextStep.link} className="btn btn-primary text-sm">
              {nextStep.cta}
            </Link>
          )}
        </div>
      </div>

      <div className="card">
        <div className="seasonHeaderRow border-b pb-2 mb-4">
          <h3 className="m-0 text-lg font-semibold">Week {displayWeek + 1} Matchups</h3>
          <select value={conferenceFilter} onChange={(e) => setConferenceFilter(e.target.value)} className="p-1 text-sm border rounded">
            <option value="ALL">All Conferences</option>
            {conferences.map((conf) => (
              <option key={conf.id} value={conf.id}>
                {conf.name}
              </option>
            ))}
          </select>
        </div>

        <div className="seasonMatchupList">
          {filteredGames.slice(0, 10).map(({ game, result }) => {
            const home = teamById.get(game.homeTeamId);
            const away = teamById.get(game.awayTeamId);
            return (
              <div key={game.id} className="seasonMatchupRow">
                <div className="flex-1 text-right">
                  <span className="font-semibold">{away?.schoolName}</span>
                  <span className="text-xs text-gray-500 ml-1">({away?.nickname})</span>
                </div>
                <div className="mx-4 font-mono font-bold text-lg min-w-[60px] text-center">
                  {result ? <span>{result.scoreB} - {result.scoreA}</span> : <span className="text-gray-400 text-sm">vs</span>}
                </div>
                <div className="flex-1 text-left">
                  <span className="font-semibold">{home?.schoolName}</span>
                  <span className="text-xs text-gray-500 ml-1">({home?.nickname})</span>
                </div>
              </div>
            );
          })}

          {filteredGames.length === 0 && <p className="text-center text-gray-500 py-4">No games found for this filter.</p>}

          {filteredGames.length > 10 && (
            <div className="seasonMatchupFooter">
              <Link to={`/season/week/${displayWeek}`} className="text-sm text-blue-600 font-semibold block">
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
