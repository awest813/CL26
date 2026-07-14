import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { simNextPlayoffRound, selectPlayoffState, startPlayoffs, selectSeasonSummary, resetSeason } from '../features/season/seasonSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { PlayoffRoundName } from '../types/sim';

const ROUND_LABELS: Record<PlayoffRoundName, string> = {
    'ROUND1': 'First Round (5–12)',
    'QUARTERFINAL': 'Quarterfinals (Top-4 byes enter)',
    'SEMIFINAL': 'Semifinals',
    'FINAL': 'National Championship'
};

function displaySeed(gameSeed: number, teamId: string, seedByTeamId: Map<string, number>): number | undefined {
  return gameSeed > 0 ? gameSeed : seedByTeamId.get(teamId);
}

function PlayoffsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const summary = useAppSelector(selectSeasonSummary);
  const playoffState = useAppSelector(selectPlayoffState);
  const teams = useAppSelector((state) => state.league.teams);
  const coach = useAppSelector((state) => state.coach);
  const [actionError, setActionError] = useState<string | null>(null);
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const seedByTeamId = new Map((playoffState?.seeds ?? []).map((seed) => [seed.teamId, seed.seed]));

  const canStart = summary.phase === 'PLAYOFF' && !playoffState;
  const canSim = summary.phase === 'PLAYOFF' && !!playoffState && !playoffState.championTeamId;
  const isComplete = !!playoffState?.championTeamId;
  const hasCareerTeam = Boolean(coach.selectedTeamId);
  const userTeamId = coach.selectedTeamId;
  const userSeed = userTeamId ? seedByTeamId.get(userTeamId) ?? null : null;
  const userMadeField = userSeed != null;

  const handleNewSeason = () => {
    if (confirm('Start a new season? Current season results will be preserved in your career history.')) {
      dispatch(resetSeason({ force: true }));
      navigate('/season');
    }
  };

  const handleStartPlayoffs = async () => {
    setActionError(null);
    try {
      await dispatch(startPlayoffs()).unwrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSimRound = async () => {
    setActionError(null);
    try {
      await dispatch(simNextPlayoffRound()).unwrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  if (summary.phase === 'REGULAR') {
      return (
          <div className="card text-center py-8">
              <h2>Playoffs Not Started</h2>
              <p className="text-gray-500 mb-4">Complete the regular season to unlock the post-season bracket.</p>
              <p className="text-sm text-gray-500">Week {summary.currentWeekIndex + 1} of 12 in progress.</p>
              <Link to="/season" className="btn btn-primary mt-4 inline-block">Season Dashboard →</Link>
          </div>
      );
  }

  if (summary.phase === 'PRE') {
      return (
          <div className="card text-center py-8">
              <h2>Playoffs Not Started</h2>
              <p className="text-gray-500 mb-4">
                Preseason setup is still open. Begin the season, then finish the 12-week regular season to unlock the bracket.
              </p>
              <Link to="/season" className="btn btn-primary mt-2 inline-block">Open Season Dashboard →</Link>
          </div>
      );
  }

  return (
    <div className="pageStack">
      {/* Header controls */}
      <div className="card flex justify-between items-center">
        <div>
            <h2 className="m-0">College Lacrosse Playoff</h2>
            <div className="text-sm text-gray-500 mt-1">
                {isComplete
                  ? `${summary.year} Season Complete`
                  : `Current Round: ${playoffState ? ROUND_LABELS[playoffState.currentRound] : 'Selection Pending'}`}
            </div>
        </div>

        <div className="flex gap-2">
            {canStart && (
                <button className="btn btn-primary" onClick={handleStartPlayoffs}>
                    Initialize Bracket
                </button>
            )}
            {canSim && (
                <button className="btn btn-primary" onClick={handleSimRound}>
                    Simulate {ROUND_LABELS[playoffState!.currentRound]}
                </button>
            )}
            {isComplete && (
                hasCareerTeam ? (
                  <button className="btn btn-primary" onClick={() => navigate('/career')}>
                      Open Career Office
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={handleNewSeason}>
                      Begin New Season
                  </button>
                )
            )}
        </div>
      </div>

      {actionError && (
        <div className="card border border-red-200 bg-red-50 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Made / missed field banner once bracket exists */}
      {playoffState && hasCareerTeam && !isComplete && (
        <div className={`card text-sm ${userMadeField ? 'border border-blue-200 bg-blue-50' : 'border border-amber-200 bg-amber-50'}`}>
          {userMadeField
            ? `Your program is in as the #${userSeed} seed.`
            : 'Your program missed the 12-team field. You can still watch the bracket play out.'}
        </div>
      )}

      {/* Champion banner — shown prominently when season is complete */}
      {isComplete && playoffState?.championTeamId && (
          <div className="champion-banner">
              <p className="champion-banner-label">
                  {summary.year} National Champion
              </p>
              <p className="champion-banner-name">
                  {teamById.get(playoffState.championTeamId)?.schoolName} {teamById.get(playoffState.championTeamId)?.nickname}
              </p>
              {coach.selectedTeamId === playoffState.championTeamId && (
                  <p className="champion-banner-you">Your team won the championship!</p>
              )}
          </div>
      )}

      {playoffState && (
        <div className="playoffLayoutGrid">
            {/* Seeding panel */}
            <div className="card">
                <h3>Tournament Seeds</h3>
                <div className="overflow-y-auto" style={{ maxHeight: '560px' }}>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-500 border-b">
                                <th className="pb-2 w-10">Seed</th>
                                <th className="pb-2">Team</th>
                                <th className="pb-2 text-right pr-1">Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            {playoffState.seeds.map((seed) => {
                                const team = teamById.get(seed.teamId);
                                const hasBye = seed.seed <= 4;
                                const isChamp = isComplete && playoffState.championTeamId === seed.teamId;
                                const isUser = seed.teamId === userTeamId;
                                const allGames = Object.values(playoffState.rounds).flat();
                                const lostAGame = allGames.some(
                                  (g) =>
                                    g.winnerTeamId &&
                                    (g.homeTeamId === seed.teamId || g.awayTeamId === seed.teamId) &&
                                    g.winnerTeamId !== seed.teamId,
                                );
                                // Bye label only while Round 1 is the active (unsimulated) round.
                                const showBye =
                                  hasBye &&
                                  !lostAGame &&
                                  !isComplete &&
                                  playoffState.currentRound === 'ROUND1';
                                const isAlive = !lostAGame && !isChamp && !isComplete;
                                return (
                                    <tr
                                      key={seed.teamId}
                                      className={`border-b last:border-0 ${isChamp ? 'bg-yellow-50' : ''} ${isUser ? 'bg-blue-50' : ''}`}
                                    >
                                        <td className="py-1.5 font-mono font-bold text-center">#{seed.seed}</td>
                                        <td className="py-1.5">
                                            <div className="font-semibold leading-tight">
                                              {team?.schoolName}
                                              {isUser && <span className="ml-1 text-xs font-normal text-blue-600">(You)</span>}
                                            </div>
                                            <div className="text-xs text-gray-500">{team?.nickname}</div>
                                        </td>
                                        <td className="py-1.5 text-right text-xs pr-1">
                                            {isChamp && <span className="text-yellow-700 font-bold">Champ</span>}
                                            {!isChamp && showBye && <span className="text-blue-600">Bye</span>}
                                            {!isChamp && lostAGame && <span className="text-gray-400">Out</span>}
                                            {!isChamp && !showBye && isAlive && (
                                              <span className="text-green-700">Alive</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bracket rounds */}
            <div className="pageStack">
                {(['ROUND1', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL'] as const).map((round) => {
                    const games = playoffState.rounds[round];
                    if (games.length === 0) return null;

                    return (
                        <div key={round} className="card">
                            <h3 className="text-base font-bold border-b pb-2 mb-3">{ROUND_LABELS[round]}</h3>
                            {round === 'ROUND1' && (
                              <p className="text-xs text-gray-500">Seeds 1–4 have automatic byes. Winners advance to seeded quarterfinal matchups.</p>
                            )}
                            <div className="grid2 gap-3">
                                {games.map((game) => {
                                     const home = teamById.get(game.homeTeamId);
                                     const away = teamById.get(game.awayTeamId);
                                     const winnerId = game.winnerTeamId;
                                     const awaySeed = displaySeed(game.awaySeed, game.awayTeamId, seedByTeamId);
                                     const homeSeed = displaySeed(game.homeSeed, game.homeTeamId, seedByTeamId);
                                     const involvesUser =
                                       game.homeTeamId === userTeamId || game.awayTeamId === userTeamId;

                                    const awayWon = winnerId === game.awayTeamId;
                                    const homeWon = winnerId === game.homeTeamId;
                                    const awayLost = Boolean(winnerId) && !awayWon;
                                    const homeLost = Boolean(winnerId) && !homeWon;

                                    return (
                                        <div
                                          key={game.id}
                                          className={`border rounded p-3 text-sm bg-gray-50 ${involvesUser ? 'border-blue-400 ring-1 ring-blue-200' : ''}`}
                                        >
                                            {/* Away team row */}
                                            <div className={`flex justify-between items-center mb-1 ${awayWon ? 'font-bold text-black' : awayLost ? 'text-gray-400 line-through-gentle' : 'text-gray-700'} ${game.awayTeamId === userTeamId ? 'text-blue-800' : ''}`}>
                                                <span>
                                                    {awaySeed && <span className="text-xs text-gray-400 mr-1 font-normal">#{awaySeed}</span>}
                                                    {away?.schoolName}
                                                    {game.awayTeamId === userTeamId && <span className="ml-1 text-xs font-normal text-blue-600">(You)</span>}
                                                </span>
                                                <span className="font-mono ml-2">
                                                    {game.result != null ? game.result.awayScore : '—'}
                                                </span>
                                            </div>
                                            {/* Home team row */}
                                            <div className={`flex justify-between items-center ${homeWon ? 'font-bold text-black' : homeLost ? 'text-gray-400 line-through-gentle' : 'text-gray-700'} ${game.homeTeamId === userTeamId ? 'text-blue-800' : ''}`}>
                                                <span>
                                                    {homeSeed && <span className="text-xs text-gray-400 mr-1 font-normal">#{homeSeed}</span>}
                                                    {home?.schoolName}
                                                    {game.homeTeamId === userTeamId && <span className="ml-1 text-xs font-normal text-blue-600">(You)</span>}
                                                </span>
                                                <span className="font-mono ml-2">
                                                    {game.result != null ? game.result.homeScore : '—'}
                                                </span>
                                            </div>
                                            {!game.result && (
                                                <div className="text-center text-xs text-gray-400 mt-1 border-t pt-1">Scheduled</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      )}
    </div>
  );
}

export default PlayoffsPage;
