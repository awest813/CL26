import { Link } from 'react-router-dom';
import type { LeagueWire, WireKind, WireScore } from '../sim/leagueWire';
import type { Recruit, Team } from '../types/sim';

const KIND_LABEL: Record<WireKind, string> = {
  upset: 'Upset',
  showdown: 'Ranked',
  shootout: 'Shootout',
  rout: 'Rout',
  star: 'Star',
};

type LeagueWirePanelProps = {
  wire: LeagueWire;
  /** The week just played, 0-based like the week page's route. */
  weekIndex: number;
  teams: Team[];
  userTeamId: string | null;
  conferenceName: string | null;
  /** Blue-chip commits (four stars and up) from the last recruiting period. */
  blueChipCommits: { recruit: Recruit; teamId: string }[];
};

/** Around the league after a week: the headlines, poll movement, the conference, next week's games, and big commits. */
function LeagueWirePanel({ wire, weekIndex, teams, userTeamId, conferenceName, blueChipCommits }: LeagueWirePanelProps) {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const name = (teamId: string) => teamById.get(teamId)?.schoolName ?? 'Unknown';
  const teamLink = (teamId: string, rank?: number | null) => (
    <Link to={`/team/${teamId}`} className={teamId === userTeamId ? 'youMark' : undefined}>
      {rank != null ? `No. ${rank} ` : ''}{name(teamId)}
    </Link>
  );
  const scoreLine = (score: WireScore) => (
    <>
      {teamLink(score.winnerId, score.winnerRank)} {score.winnerScore}, {teamLink(score.loserId, score.loserRank)} {score.loserScore}
    </>
  );
  const hasPoll = wire.risers.length + wire.fallers.length + wire.droppedOut.length > 0;

  return (
    <section className="card" aria-labelledby="league-wire-title">
      <div className="cardHeadRow mb-3">
        <h3 id="league-wire-title" className="m-0 text-base font-bold">Around the league · Week {weekIndex + 1}</h3>
        <Link to={`/season/week/${weekIndex}`} className="text-sm hover:underline">All scores</Link>
      </div>
      <div className="wireGrid">
        <div>
          {wire.headlines.length === 0 ? (
            <p className="text-sm text-gray-500 m-0">A quiet week: the favorites held serve.</p>
          ) : (
            <ul className="wireList">
              {wire.headlines.map((item) => (
                <li key={item.id} className={`wireItem wireItem-${item.kind}${userTeamId && item.teamIds.includes(userTeamId) ? ' wireItem-you' : ''}`}>
                  <span className="wireKind">{KIND_LABEL[item.kind]}</span>
                  <div>
                    <div className="wireHeadline">{item.headline}</div>
                    <div className="wireDetail">{item.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="wireSide">
          {hasPoll && (
            <div>
              <div className="planReadoutLabel">Poll movers</div>
              <ul className="wireMini">
                {wire.risers.map((mover) => (
                  <li key={mover.teamId}>
                    <span className="wireUp">{mover.delta == null ? 'New' : `▲${mover.delta}`}</span> {teamLink(mover.teamId)} to No. {mover.rank}
                  </li>
                ))}
                {wire.fallers.map((mover) => (
                  <li key={mover.teamId}>
                    <span className="wireDown">▼{Math.abs(mover.delta ?? 0)}</span> {teamLink(mover.teamId)} to No. {mover.rank}
                  </li>
                ))}
                {wire.droppedOut.length > 0 && (
                  <li>
                    <span className="wireDown">Out</span> {wire.droppedOut.slice(0, 4).map((teamId, index) => (
                      <span key={teamId}>{index > 0 ? ', ' : ''}{teamLink(teamId)}</span>
                    ))}
                    {wire.droppedOut.length > 4 && <span className="text-gray-500"> and {wire.droppedOut.length - 4} more</span>}
                  </li>
                )}
              </ul>
            </div>
          )}
          {wire.conferenceScores.length > 0 && (
            <div>
              <div className="planReadoutLabel">{conferenceName ?? 'Your conference'}</div>
              <ul className="wireMini">
                {wire.conferenceScores.map((score) => <li key={score.gameId}>{scoreLine(score)}</li>)}
              </ul>
            </div>
          )}
          {wire.gamesToWatch.length > 0 && (
            <div>
              <div className="planReadoutLabel">Games to watch next week</div>
              <ul className="wireMini">
                {wire.gamesToWatch.map((game) => (
                  <li key={game.gameId}>
                    {teamLink(game.awayId, game.awayRank)} at {teamLink(game.homeId, game.homeRank)}
                    {game.rivalryTrophy && <span className="rivalryTag">{game.rivalryTrophy}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {blueChipCommits.length > 0 && (
            <div>
              <div className="planReadoutLabel">Recruiting wire</div>
              <ul className="wireMini">
                {blueChipCommits.slice(0, 4).map(({ recruit, teamId }) => (
                  <li key={recruit.id}>
                    <span className="text-yellow-500">{'★'.repeat(recruit.stars)}</span> {recruit.name} ({recruit.position}) to {teamLink(teamId)}
                  </li>
                ))}
                {blueChipCommits.length > 4 && <li className="text-gray-500">+{blueChipCommits.length - 4} more blue chips</li>}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default LeagueWirePanel;
