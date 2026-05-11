import { useMemo } from 'react';
import { useAppSelector } from '../store/hooks';
import { selectTeamRecords, selectTop12Projection, selectRankTrends, selectSeasonSummary } from '../features/season/seasonSlice';
import { selectTeams } from '../features/league/leagueSlice';
import { computeAllSOS, computeRankingBreakdown, RANKING_WEIGHTS } from '../sim/rankings';

function rankDeltaDisplay(delta: number | null): React.ReactNode {
  if (delta === null) return <span className="text-gray-300 text-xs" aria-label="New to rankings">NEW</span>;
  if (delta > 0) return <span className="text-green-600 text-xs font-semibold" aria-label={`Moved up ${delta} position${delta !== 1 ? 's' : ''}`}>▲{delta}</span>;
  if (delta < 0) return <span className="text-red-500 text-xs font-semibold" aria-label={`Moved down ${Math.abs(delta)} position${Math.abs(delta) !== 1 ? 's' : ''}`}>▼{Math.abs(delta)}</span>;
  return <span className="text-gray-400 text-xs" aria-label="No change">–</span>;
}

function RankingsPage() {
  const top25WithTrends = useAppSelector(selectRankTrends);
  const top12 = useAppSelector(selectTop12Projection);
  const teams = useAppSelector(selectTeams);
  const records = useAppSelector(selectTeamRecords);
  const summary = useAppSelector(selectSeasonSummary);
  const gameResults = useAppSelector((state) => state.season.gameResults);

  const isPostseason = summary.phase === 'PLAYOFF' || summary.phase === 'OFFSEASON';
  const weekLabel = isPostseason
    ? 'Final'
    : summary.completedWeeks > 0
      ? `Week ${summary.completedWeeks}`
      : 'Pre-Season';

  const teamById = useMemo(() => {
    return new Map(teams.map((team) => [team.id, team]));
  }, [teams]);

  const sosByTeamId = useMemo(() => computeAllSOS(gameResults, records), [gameResults, records]);

  const topTeamBreakdown = useMemo(() => {
    const topTeamId = top25WithTrends[0]?.teamId;
    if (!topTeamId) return null;

    const team = teamById.get(topTeamId);
    const record = records[topTeamId];
    if (!team || !record) return null;

    return {
      team,
      breakdown: computeRankingBreakdown(team, record, sosByTeamId[topTeamId] ?? 0),
    };
  }, [records, teamById, top25WithTrends, sosByTeamId]);

  const hasGamesPlayed = useMemo(() => {
    return Object.values(records).some((record) => record.wins + record.losses > 0);
  }, [records]);

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h2>Rankings &amp; Polls</h2>
        <p className="pageHeader-sub">
          {isPostseason
            ? `Final ${summary.year} regular-season power rankings.`
            : 'Deterministic power ranking — updated after each simulated week.'}
        </p>
      </div>

      <div className="grid2">
      <section className="card">
        <h3 className="m-0">Top 25 <span className="text-sm font-normal text-gray-400 ml-1">{weekLabel}</span></h3>
        <p className="text-sm text-gray-500 mt-1 mb-2">
          {isPostseason
            ? 'Final regular-season power rankings.'
            : 'Deterministic power ranking based on record, point margin, and strength of schedule.'}
        </p>

        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Trend</th>
              <th>Team</th>
              <th>Record</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {top25WithTrends.map((row) => {
              const team = teamById.get(row.teamId);
              return (
                <tr key={row.teamId}>
                  <td className="font-mono font-bold">{row.rank}</td>
                  <td className="text-center">{rankDeltaDisplay(row.delta)}</td>
                  <td>
                    {team?.schoolName} <span className="text-xs text-gray-500">({team?.nickname})</span>
                  </td>
                  <td>{row.record}</td>
                  <td className="font-mono">{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3 className="m-0">{isPostseason ? 'Tournament Field' : 'Playoff Projection'} <span className="text-sm font-normal text-gray-400 ml-1">Top 12</span></h3>
        <p className="text-sm text-gray-500 mt-1 mb-2">
          {isPostseason
            ? 'Final seeding used for the NCAA Tournament.'
            : 'If the season ended today, this would be the projected 12-team field.'}
        </p>

        <table>
          <thead>
            <tr>
              <th>Seed</th>
              <th>Team</th>
              <th>Record</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {top12.map((row) => {
              const team = teamById.get(row.teamId);
              const hasBye = row.rank <= 4;
              return (
                <tr key={row.teamId}>
                  <td className="font-mono font-bold">#{row.rank}</td>
                  <td>
                    {team?.schoolName} <span className="text-xs text-gray-500">({team?.nickname})</span>
                  </td>
                  <td>{row.record}</td>
                  <td className="text-xs">
                    {hasBye && <span className="text-blue-600 font-semibold">Bye</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!hasGamesPlayed && (
          <p className="text-sm text-gray-500" style={{ marginTop: '0.75rem' }}>
            No games played yet. Rankings reflect baseline program profile scoring.
          </p>
        )}
      </section>

      <section className="card" style={{ gridColumn: '1 / -1' }}>
        <h3 className="m-0 mb-2">Ranking Formula</h3>
        <p className="text-sm text-gray-500">
          Scores are deterministic — built from season performance plus a baseline program prestige signal.
        </p>
        <div className="grid2" style={{ marginTop: '0.75rem', gap: '0.5rem' }}>
          {[
            ['Overall win %', RANKING_WEIGHTS.overallWinPct],
            ['Conference win %', RANKING_WEIGHTS.conferenceWinPct],
            ['Point differential', RANKING_WEIGHTS.pointDifferential],
            ['Program prestige', RANKING_WEIGHTS.prestige],
            ['Scoring volume', RANKING_WEIGHTS.scoringVolume],
            ['Strength of schedule', RANKING_WEIGHTS.strengthOfSchedule],
          ].map(([label, weight]) => (
            <div key={String(label)} className="flex justify-between text-sm border-b py-1">
              <span className="text-gray-600">{label}</span>
              <span className="font-mono font-semibold">×{weight}</span>
            </div>
          ))}
        </div>

        {topTeamBreakdown && (
          <div style={{ marginTop: '1rem' }}>
            <p className="text-sm font-semibold m-0 mb-1">
              Current #1 score breakdown — {topTeamBreakdown.team.schoolName} ({topTeamBreakdown.team.nickname})
            </p>
            <div className="grid2" style={{ gap: '0.5rem' }}>
              {[
                ['Overall win %', topTeamBreakdown.breakdown.overallWinPctPoints],
                ['Conference win %', topTeamBreakdown.breakdown.conferenceWinPctPoints],
                ['Point differential', topTeamBreakdown.breakdown.pointDifferentialPoints],
                ['Prestige', topTeamBreakdown.breakdown.prestigePoints],
                ['Scoring volume', topTeamBreakdown.breakdown.scoringVolumePoints],
                ['Strength of schedule', topTeamBreakdown.breakdown.strengthOfSchedulePoints],
              ].map(([label, pts]) => (
                <div key={String(label)} className="flex justify-between text-sm border-b py-1">
                  <span className="text-gray-600">{label}</span>
                  <span className="font-mono font-semibold">{Number(pts).toFixed(1)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm py-1 border-t font-bold" style={{ gridColumn: '1/-1' }}>
                <span>Total</span>
                <span className="font-mono">{Math.round(topTeamBreakdown.breakdown.totalPoints)}</span>
              </div>
            </div>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

export default RankingsPage;
