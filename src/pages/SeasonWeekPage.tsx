import { Fragment, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { selectWeekGames } from '../features/season/seasonSlice';
import { useAppSelector } from '../store/hooks';
import { GameResult, PlayerGameStats } from '../types/sim';

function topPerformerLine(players: PlayerGameStats[]): string {
  return players
    .slice(0, 2)
    .map((p) => {
      const parts: string[] = [];
      if (p.goals > 0) parts.push(`${p.goals}g`);
      if (p.assists > 0) parts.push(`${p.assists}a`);
      if (p.saves > 0) parts.push(`${p.saves}sv`);
      const stats = parts.join(' ');
      return `${p.name} (${p.position}${stats ? `: ${stats}` : ''})`;
    })
    .join(' · ');
}

function playerStatLine(player: PlayerGameStats): string {
  const parts: string[] = [];
  if (player.goals > 0) parts.push(`${player.goals}g`);
  if (player.assists > 0) parts.push(`${player.assists}a`);
  if (player.saves > 0) parts.push(`${player.saves}sv`);
  const stats = parts.length > 0 ? `: ${parts.join(' ')}` : '';
  return `${player.name} (${player.position}${stats})`;
}

function UserGameCard({
  result,
  selectedTeamId,
  teamNameById,
}: {
  result: GameResult;
  selectedTeamId: string;
  teamNameById: Map<string, string>;
}) {
  const isTeamA = result.teamAId === selectedTeamId;
  const userScore = isTeamA ? result.scoreA : result.scoreB;
  const oppScore = isTeamA ? result.scoreB : result.scoreA;
  const opponentId = isTeamA ? result.teamBId : result.teamAId;
  const won = userScore > oppScore;
  const userStats = isTeamA ? result.statsA : result.statsB;
  const opponentStats = isTeamA ? result.statsB : result.statsA;
  const topPerformers = [...(isTeamA ? result.topPlayersA : result.topPlayersB)];

  return (
    <section className="card" style={{ borderLeft: `4px solid ${won ? '#16a34a' : '#ef4444'}` }}>
      <div className="flex justify-between items-start gap-3">
        <div>
          <div className="text-xs text-gray-500 uppercase font-semibold">Your Game</div>
          <h3 className="m-0 mt-1">
            {won ? 'Win' : 'Loss'} vs {teamNameById.get(opponentId) ?? 'Opponent'}
          </h3>
          <div className="text-2xl font-bold mt-1">
            {userScore} <span className="text-gray-400">–</span> {oppScore}
          </div>
        </div>
        <span className={won ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{won ? 'WIN' : 'LOSS'}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mt-3 pt-3 border-t">
        <div><span className="text-gray-400 text-xs block">Shots</span>{userStats.shots}–{opponentStats.shots}</div>
        <div><span className="text-gray-400 text-xs block">Saves</span>{userStats.saves}–{opponentStats.saves}</div>
        <div><span className="text-gray-400 text-xs block">Ground Balls</span>{userStats.groundBalls}–{opponentStats.groundBalls}</div>
        <div><span className="text-gray-400 text-xs block">Turnovers</span>{userStats.turnovers}–{opponentStats.turnovers}</div>
      </div>
      {topPerformers.length > 0 && (
        <div className="text-sm text-gray-600 mt-3">
          <span className="font-semibold">Your top performers: </span>
          {topPerformers.map(playerStatLine).join(' · ')}
        </div>
      )}
    </section>
  );
}

function SeasonWeekPage() {
  const { weekIndex } = useParams();
  const navigate = useNavigate();
  const totalWeeks = useAppSelector((state) => state.season.scheduleByWeek.length);

  // Ensure we parse weekIndex safely and clamp against actual schedule length.
  const parsedWeek = Number(weekIndex ?? 0);
  const maxWeekIndex = Math.max(totalWeeks - 1, 0);
  const requestedWeek = Number.isNaN(parsedWeek) ? 0 : Math.floor(parsedWeek);
  const displayWeek = Math.max(0, Math.min(maxWeekIndex, requestedWeek));

  // Selector for games
  const selector = useMemo(() => selectWeekGames(displayWeek), [displayWeek]);
  const rows = useAppSelector(selector);

  const teams = useAppSelector((state) => state.league.teams);
  const conferences = useAppSelector((state) => state.league.conferences);
  const selectedTeamId = useAppSelector((state) => state.coach.selectedTeamId);
  const [conferenceFilter, setConferenceFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'alpha' | 'score'>('alpha');
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);

  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const teamNameById = useMemo(() => new Map(teams.map((team) => [team.id, `${team.schoolName} ${team.nickname}`])), [teams]);

  // Derived state for filtered games
  const displayedGames = useMemo(() => {
      const games = rows.filter(({ game }) => {
          if (conferenceFilter === 'ALL') return true;
          const home = teamById.get(game.homeTeamId);
          const away = teamById.get(game.awayTeamId);
          return home?.conferenceId === conferenceFilter || away?.conferenceId === conferenceFilter;
      });

      return games.sort((a, b) => {
          if (sortBy === 'score') {
             // Total score sort (descending)
             const aScore = (a.result?.scoreA ?? 0) + (a.result?.scoreB ?? 0);
             const bScore = (b.result?.scoreA ?? 0) + (b.result?.scoreB ?? 0);
             return bScore - aScore;
          }
          // Alpha sort by Home Team Name
          const aName = teamById.get(a.game.homeTeamId)?.schoolName ?? '';
          const bName = teamById.get(b.game.homeTeamId)?.schoolName ?? '';
          return aName.localeCompare(bName);
      });
  }, [rows, conferenceFilter, sortBy, teamById]);

  const userGameResult = useMemo(() => {
    if (!selectedTeamId) return null;
    return rows.find(
      ({ result }) => result && (result.teamAId === selectedTeamId || result.teamBId === selectedTeamId),
    )?.result ?? null;
  }, [rows, selectedTeamId]);

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h2>Week {displayWeek + 1} Schedule</h2>
        <p className="pageHeader-sub">Browse results, team stats, and top performers from each matchup.</p>
      </div>

      <div className="card seasonWeekControlCard">
        <div className="seasonWeekNavGroup">
          <button
            className="btn"
            disabled={displayWeek <= 0}
            onClick={() => navigate(`/season/week/${displayWeek - 1}`)}
            aria-label="View previous week"
          >
            &larr;
          </button>
          <p className="seasonWeekNavLabel">Week {displayWeek + 1}</p>
          <button
            className="btn"
            disabled={displayWeek >= maxWeekIndex}
            onClick={() => navigate(`/season/week/${displayWeek + 1}`)}
            aria-label="View next week"
          >
            &rarr;
          </button>
        </div>

        <div className="seasonWeekFilterGroup">
          <select value={conferenceFilter} onChange={(e) => setConferenceFilter(e.target.value)} className="p-1 text-sm border rounded">
            <option value="ALL">All Conferences</option>
            {conferences.map((conf) => (
              <option key={conf.id} value={conf.id}>
                {conf.name}
              </option>
            ))}
          </select>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'alpha' | 'score')} className="p-1 text-sm border rounded">
            <option value="alpha">Sort: Home A-Z</option>
            <option value="score">Sort: High Score</option>
          </select>
        </div>
      </div>

      <p className="m-0 text-sm text-gray-600">
        Showing {displayedGames.length} game{displayedGames.length === 1 ? '' : 's'} in week {displayWeek + 1}.
      </p>

      {selectedTeamId && userGameResult && (
        <UserGameCard result={userGameResult} selectedTeamId={selectedTeamId} teamNameById={teamNameById} />
      )}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 border-b">
                <tr>
                  <th className="p-2 text-right w-1/4">Away</th>
                  <th className="p-2 text-center w-20">Score</th>
                  <th className="p-2 text-left w-1/4">Home</th>
                  <th className="p-2 text-center text-xs">Shots</th>
                  <th className="p-2 text-center text-xs">TO</th>
                  <th className="p-2 text-center text-xs">FO%</th>
                </tr>
              </thead>
              <tbody>
                {displayedGames.map(({ game, result }) => {
                  const away = teamById.get(game.awayTeamId);
                  const home = teamById.get(game.homeTeamId);
                  const awayScore = result?.scoreB ?? 0;
                  const homeScore = result?.scoreA ?? 0;
                  const isFinal = !!result;
                  const awayPerformers = result?.topPlayersB ?? [];
                  const homePerformers = result?.topPlayersA ?? [];
                  const allPerformers = [...awayPerformers, ...homePerformers];

                  return (
                    <Fragment key={game.id}>
                      <tr className="seasonWeekGameRow">
                        <td className={`p-2 text-right ${awayScore > homeScore ? 'font-bold' : ''}`}>
                            {away?.schoolName} <span className="text-xs text-gray-500 font-normal">({away?.nickname})</span>
                        </td>
                        <td className="p-2 text-center font-mono font-bold bg-gray-50">
                            <button
                              type="button"
                              disabled={!isFinal}
                              className="font-mono font-bold"
                              style={{ background: 'transparent', border: 0, cursor: isFinal ? 'pointer' : 'default' }}
                              onClick={() => setExpandedGameId(expandedGameId === game.id ? null : game.id)}
                              aria-expanded={expandedGameId === game.id}
                              aria-label={isFinal ? `Toggle details for ${away?.schoolName} at ${home?.schoolName}` : undefined}
                            >
                              {isFinal ? `${awayScore} - ${homeScore}` : 'vs'}
                            </button>
                        </td>
                        <td className={`p-2 text-left ${homeScore > awayScore ? 'font-bold' : ''}`}>
                            {home?.schoolName} <span className="text-xs text-gray-500 font-normal">({home?.nickname})</span>
                        </td>
                        <td className="p-2 text-center text-xs text-gray-600">
                            {isFinal ? `${result.statsB.shots} - ${result.statsA.shots}` : '-'}
                        </td>
                        <td className="p-2 text-center text-xs text-gray-600">
                            {isFinal ? `${result.statsB.turnovers} - ${result.statsA.turnovers}` : '-'}
                        </td>
                        <td className="p-2 text-center text-xs text-gray-600">
                            {isFinal ? `${result.statsB.faceoffPct}% - ${result.statsA.faceoffPct}%` : '-'}
                        </td>
                      </tr>
                      {isFinal && allPerformers.length > 0 && (
                        <tr className="seasonWeekPerformerRow">
                          <td colSpan={6} className="px-3 py-1 text-xs text-gray-500">
                            <span className="font-semibold text-gray-600">Top performers: </span>
                            {topPerformerLine(allPerformers)}
                          </td>
                        </tr>
                      )}
                      {isFinal && expandedGameId === game.id && (
                        <tr className="seasonWeekDetailRow">
                          <td colSpan={6} className="px-3 py-2 text-xs text-gray-600 bg-gray-50">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
                              <div><span className="text-gray-400 block">Saves</span>{result.statsB.saves} - {result.statsA.saves}</div>
                              <div><span className="text-gray-400 block">Ground Balls</span>{result.statsB.groundBalls} - {result.statsA.groundBalls}</div>
                              <div><span className="text-gray-400 block">Penalties</span>{result.statsB.penalties} - {result.statsA.penalties}</div>
                              <div><span className="text-gray-400 block">Caused TO</span>{result.statsB.causedTurnovers ?? 0} - {result.statsA.causedTurnovers ?? 0}</div>
                            </div>
                            {result.highlights.length > 0 && (
                              <ul className="m-0 pl-4">
                                {result.highlights.slice(0, 2).map((highlight) => (
                                  <li key={highlight}>{highlight}</li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {displayedGames.length === 0 && (
                    <tr>
                        <td colSpan={6} className="p-4 text-center text-gray-500">No games found.</td>
                    </tr>
                )}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}

export default SeasonWeekPage;
