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
  advanceToNextSeason,
} from '../features/season/seasonSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

function SeasonPage() {
  const dispatch = useAppDispatch();
  const [seedInput, setSeedInput] = useState(2026);
  const [yearInput, setYearInput] = useState(2026);
  const [conferenceFilter, setConferenceFilter] = useState('ALL');
  const [isSimulating, setIsSimulating] = useState(false);

  const summary = useAppSelector(selectSeasonSummary);
  const hasSeason = useAppSelector(selectSeasonHasStarted);
  const teams = useAppSelector((state) => state.league.teams);
  const conferences = useAppSelector((state) => state.league.conferences);

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

  const handleStartSeason = async () => {
      setIsSimulating(true);
      await dispatch(startNewSeason({ seed: seedInput, year: yearInput }));
      setIsSimulating(false);
  };

  const handleSimWeek = async () => {
      setIsSimulating(true);
      await dispatch(simCurrentWeek());
      setIsSimulating(false);
  };

  const handleSimSeason = async () => {
      if(confirm("Simulate the rest of the regular season? This may take a moment.")) {
        setIsSimulating(true);
        // Add a small delay so the UI updates to show disabled state before the heavy sync process locks it up (if it was sync, but it is async thunk)
        setTimeout(async () => {
            await dispatch(simSeason());
            setIsSimulating(false);
        }, 50);
      }
  };

  const handleAdvanceSeason = async () => {
      if(confirm(`Ready to advance to the ${summary.year ? summary.year + 1 : 'next'} season? This will archive your recruiting class and generate a new schedule.`)) {
          setIsSimulating(true);
          await dispatch(advanceToNextSeason());
          setIsSimulating(false);
      }
  };

  const handleReset = () => {
      if(confirm("Are you sure you want to reset the season? This cannot be undone.")) {
          dispatch(resetSeason());
      }
  };

  if (!hasSeason) {
      return (
          <div className="card max-w-lg mx-auto">
              <h2 className="text-xl font-bold mb-4">Start New Season</h2>
              <p className="mb-4 text-gray-500">Configure your season settings below.</p>

              <div className="flex gap-4 mb-4">
                  <div className="flex-1">
                      <label className="block text-sm font-semibold mb-1">Starting Year</label>
                      <input
                        type="number"
                        value={yearInput}
                        onChange={(e) => setYearInput(Number(e.target.value))}
                        className="p-2 border rounded w-full"
                      />
                  </div>
                  <div className="flex-1">
                      <label className="block text-sm font-semibold mb-1">Schedule Seed</label>
                      <input
                        type="number"
                        value={seedInput}
                        onChange={(e) => setSeedInput(Number(e.target.value))}
                        className="p-2 border rounded w-full"
                      />
                  </div>
              </div>
              <div className="mb-4">
                  <button
                      className="text-blue-600 text-sm hover:underline"
                      onClick={() => setSeedInput(Math.floor(Math.random() * 10000))}
                  >
                      Generate Random Seed
                  </button>
              </div>

              <div className="flex justify-end border-t pt-4">
                  <button
                      className="btn btn-primary"
                      onClick={handleStartSeason}
                      disabled={isSimulating}
                  >
                      {isSimulating ? 'Starting...' : 'Begin Season'}
                  </button>
              </div>
          </div>
      );
  }

  if (summary.phase === 'OFFSEASON') {
      return (
          <div className="card max-w-2xl mx-auto text-center py-12">
              <div className="text-6xl mb-4">🏆</div>
              <h2 className="text-3xl font-bold mb-2">Season Complete!</h2>
              <p className="text-gray-500 mb-8">The {summary.year || 'current'} season has concluded.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left mb-8 max-w-lg mx-auto">
                  <div className="p-4 bg-gray-50 rounded border">
                      <h3 className="font-bold border-b pb-2 mb-2">Season Recap</h3>
                      <p>Year: {summary.year}</p>
                      <p>Champion: <span className="font-semibold text-blue-800">Check Playoffs</span></p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded border">
                      <h3 className="font-bold border-b pb-2 mb-2">Recruiting Class</h3>
                      <p>New Recruits: <span className="font-semibold text-green-600">See Career</span></p>
                      <p>Status: <span className="text-gray-600">Signed</span></p>
                  </div>
              </div>

              <div className="flex gap-4 justify-center">
                  <Link to="/playoffs" className="btn bg-gray-200 text-gray-800 hover:bg-gray-300">
                      View Final Bracket
                  </Link>
                  <button
                      onClick={handleAdvanceSeason}
                      disabled={isSimulating}
                      className="btn btn-primary text-lg px-8 py-3"
                  >
                      {isSimulating ? 'Advancing...' : `Advance to ${summary.year ? summary.year + 1 : 'Next'} Season`}
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="card">
        <div className="flex flex-wrap gap-4 justify-between items-center mb-4">
            <div>
                <h2 className="m-0 text-xl font-bold">Season Dashboard</h2>
                <div className="text-sm text-gray-500 mt-1">
                    Week {displayWeek + 1} of 12 &bull; {summary.phase} Phase &bull; {summary.year}
                </div>
            </div>

            {summary.phase === 'REGULAR' && (
                <div className="flex gap-2">
                     <button
                        className="btn btn-primary"
                        onClick={handleSimWeek}
                        disabled={isSimulating}
                     >
                        {isSimulating ? 'Simulating...' : `Sim Week ${displayWeek + 1}`}
                     </button>
                     <button
                        className="btn bg-blue-100 text-blue-800 hover:bg-blue-200"
                        onClick={handleSimSeason}
                        disabled={isSimulating}
                     >
                        Sim To End
                     </button>
                </div>
            )}
             {summary.phase === 'PLAYOFF' && (
                 <div className="flex gap-2">
                     <Link to="/playoffs" className="btn btn-primary">Go to Playoffs</Link>
                 </div>
             )}
        </div>

        <div className="flex flex-wrap gap-2 text-sm mt-4 border-t pt-2 items-center">
             <Link to="/conferences" className="text-blue-600 hover:underline">View Standings</Link>
             <span>&bull;</span>
             <Link to={`/season/week/${displayWeek}`} className="text-blue-600 hover:underline">Full Weekly Schedule</Link>
             <span className="flex-1"></span>
             <button onClick={handleReset} className="text-red-600 hover:underline bg-transparent border-0 cursor-pointer p-0 text-xs">
                 Reset Season (Quit)
             </button>
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h3 className="m-0 text-lg font-semibold">Week {displayWeek + 1} Matchups</h3>
            <select
                value={conferenceFilter}
                onChange={(e) => setConferenceFilter(e.target.value)}
                className="p-1 text-sm border rounded"
            >
                <option value="ALL">All Conferences</option>
                {conferences.map((conf) => (
                  <option key={conf.id} value={conf.id}>
                    {conf.name}
                  </option>
                ))}
            </select>
        </div>

        <div className="flex flex-col gap-0">
          {filteredGames.slice(0, 10).map(({ game, result }) => {
            const home = teamById.get(game.homeTeamId);
            const away = teamById.get(game.awayTeamId);
            return (
              <div key={game.id} className="p-3 border-b border-gray-100 flex justify-between items-center hover:bg-gray-50 transition-colors">
                <div className="flex-1 text-right">
                    <span className="font-semibold block md:inline">{away?.schoolName}</span>
                    <span className="text-xs text-gray-500 ml-1">({away?.nickname})</span>
                </div>
                <div className="mx-4 font-mono font-bold text-lg min-w-[80px] text-center bg-gray-100 rounded px-2 py-1">
                    {result ? (
                        <span>{result.scoreB} - {result.scoreA}</span>
                    ) : (
                        <span className="text-gray-400 text-sm">vs</span>
                    )}
                </div>
                <div className="flex-1 text-left">
                    <span className="font-semibold block md:inline">{home?.schoolName}</span>
                    <span className="text-xs text-gray-500 ml-1">({home?.nickname})</span>
                </div>
              </div>
            );
          })}

          {filteredGames.length === 0 && (
              <p className="text-center text-gray-500 py-8 italic">No games found for this filter.</p>
          )}

          {filteredGames.length > 10 && (
             <div className="text-center mt-2 p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100">
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
