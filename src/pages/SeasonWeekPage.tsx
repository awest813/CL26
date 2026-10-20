import { Fragment, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useNavigate } from 'react-router-dom';
import TeamLogo from '../components/TeamLogo';
import { selectWeekGames } from '../features/season/seasonSlice';
import { useAppSelector } from '../store/hooks';
import { GameResult, PlayerGameStats } from '../types/sim';
import { buildGameRecap, gameResultToSummary } from '../sim/gameRecap';

function statBits(player: PlayerGameStats): string {
  const parts: string[] = [];
  if (player.goals > 0) parts.push(`${player.goals}G`);
  if (player.assists > 0) parts.push(`${player.assists}A`);
  if (player.saves > 0) parts.push(`${player.saves} SV`);
  return parts.join(' ');
}

function topPerformerLine(players: PlayerGameStats[]): string {
  return players
    .slice(0, 2)
    .map((player) => {
      const stats = statBits(player);
      return stats ? `${player.name} ${stats}` : player.name;
    })
    .join(' · ');
}

function UserGameCard({
  result,
  selectedTeamId,
  teamById,
}: {
  result: GameResult;
  selectedTeamId: string;
  teamById: Map<string, { id: string; schoolName: string; nickname: string }>;
}) {
  const isTeamA = result.teamAId === selectedTeamId;
  const userScore = isTeamA ? result.scoreA : result.scoreB;
  const oppScore = isTeamA ? result.scoreB : result.scoreA;
  const opponentId = isTeamA ? result.teamBId : result.teamAId;
  const won = userScore > oppScore;
  const user = teamById.get(selectedTeamId);
  const opponent = teamById.get(opponentId);
  const userStats = isTeamA ? result.statsA : result.statsB;
  const opponentStats = isTeamA ? result.statsB : result.statsA;
  const topPerformers = isTeamA ? result.topPlayersA : result.topPlayersB;
  const away = teamById.get(result.teamBId);
  const home = teamById.get(result.teamAId);
  const recap = buildGameRecap(
    gameResultToSummary(result),
    away?.schoolName ?? 'Away',
    home?.schoolName ?? 'Home',
  );
  const mvpBits = recap.mvp ? statBits(recap.mvp) : '';

  return (
    <section className={`card matchupBoard resultBoard ${won ? 'resultBoard-win' : 'resultBoard-loss'}`} aria-label={won ? 'Win' : 'Loss'}>
      <div className="matchupBoardTop">
        <h3 className="m-0 text-base font-bold">Your result</h3>
        <p className={`matchupKicker ${won ? '' : 'resultKicker-loss'}`}>{won ? 'Win' : 'Loss'}</p>
      </div>
      <div className="matchupSides">
        <div className="matchupSide">
          <div className="matchupIdentity">
            {user && <TeamLogo team={user} />}
            <div>
              <span className="matchupSchool">{user?.schoolName ?? 'Your program'}</span>
              {user?.nickname && <span className="matchupNick">{user.nickname}</span>}
            </div>
          </div>
        </div>
        <div className="matchupProb">
          <span className={`matchupProbValue ${won ? 'matchup-strong' : 'matchup-underdog'}`}>{userScore}–{oppScore}</span>
          <span className="matchupProbLabel">Final</span>
        </div>
        <div className="matchupSide matchupSide-away">
          <div className="matchupIdentity">
            {opponent && <TeamLogo team={opponent} />}
            <div>
              {opponent ? (
                <Link to={`/team/${opponent.id}`} className="matchupSchool">{opponent.schoolName}</Link>
              ) : (
                <span className="matchupSchool">Opponent</span>
              )}
              {opponent?.nickname && <span className="matchupNick">{opponent.nickname}</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="statStrip">
        <div><span>Shots</span><strong>{userStats.shots}–{opponentStats.shots}</strong></div>
        <div><span>Saves</span><strong>{userStats.saves}–{opponentStats.saves}</strong></div>
        <div><span>Ground balls</span><strong>{userStats.groundBalls}–{opponentStats.groundBalls}</strong></div>
        <div><span>Turnovers</span><strong>{userStats.turnovers}–{opponentStats.turnovers}</strong></div>
      </div>
      <p className="resultLine">{recap.summary}</p>
      <p className="resultLine">{recap.keyEdge}</p>
      {(topPerformers.length > 0 || recap.mvp) && (
        <p className="resultLine">
          Led by{' '}
          <strong>
            {topPerformers.length > 0
              ? topPerformers.slice(0, 2).map((player) => {
                const bits = statBits(player);
                return bits ? `${player.name} ${bits}` : player.name;
              }).join(' · ')
              : `${recap.mvp?.name ?? ''}${mvpBits ? ` ${mvpBits}` : ''}`}
          </strong>
        </p>
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

  // Derived state for filtered games
  const displayedGames = useMemo(() => {
      const games = rows.filter(({ game }) => {
          if (conferenceFilter === 'ALL') return true;
          const home = teamById.get(game.homeTeamId);
          const away = teamById.get(game.awayTeamId);
          return home?.conferenceId === conferenceFilter || away?.conferenceId === conferenceFilter;
      });

      return games.sort((a, b) => {
          const aUser = Boolean(selectedTeamId) && (a.game.homeTeamId === selectedTeamId || a.game.awayTeamId === selectedTeamId);
          const bUser = Boolean(selectedTeamId) && (b.game.homeTeamId === selectedTeamId || b.game.awayTeamId === selectedTeamId);
          if (aUser !== bUser) return aUser ? -1 : 1;
          if (sortBy === 'score') {
             const aScore = (a.result?.scoreA ?? 0) + (a.result?.scoreB ?? 0);
             const bScore = (b.result?.scoreA ?? 0) + (b.result?.scoreB ?? 0);
             return bScore - aScore;
          }
          const aName = teamById.get(a.game.homeTeamId)?.schoolName ?? '';
          const bName = teamById.get(b.game.homeTeamId)?.schoolName ?? '';
          return aName.localeCompare(bName);
      });
  }, [rows, conferenceFilter, sortBy, teamById, selectedTeamId]);

  const userGameResult = useMemo(() => {
    if (!selectedTeamId) return null;
    return rows.find(
      ({ result }) => result && (result.teamAId === selectedTeamId || result.teamBId === selectedTeamId),
    )?.result ?? null;
  }, [rows, selectedTeamId]);

  if (totalWeeks === 0) {
    return (
      <div className="pageStack">
        <div className="pageHeader">
          <h2>Week Results</h2>
          <p className="pageHeader-sub">Browse scores, team stats, and top performers from each matchup.</p>
        </div>
        <div className="card text-center py-8">
          <h3 className="m-0">No schedule yet</h3>
          <p className="text-gray-500 mb-4">
            Begin the season from the Season Dashboard to generate the 12-week schedule and unlock week-by-week results.
          </p>
          <Link to="/season" className="btn btn-primary inline-block">
            Season Dashboard →
          </Link>
        </div>
      </div>
    );
  }

  if (weekIndex !== String(displayWeek)) {
    return <Navigate to={`/season/week/${displayWeek}`} replace />;
  }

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h2>Week {displayWeek + 1} Schedule</h2>
        <p className="pageHeader-sub">Browse results, team stats, and top performers from each matchup.</p>
      </div>

      <div className="card seasonWeekControlCard">
        <div className="seasonWeekNavGroup">
          <button
            type="button"
            className="btn"
            disabled={displayWeek <= 0}
            onClick={() => navigate(`/season/week/${displayWeek - 1}`)}
            aria-label="View previous week"
          >
            &larr;
          </button>
          <p className="seasonWeekNavLabel">Week {displayWeek + 1}</p>
          <button
            type="button"
            className="btn"
            disabled={displayWeek >= maxWeekIndex}
            onClick={() => navigate(`/season/week/${displayWeek + 1}`)}
            aria-label="View next week"
          >
            &rarr;
          </button>
        </div>

        <div className="seasonWeekFilterGroup">
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

          <label className="seasonFilter">
            <span>Sort</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'alpha' | 'score')}>
              <option value="alpha">Home A–Z</option>
              <option value="score">Highest score</option>
            </select>
          </label>
        </div>
      </div>

      {selectedTeamId && userGameResult && (
        <UserGameCard result={userGameResult} selectedTeamId={selectedTeamId} teamById={teamById} />
      )}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 border-b">
                <tr>
                  <th scope="col" className="p-2 text-right w-1/4">Away</th>
                  <th scope="col" className="p-2 text-center w-20">Score</th>
                  <th scope="col" className="p-2 text-left w-1/4">Home</th>
                  <th scope="col" className="p-2 text-center text-xs">Shots</th>
                  <th scope="col" className="p-2 text-center text-xs">TO</th>
                  <th scope="col" className="p-2 text-center text-xs">FO%</th>
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
                      <tr className={`seasonWeekGameRow ${selectedTeamId && (game.homeTeamId === selectedTeamId || game.awayTeamId === selectedTeamId) ? 'youRow' : ''}`}>
                        <td className={`p-2 ${awayScore > homeScore ? 'font-bold' : ''}`}>
                            <div className="seasonIdentity seasonIdentity-away">
                              {away && <TeamLogo team={away} size="sm" />}
                              <div>
                                {away ? <Link to={`/team/${away.id}`}>{away.schoolName}</Link> : 'Away'}
                                <span className="pollNick">
                                  {away?.nickname}
                                  {game.awayTeamId === selectedTeamId && <span className="youMark"> (You)</span>}
                                </span>
                              </div>
                            </div>
                        </td>
                        <td className="p-2 text-center">
                            <button
                              type="button"
                              disabled={!isFinal}
                              className="seasonScoreButton"
                              onClick={() => setExpandedGameId(expandedGameId === game.id ? null : game.id)}
                              aria-expanded={expandedGameId === game.id}
                              aria-label={isFinal ? `Toggle details for ${away?.schoolName} at ${home?.schoolName}` : `${away?.schoolName} at ${home?.schoolName}, not played`}
                            >
                              {isFinal ? `${awayScore}–${homeScore}` : 'vs'}
                            </button>
                        </td>
                        <td className={`p-2 ${homeScore > awayScore ? 'font-bold' : ''}`}>
                            <div className="seasonIdentity">
                              {home && <TeamLogo team={home} size="sm" />}
                              <div>
                                {home ? <Link to={`/team/${home.id}`}>{home.schoolName}</Link> : 'Home'}
                                <span className="pollNick">
                                  {home?.nickname}
                                  {game.homeTeamId === selectedTeamId && <span className="youMark"> (You)</span>}
                                </span>
                              </div>
                            </div>
                        </td>
                        <td className="p-2 text-center text-xs text-gray-600 tabular">
                            {isFinal ? `${result.statsB.shots}–${result.statsA.shots}` : '–'}
                        </td>
                        <td className="p-2 text-center text-xs text-gray-600 tabular">
                            {isFinal ? `${result.statsB.turnovers}–${result.statsA.turnovers}` : '–'}
                        </td>
                        <td className="p-2 text-center text-xs text-gray-600 tabular">
                            {isFinal ? `${result.statsB.faceoffPct}%–${result.statsA.faceoffPct}%` : '–'}
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
                            {(() => {
                              const awayLabel = away ? `${away.schoolName} ${away.nickname}` : 'Away';
                              const homeLabel = home ? `${home.schoolName} ${home.nickname}` : 'Home';
                              const recap = buildGameRecap(gameResultToSummary(result), awayLabel, homeLabel);
                              return (
                                <>
                                  <div className="font-semibold text-gray-700 mb-1">{recap.summary}</div>
                                  <div className="text-gray-500 mb-2">{recap.keyEdge} · {recap.efficiencyNote}</div>
                                </>
                              );
                            })()}
                            <div className="font-semibold text-gray-500 mb-2">Expanded stats are away–home.</div>
                            <div className="statStrip">
                              <div><span>Saves</span><strong>{result.statsB.saves}–{result.statsA.saves}</strong></div>
                              <div><span>Ground balls</span><strong>{result.statsB.groundBalls}–{result.statsA.groundBalls}</strong></div>
                              <div><span>Penalties</span><strong>{result.statsB.penalties}–{result.statsA.penalties}</strong></div>
                              <div><span>Caused turnovers</span><strong>{result.statsB.causedTurnovers ?? 0}–{result.statsA.causedTurnovers ?? 0}</strong></div>
                            </div>
                            {result.highlights.length > 0 && (
                              <ul className="m-0 pl-4">
                                {result.highlights.slice(0, 4).map((highlight) => (
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
