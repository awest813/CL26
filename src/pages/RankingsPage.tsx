import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import TeamLogo from '../components/TeamLogo';
import { useAppSelector } from '../store/hooks';
import { selectRankingTeams, selectTeamRecords, selectTop12Projection, selectRankTrends, selectSeasonSummary, selectTop16Rankings } from '../features/season/seasonSlice';
import { computeAllSOS, computeRankingBreakdown, RANKING_WEIGHTS } from '../sim/rankings';
import { seasonRankingsWeekLabel } from '../lib/seasonLabels';

function PollTeam({
  team,
  isUser,
  fallbackId,
}: {
  team: { id: string; schoolName: string; nickname: string } | undefined;
  isUser: boolean;
  fallbackId: string;
}) {
  if (!team) return <>{fallbackId}</>;
  return (
    <span className="pollIdentity">
      <TeamLogo team={team} size="sm" />
      <span className="pollTeam">
        <Link to={`/team/${team.id}`}>{team.schoolName}</Link>
        <span className="pollNick">
          {team.nickname}
          {isUser && <span className="youMark"> (You)</span>}
        </span>
      </span>
    </span>
  );
}

function rankDeltaDisplay(delta: number | null): ReactNode {
  if (delta === null) return <span className="text-gray-500 text-xs font-semibold" aria-label="New to rankings">NEW</span>;
  if (delta > 0) return <span className="text-green-600 text-xs font-semibold" aria-label={`Moved up ${delta} position${delta !== 1 ? 's' : ''}`}>▲{delta}</span>;
  if (delta < 0) return <span className="text-red-500 text-xs font-semibold" aria-label={`Moved down ${Math.abs(delta)} position${Math.abs(delta) !== 1 ? 's' : ''}`}>▼{Math.abs(delta)}</span>;
  return <span className="text-gray-400 text-xs" aria-label="No change">–</span>;
}

function ScoreLines({ lines, total }: { lines: [string, number][]; total: number }) {
  return (
    <div className="weightList">
      {lines.map(([label, points]) => (
        <div key={label} className="weightRow">
          <span>{label}</span>
          <span>{points.toFixed(1)}</span>
        </div>
      ))}
      <div className="weightRow weightTotal">
        <span>Total</span>
        <span>{Math.round(total)}</span>
      </div>
    </div>
  );
}

