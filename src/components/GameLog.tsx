import { useState } from 'react';
import { buildLineScore, leadChanges, scoringByPeriod } from '../sim/gameLog';
import type { ScoringPlay } from '../types/sim';

type GameLogProps = {
  plays: ScoringPlay[];
  highlights: string[];
  /** The engine's side A (the home side) and side B. */
  teamA: { id: string; name: string };
  teamB: { id: string; name: string };
  userTeamId: string;
};

/** The user's game: line score, how it swung, every goal by quarter, and the plays. */
function GameLog({ plays, highlights, teamA, teamB, userTeamId }: GameLogProps) {
  const [showAll, setShowAll] = useState(false);
  if (plays.length === 0 && highlights.length === 0) return null;

  const line = buildLineScore(plays, teamA.id);
  const swing = leadChanges(plays);
  const userIsA = teamA.id === userTeamId;
  const rows = [
    { team: teamA, goals: line.goalsA, total: line.totalA },
    { team: teamB, goals: line.goalsB, total: line.totalB },
  ];
  if (!userIsA) rows.reverse();
  const userLead = userIsA ? swing.largestLeadA : swing.largestLeadB;
  const oppLead = userIsA ? swing.largestLeadB : swing.largestLeadA;
  const groups = scoringByPeriod(plays);
  const shownGroups = showAll ? groups : groups.slice(-2);
  const swingParts = [
    swing.leadChanges > 0 ? `${swing.leadChanges} lead change${swing.leadChanges === 1 ? '' : 's'}` : 'No lead changes',
    swing.ties > 0 ? `tied ${swing.ties} time${swing.ties === 1 ? '' : 's'}` : null,
    userLead > 0 ? `your biggest lead ${userLead}` : null,
    oppLead > 0 ? `you trailed by as many as ${oppLead}` : null,
  ].filter(Boolean);

  return (
    <div className="gameLog">
      {plays.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="lineScore" aria-label="Line score">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Team</span></th>
                  {line.periods.map((period) => <th key={period} scope="col">{period}</th>)}
                  <th scope="col">F</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.team.id} className={row.team.id === userTeamId ? 'lineScore-you' : undefined}>
                    <th scope="row">{row.team.name}</th>
                    {row.goals.map((goals, index) => <td key={line.periods[index]}>{goals}</td>)}
                    <td className="lineScoreTotal">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="gameLogSwing">{swingParts.join(' · ')}.</p>
          <div className="gameLogHead">
            <div className="planReadoutLabel">Scoring summary</div>
            {groups.length > 2 && (
              <button type="button" className="textButton" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
                {showAll ? 'Last two periods' : `All ${plays.length} goals`}
              </button>
            )}
          </div>
          {shownGroups.map((group) => (
            <div key={group.label} className="gameLogPeriod">
              <div className="gameLogPeriodLabel">{group.label}</div>
              <ol className="gameLogGoals">
                {group.plays.map((play, index) => {
                  const mine = play.teamId === userTeamId;
                  const userScore = userIsA ? play.scoreA : play.scoreB;
                  const oppScore = userIsA ? play.scoreB : play.scoreA;
                  return (
                    <li key={`${group.label}-${index}`} className={mine ? 'gameLogGoal-you' : 'gameLogGoal-them'}>
                      <span className="gameLogClock">{play.clock}</span>
                      <span>
                        <strong>{play.scorer}</strong>
                        {play.assist ? <span className="gameLogAssist"> from {play.assist}</span> : null}
                        {play.manUp ? <span className="gameLogTag">EMO</span> : null}
                      </span>
                      <span className="gameLogScore">{userScore}–{oppScore}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </>
      )}
      {highlights.length > 0 && (
        <details className="gameLogPlays">
          <summary>Plays from the game ({highlights.length})</summary>
          <ul className="resultPlays">
            {highlights.map((play) => <li key={play}>{play}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

export default GameLog;
