import { useState } from 'react';
import { Link } from 'react-router-dom';
import CoachStars from './CoachStars';
import type { CarouselMove, Team } from '../types/sim';

type CoachingCarouselNewsProps = {
  news: CarouselMove[];
  teams: Team[];
  userTeamId: string | null;
  /** Openings that called the user: they wait for his answer. */
  waitingTeamIds?: Set<string>;
  /** Moves shown before "Show all". */
  initialCount?: number;
};

function recordLine(move: CarouselMove): string {
  if (!move.record) return '';
  const { wins, losses, seasons, tenure = seasons } = move.record;
  const plural = (n: number) => `${n} season${n === 1 ? '' : 's'}`;
  // A coach who was in place when the league began has more seasons there than his record covers.
  return tenure > seasons
    ? ` after ${plural(tenure)} (${wins}–${losses} in the last ${seasons === 1 ? 'one' : seasons})`
    : ` after ${wins}–${losses} in ${plural(seasons)}`;
}

/**
 * The offseason's head-coaching changes, the biggest programs first: who was let go, who
 * retired, and who was hired from where.
 */
function CoachingCarouselNews({ news, teams, userTeamId, waitingTeamIds, initialCount = 8 }: CoachingCarouselNewsProps) {
  const [showAll, setShowAll] = useState(false);
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const school = (teamId: string | undefined) => {
    const team = teamId ? teamById.get(teamId) : undefined;
    return team ? <Link to={`/team/${team.id}`}>{team.schoolName}</Link> : <span>another program</span>;
  };
  // One line per program: who left and who replaced him.
  const programs = [...new Set(news.map((move) => move.teamId))]
    .sort((a, b) => (teamById.get(b)?.prestige ?? 0) - (teamById.get(a)?.prestige ?? 0) || a.localeCompare(b));
  if (programs.length === 0) {
    return <p className="text-sm text-gray-500 m-0">Every program kept its head coach.</p>;
  }
  const visible = showAll ? programs : programs.slice(0, initialCount);

  return (
    <>
      <ul className="carouselList">
        {visible.map((teamId) => {
          const left = news.find((move) => move.teamId === teamId && move.kind !== 'hired');
          const hired = news.find((move) => move.teamId === teamId && move.kind === 'hired');
          return (
            <li key={teamId} className="carouselRow">
              <strong className="carouselSchool">{school(teamId)}</strong>
              <span className="carouselMoves">
                {left && (
                  <span className="pollNick">
                    {left.coachName}{' '}
                    {left.kind === 'fired' ? 'was let go' : left.kind === 'retired' ? 'retired' : 'moved on'}
                    {recordLine(left)}.
                  </span>
                )}
                {!left && hired?.background !== 'your-staff' && (
                  <span className="pollNick">The seat opened when its coach took another job.</span>
                )}
                {hired ? (
                  <span>
                    Hired {hired.coachName} <CoachStars rating={hired.rating} />{' '}
                    <span className="pollNick">
                      {hired.background === 'head-coach' && <>from {school(hired.fromTeamId)}</>}
                      {hired.background === 'your-staff' && (
                        hired.fromTeamId === userTeamId ? 'off your staff' : <>off the {school(hired.fromTeamId)} staff</>
                      )}
                      {hired.background === 'retread' && <>who left {school(hired.fromTeamId)} this offseason</>}
                      {hired.background === 'coordinator' && 'a coordinator in his first head job'}
                    </span>
                  </span>
                ) : (
                  <span className="pollNick">
                    {waitingTeamIds?.has(teamId) ? 'Waiting on your answer. It hires when the next season begins.' : 'Hires when the next season begins.'}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {programs.length > initialCount && (
        <button type="button" className="textButton text-xs mt-1" onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Show fewer' : `Show all ${programs.length} programs`}
        </button>
      )}
    </>
  );
}

export default CoachingCarouselNews;
