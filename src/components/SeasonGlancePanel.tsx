import { Link } from 'react-router-dom';
import type { SeasonGlance } from '../sim/seasonGlance';
import type { Team, TeamRecord } from '../types/sim';

type SeasonGlancePanelProps = {
  glance: SeasonGlance;
  teams: Team[];
  userTeamId: string;
  conferenceName: string | null;
  /** The user's conference in standings order. */
  standings: { team: Team; record: TeamRecord | undefined }[];
};

/** Your season on one card: every result, what is next, the splits, and the conference race. */
function SeasonGlancePanel({ glance, teams, userTeamId, conferenceName, standings }: SeasonGlancePanelProps) {
  const name = (teamId: string) => teams.find((team) => team.id === teamId)?.schoolName ?? 'Unknown';
  const place = standings.findIndex((row) => row.team.id === userTeamId) + 1;

  return (
    <section className="card" id="season-glance" aria-labelledby="season-glance-title">
      <div className="cardHeadRow mb-3">
        <h3 id="season-glance-title" className="m-0 text-base font-bold">Season so far</h3>
        <Link to="/season/standings" className="text-sm hover:underline">Standings</Link>
      </div>
      {glance.played.length > 0 && (
        <div className="glanceSplits" aria-label="Splits">
          {glance.streak && <span className={`glanceStreak ${glance.streak.startsWith('W') ? 'glanceStreak-win' : 'glanceStreak-loss'}`}>{glance.streak}</span>}
          <span>Home {glance.home}</span>
          <span>Road {glance.road}</span>
          <span>Conference {glance.conference}</span>
        </div>
      )}
      <div className="wireGrid">
        <div>
          {glance.played.length > 0 ? (
            <ol className="glanceResults" aria-label="Results">
              {glance.played.map((game) => (
                <li key={game.gameId}>
                  <Link
                    to={`/season/week/${game.weekIndex}`}
                    className={`glanceResult ${game.result!.won ? 'glanceResult-win' : 'glanceResult-loss'}`}
                    title={`Week ${game.weekIndex + 1}: ${game.result!.won ? 'beat' : 'lost to'} ${name(game.opponentId)} ${game.result!.userScore}–${game.result!.opponentScore}`}
                  >
                    <span className="glanceResultMark">{game.result!.won ? 'W' : 'L'}</span>
                    <span className="glanceResultScore">{game.result!.userScore}–{game.result!.opponentScore}</span>
                    <span className="glanceResultOpp">{game.home ? 'vs' : 'at'} {name(game.opponentId)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-500 m-0">No games played yet.</p>
          )}
          {glance.upcoming.length > 0 && (
            <>
              <div className="planReadoutLabel mt-3">Up next</div>
              <ul className="wireMini">
                {glance.upcoming.map((game) => (
                  <li key={game.gameId}>
                    <span className="text-gray-500">Wk {game.weekIndex + 1}</span>{' '}
                    {game.home ? 'vs' : 'at'}{' '}
                    <Link to={`/team/${game.opponentId}`}>
                      {game.opponentRank != null ? `No. ${game.opponentRank} ` : ''}{name(game.opponentId)}
                    </Link>{' '}
                    <span className="text-gray-500">({game.opponentRecord}{game.conference ? ', conference' : ''})</span>
                    {game.rivalryTrophy && <span className="rivalryTag">{game.rivalryTrophy}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {standings.length > 0 && (
          <div>
            <div className="planReadoutLabel">{conferenceName ?? 'Your conference'}{place > 0 ? ` · you are ${place}${ordinal(place)}` : ''}</div>
            <table className="glanceStandings">
              <caption className="sr-only">{conferenceName ?? 'Conference'} standings</caption>
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Place</span></th>
                  <th scope="col">Team</th>
                  <th scope="col">Conf</th>
                  <th scope="col">All</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, index) => (
                  <tr key={row.team.id} className={row.team.id === userTeamId ? 'youRow' : undefined}>
                    <td className="text-gray-500">{index + 1}</td>
                    <td><Link to={`/team/${row.team.id}`}>{row.team.schoolName}</Link></td>
                    <td className="tabular">{row.record?.confWins ?? 0}–{row.record?.confLosses ?? 0}</td>
                    <td className="tabular">{row.record?.wins ?? 0}–{row.record?.losses ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mt-2 mb-0">The top four play the conference championship after week 12.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ordinal(value: number): string {
  if (value % 100 >= 11 && value % 100 <= 13) return 'th';
  return value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th';
}

export default SeasonGlancePanel;