function RankingsPage() {
  const top25WithTrends = useAppSelector(selectRankTrends);
  const top12 = useAppSelector(selectTop12Projection);
  const top16 = useAppSelector(selectTop16Rankings);
  const teams = useAppSelector(selectRankingTeams);
  const prestigeDrift = useAppSelector((state) => state.coach.programPrestigeDrift ?? 0);
  const records = useAppSelector(selectTeamRecords);
  const summary = useAppSelector(selectSeasonSummary);
  const gameResults = useAppSelector((state) => state.season.gameResults);
  const selectedTeamId = useAppSelector((state) => state.coach.selectedTeamId);

  const isPostseason = summary.phase === 'PLAYOFF' || summary.phase === 'OFFSEASON';
  const weekLabel = seasonRankingsWeekLabel(summary.phase, summary.completedWeeks);

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

  // User team score breakdown (even when unranked)
  const userTeamBreakdown = useMemo(() => {
    if (!selectedTeamId) return null;
    const team = teamById.get(selectedTeamId);
    const record = records[selectedTeamId];
    if (!team || !record) return null;
    return {
      team,
      record,
      breakdown: computeRankingBreakdown(team, record, sosByTeamId[selectedTeamId] ?? 0),
      rankRow: top25WithTrends.find((r) => r.teamId === selectedTeamId) ?? null,
    };
  }, [selectedTeamId, teamById, records, sosByTeamId, top25WithTrends]);

  // "Next 4 Out" bubble teams (#13–#16)
  const bubbleTeams = useMemo(() => top16.slice(12, 16), [top16]);

  const hasGamesPlayed = useMemo(() => {
    return Object.values(records).some((record) => record.wins + record.losses > 0);
  }, [records]);

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h2>Top 25</h2>
        <p className="pageHeader-sub">
          {isPostseason
            ? `The final ${summary.year} poll and the tournament field.`
            : 'The poll and the projected 12-team field, updated after each week.'}
        </p>
      </div>

      <div className="grid2">
      <section className="card">
        <h3 className="m-0">Poll <span className="pollWeek">{weekLabel}</span></h3>
        <p className="text-sm text-gray-500 mt-1 mb-2">
          {isPostseason
            ? 'Final regular-season order.'
            : 'Record, margin, schedule, and program prestige.'}
        </p>
        {selectedTeamId && userTeamBreakdown && !userTeamBreakdown.rankRow && (
          <p className="text-sm text-gray-700 mt-0 mb-2">
            <span className="youMark">Your program</span> is outside the Top 25
            {summary.phase === 'PRE'
              ? ' on the preseason profile.'
              : ` with a poll score of ${Math.round(userTeamBreakdown.breakdown.totalPoints)}.`}
          </p>
        )}

        <div className="dataTableWrap">
        <table>
          <caption className="sr-only">Top 25 poll</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Trend</th>
              <th scope="col">Team</th>
              <th scope="col">Record</th>
              <th scope="col">Points</th>
            </tr>
          </thead>
          <tbody>
            {top25WithTrends.map((row) => {
              const team = teamById.get(row.teamId);
              const isUser = row.teamId === selectedTeamId;
              return (
                <tr key={row.teamId} className={isUser ? 'youRow' : undefined}>
                  <td className="font-mono font-bold">{row.rank}</td>
                  <td className="text-center">{rankDeltaDisplay(row.delta)}</td>
                  <td>
                    <PollTeam team={team} isUser={isUser} fallbackId={row.teamId} />
                  </td>
                  <td className="tabular">{row.record}</td>
                  <td className="tabular">{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>

      <section className="card">
        <h3 className="m-0">{isPostseason ? 'Tournament field' : 'Projected field'}</h3>
        <p className="text-sm text-gray-500 mt-1 mb-2">
          {isPostseason
            ? 'The 12 seeds for the playoff. The top four have a bye.'
            : 'The 12-team field if the season ended today. The top four would have a bye.'}
        </p>

        <div className="dataTableWrap">
        <table>
          <caption className="sr-only">Top 12 playoff projection</caption>
          <thead>
            <tr>
              <th scope="col">Seed</th>
              <th scope="col">Team</th>
              <th scope="col">Record</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {top12.map((row) => {
              const team = teamById.get(row.teamId);
              const hasBye = row.rank <= 4;
              const isUser = row.teamId === selectedTeamId;
              return (
                <tr key={row.teamId} className={isUser ? 'youRow' : undefined}>
                  <td className="font-mono font-bold">#{row.rank}</td>
                  <td>
                    <PollTeam team={team} isUser={isUser} fallbackId={row.teamId} />
                  </td>
                  <td className="tabular">{row.record}</td>
                  <td className="text-xs">
                    {hasBye && <span className="youMark">Bye</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        {!hasGamesPlayed && (
          <p className="bubbleNote">No games yet. This order is the preseason profile.</p>
        )}

        {bubbleTeams.length > 0 && (
          <div className="bubbleBlock">
            <p className="bubbleLabel">Next 4 out</p>
            <div className="dataTableWrap">
            <table className="w-full text-sm">
              <tbody>
                {bubbleTeams.map((row) => {
                  const team = teamById.get(row.teamId);
                  const isUser = row.teamId === selectedTeamId;
                  return (
                    <tr key={row.teamId} className={isUser ? 'youRow' : undefined}>
                      <td className="py-1 tabular pr-2">#{row.rank}</td>
                      <td className="py-1">
                        <PollTeam team={team} isUser={isUser} fallbackId={row.teamId} />
                      </td>
                      <td className="py-1 tabular">{row.record}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </section>

      <section className="card pollExplainer">
        <h3 className="m-0 text-base">How a team is scored</h3>
        <p className="text-sm text-gray-500 mt-2 mb-0">
          Each line is a season number times its weight. Your program’s prestige includes career drift.
          Ties on the rounded total break by wins, point differential, prestige, then school name.
        </p>
        <div className="weightList">
          {[
            ['Overall win %', RANKING_WEIGHTS.overallWinPct],
            ['Conference win %', RANKING_WEIGHTS.conferenceWinPct],
            ['Point differential', RANKING_WEIGHTS.pointDifferential],
            ['Program prestige', RANKING_WEIGHTS.prestige],
            ['Scoring volume', RANKING_WEIGHTS.scoringVolume],
            ['Strength of schedule', RANKING_WEIGHTS.strengthOfSchedule],
          ].map(([label, weight]) => (
            <div key={String(label)} className="weightRow">
              <span>{label}</span>
              <span>×{weight}</span>
            </div>
          ))}
        </div>

        <details className="scoreDetails">
          <summary>Score breakdown</summary>

          {topTeamBreakdown && (
            <div className="scoreBlock">
              <p className="scoreBlockTitle programLockup">
                <TeamLogo team={topTeamBreakdown.team} size="sm" />
                <span>
                  No. 1 · {topTeamBreakdown.team.schoolName}
                  <span className="pollNick">{topTeamBreakdown.team.nickname}</span>
                </span>
              </p>
              <ScoreLines
                lines={[
                  ['Overall win %', topTeamBreakdown.breakdown.overallWinPctPoints],
                  ['Conference win %', topTeamBreakdown.breakdown.conferenceWinPctPoints],
                  ['Point differential', topTeamBreakdown.breakdown.pointDifferentialPoints],
                  ['Prestige', topTeamBreakdown.breakdown.prestigePoints],
                  ['Scoring volume', topTeamBreakdown.breakdown.scoringVolumePoints],
                  ['Strength of schedule', topTeamBreakdown.breakdown.strengthOfSchedulePoints],
                ]}
                total={topTeamBreakdown.breakdown.totalPoints}
              />
            </div>
          )}

          {userTeamBreakdown && (
            <div className="scoreBlock">
              <p className="scoreBlockTitle programLockup">
                <TeamLogo team={userTeamBreakdown.team} size="sm" />
                <span>
                  Your program · {userTeamBreakdown.team.schoolName}
                  <span className="pollMeta">
                    {userTeamBreakdown.rankRow ? `No. ${userTeamBreakdown.rankRow.rank}` : 'Outside the Top 25'}
                  </span>
                  <span className="pollNick">{userTeamBreakdown.team.nickname}</span>
                </span>
              </p>
              {prestigeDrift !== 0 && (
                <p className="text-xs text-gray-500 mt-0 mb-2">
                  Prestige in this score includes career drift of {prestigeDrift > 0 ? '+' : ''}{prestigeDrift}.
                </p>
              )}
              <ScoreLines
                lines={[
                  ['Overall win %', userTeamBreakdown.breakdown.overallWinPctPoints],
                  ['Conference win %', userTeamBreakdown.breakdown.conferenceWinPctPoints],
                  ['Point differential', userTeamBreakdown.breakdown.pointDifferentialPoints],
                  ['Prestige', userTeamBreakdown.breakdown.prestigePoints],
                  ['Scoring volume', userTeamBreakdown.breakdown.scoringVolumePoints],
                  ['Strength of schedule', userTeamBreakdown.breakdown.strengthOfSchedulePoints],
                ]}
                total={userTeamBreakdown.breakdown.totalPoints}
              />
            </div>
          )}
        </details>
      </section>
      </div>
    </div>
  );
}

export default RankingsPage;
