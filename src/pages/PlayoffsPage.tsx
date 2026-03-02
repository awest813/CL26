import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { simNextPlayoffRound, selectPlayoffState, startPlayoffs, selectSeasonSummary, selectTeamRecords, resetSeason } from '../features/season/seasonSlice';
import { recordSeasonEnd } from '../features/coach/coachSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { PlayoffRoundName } from '../types/sim';

const ROUND_LABELS: Record<PlayoffRoundName, string> = {
    'ROUND1': 'First Round',
    'QUARTERFINAL': 'Quarterfinals',
    'SEMIFINAL': 'Semifinals',
    'FINAL': 'Championship'
};

function PlayoffsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const summary = useAppSelector(selectSeasonSummary);
  const playoffState = useAppSelector(selectPlayoffState);
  const teams = useAppSelector((state) => state.league.teams);
  const records = useAppSelector(selectTeamRecords);
  const coach = useAppSelector((state) => state.coach);
  const teamById = new Map(teams.map((team) => [team.id, team]));

  const canStart = summary.phase === 'PLAYOFF' && !playoffState;
  const canSim = summary.phase === 'PLAYOFF' && !!playoffState && !playoffState.championTeamId;
  const isComplete = !!playoffState?.championTeamId;

  // When a champion is crowned and a coach team is selected, record the season
  useEffect(() => {
    if (!playoffState?.championTeamId || !coach.selectedTeamId) return;
    // Guard: only record once per season year
    if (coach.seasonHistory.some(h => h.year === summary.year)) return;

    const coachRecord = records[coach.selectedTeamId] ?? { wins: 0, losses: 0 };
    const madePlayoffs = playoffState.seeds.some(s => s.teamId === coach.selectedTeamId);
    const isChampion = playoffState.championTeamId === coach.selectedTeamId;
    const signedByYear = coach.signedRecruitsByYear[summary.year] ?? [];

    dispatch(recordSeasonEnd({
      year: summary.year,
      wins: coachRecord.wins,
      losses: coachRecord.losses,
      madePlayoffs,
      champion: isChampion,
      recruitsSigned: signedByYear.length,
      avgRecruitStars: signedByYear.length > 0
        ? signedByYear.reduce((sum, r) => sum + r.stars, 0) / signedByYear.length
        : 0,
      jobSecurityEnd: coach.jobSecurity,
    }));
  }, [playoffState?.championTeamId]);

  const handleNewSeason = () => {
    if (confirm('Start a new season? Current season results will be preserved in your career history.')) {
      dispatch(resetSeason());
      navigate('/season');
    }
  };

  if (summary.phase === 'REGULAR' || summary.phase === 'PRE') {
      return (
          <div className="card text-center py-8">
              <h2>Playoffs Not Started</h2>
              <p className="text-gray-500 mb-4">Complete the regular season to unlock the post-season bracket.</p>
              <p>Current Week: {summary.currentWeekIndex + 1} / 12</p>
          </div>
      );
  }

  return (
    <div className="flex-col gap-4">
      {/* Header controls */}
      <div className="card flex justify-between items-center">
        <div>
            <h2 className="m-0">NCAA Tournament</h2>
            <div className="text-sm text-gray-500 mt-1">
                {isComplete
                  ? `${summary.year} Season Complete`
                  : `Current Round: ${playoffState ? ROUND_LABELS[playoffState.currentRound] : 'Selection Pending'}`}
            </div>
        </div>

        <div className="flex gap-2">
            {canStart && (
                <button className="btn btn-primary" onClick={() => dispatch(startPlayoffs())}>
                    Initialize Bracket
                </button>
            )}
            {canSim && (
                <button className="btn btn-primary" onClick={() => dispatch(simNextPlayoffRound())}>
                    Simulate {ROUND_LABELS[playoffState!.currentRound]}
                </button>
            )}
            {isComplete && (
                <button className="btn btn-primary" onClick={handleNewSeason}>
                    Begin New Season
                </button>
            )}
        </div>
      </div>

      {/* Champion banner — shown prominently when season is complete */}
      {isComplete && playoffState?.championTeamId && (
          <div className="card text-center" style={{ background: '#fefce8', border: '2px solid #ca8a04' }}>
              <div className="text-sm font-semibold text-yellow-700 mb-1">
                  {summary.year} National Champion
              </div>
              <div className="text-2xl font-bold">
                  {teamById.get(playoffState.championTeamId)?.schoolName} {teamById.get(playoffState.championTeamId)?.nickname}
              </div>
              {coach.selectedTeamId === playoffState.championTeamId && (
                  <div className="text-green-700 font-semibold mt-2">Your team won the championship!</div>
              )}
          </div>
      )}

      {playoffState && (
        <div className="grid2" style={{ gridTemplateColumns: '280px 1fr' }}>
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
                                // Check if team is champion
                                const isChamp = isComplete && playoffState.championTeamId === seed.teamId;
                                return (
                                    <tr key={seed.teamId} className={`border-b last:border-0 ${isChamp ? 'bg-yellow-50' : ''}`}>
                                        <td className="py-1.5 font-mono font-bold text-center">#{seed.seed}</td>
                                        <td className="py-1.5">
                                            <div className="font-semibold leading-tight">{team?.schoolName}</div>
                                            <div className="text-xs text-gray-500">{team?.nickname}</div>
                                        </td>
                                        <td className="py-1.5 text-right text-xs pr-1">
                                            {hasBye && !isComplete && <span className="text-blue-600">Bye</span>}
                                            {isChamp && <span className="text-yellow-700 font-bold">Champ</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bracket rounds */}
            <div className="flex-col gap-4">
                {(['ROUND1', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL'] as const).map((round) => {
                    const games = playoffState.rounds[round];
                    if (games.length === 0) return null;

                    return (
                        <div key={round} className="card">
                            <h3 className="text-base font-bold border-b pb-2 mb-3">{ROUND_LABELS[round]}</h3>
                            <div className="grid2 gap-3">
                                {games.map((game) => {
                                    const home = teamById.get(game.homeTeamId);
                                    const away = teamById.get(game.awayTeamId);
                                    const winnerId = game.winnerTeamId;

                                    const awayWon = winnerId === game.awayTeamId;
                                    const homeWon = winnerId === game.homeTeamId;

                                    return (
                                        <div key={game.id} className="border rounded p-3 text-sm bg-gray-50">
                                            {/* Away team row */}
                                            <div className={`flex justify-between items-center mb-1 ${awayWon ? 'font-bold text-black' : winnerId ? 'text-gray-400 line-through-gentle' : 'text-gray-700'}`}>
                                                <span>
                                                    {game.awaySeed > 0 && <span className="text-xs text-gray-400 mr-1 font-normal">#{game.awaySeed}</span>}
                                                    {away?.schoolName}
                                                </span>
                                                <span className="font-mono ml-2">
                                                    {game.result != null ? game.result.awayScore : '—'}
                                                </span>
                                            </div>
                                            {/* Home team row */}
                                            <div className={`flex justify-between items-center ${homeWon ? 'font-bold text-black' : winnerId ? 'text-gray-400' : 'text-gray-700'}`}>
                                                <span>
                                                    {game.homeSeed > 0 && <span className="text-xs text-gray-400 mr-1 font-normal">#{game.homeSeed}</span>}
                                                    {home?.schoolName}
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
