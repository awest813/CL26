import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import TeamLogo from '../components/TeamLogo';
import { useAppSelector } from '../store/hooks';
import { selectConferenceLeaders, selectFirstFourOut, selectPollInputs, selectRankingTeams, selectTeamRecords, selectTop12Projection, selectRankTrends, selectSeasonSummary } from '../features/season/seasonSlice';
import { selectConferences } from '../features/league/leagueSlice';
import { BAD_LOSS_PENALTY, computeRankingBreakdown, HEAD_TO_HEAD_WINDOW, MARGIN_CAP_PER_GAME, PRESTIGE_FADE_GAMES, QUALITY_WIN_TIERS, RANKING_WEIGHTS, teamPollInputs } from '../sim/rankings';
import { PLAYOFF_AUTO_BIDS } from '../sim/playoffs';
import type { RankingScoreBreakdown } from '../types/sim';
import { seasonRankingsWeekLabel } from '../lib/seasonLabels';
import PageHeader from '../components/PageHeader';

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

function breakdownLines(breakdown: RankingScoreBreakdown): [string, number][] {
  return [
    ['Overall win %', breakdown.overallWinPctPoints],
    ['Conference win %', breakdown.conferenceWinPctPoints],
    ['Margin (capped)', breakdown.pointDifferentialPoints],
    ['Prestige', breakdown.prestigePoints],
    ['Strength of schedule', breakdown.strengthOfSchedulePoints],
    ['Quality wins and bad losses', breakdown.qualityResultPoints],
  ];
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
  const bubbleTeams = useAppSelector(selectFirstFourOut);
  const pollInputs = useAppSelector(selectPollInputs);
  const leaders = useAppSelector(selectConferenceLeaders);
  const conferences = useAppSelector(selectConferences);
  const teams = useAppSelector(selectRankingTeams);
  const prestigeDrift = useAppSelector((state) => state.coach.programPrestigeDrift ?? 0);
  const records = useAppSelector(selectTeamRecords);
  const summary = useAppSelector(selectSeasonSummary);
  const selectedTeamId = useAppSelector((state) => state.coach.selectedTeamId);

  const isPostseason = summary.phase === 'PLAYOFF' || summary.phase === 'OFFSEASON';
  const weekLabel = seasonRankingsWeekLabel(summary.phase, summary.completedWeeks);

  const teamById = useMemo(() => {
    return new Map(teams.map((team) => [team.id, team]));
  }, [teams]);

  const conferenceNameByLeader = useMemo(() => {
    const nameById = new Map(conferences.map((conference) => [conference.id, conference.name]));
    return new Map(Object.entries(leaders).map(([conferenceId, teamId]) => [teamId, nameById.get(conferenceId) ?? conferenceId]));
  }, [conferences, leaders]);

  const topTeamBreakdown = useMemo(() => {
    const topTeamId = top25WithTrends[0]?.teamId;
    if (!topTeamId) return null;

    const team = teamById.get(topTeamId);
    const record = records[topTeamId];
    if (!team || !record) return null;

    return {
      team,
      breakdown: computeRankingBreakdown(team, record, teamPollInputs(pollInputs, topTeamId)),
    };
  }, [records, teamById, top25WithTrends, pollInputs]);

  // User team score breakdown (even when unranked)
  const userTeamBreakdown = useMemo(() => {
    if (!selectedTeamId) return null;
    const team = teamById.get(selectedTeamId);
    const record = records[selectedTeamId];
    if (!team || !record) return null;
    return {
      team,
      record,
      breakdown: computeRankingBreakdown(team, record, teamPollInputs(pollInputs, selectedTeamId)),
      rankRow: top25WithTrends.find((r) => r.teamId === selectedTeamId) ?? null,
    };
  }, [selectedTeamId, teamById, records, pollInputs, top25WithTrends]);

  const hasGamesPlayed = useMemo(() => {
    return Object.values(records).some((record) => record.wins + record.losses > 0);
  }, [records]);

  return (
    <div className="pageStack">
      <PageHeader
        eyebrow="Season"
        title="Top 25"
        subtitle={isPostseason
          ? `The final ${summary.year} poll and the tournament field.`
          : 'The poll and the projected 12-team field, updated after each week.'}
      />

      <div className="grid2 grid2-poll">
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
              <th scope="col" className="num">Rank</th>
              <th scope="col" className="text-center">Trend</th>
              <th scope="col">Team</th>
              <th scope="col" className="num">Record</th>
              <th scope="col" className="num hideNarrow">Points</th>
            </tr>
          </thead>
          <tbody>
            {top25WithTrends.map((row) => {
              const team = teamById.get(row.teamId);
              const isUser = row.teamId === selectedTeamId;
              return (
                <tr key={row.teamId} className={isUser ? 'youRow' : undefined}>
                  <td className="num font-bold">{row.rank}</td>
                  <td className="text-center nowrap">{rankDeltaDisplay(row.delta)}</td>
                  <td>
                    <PollTeam team={team} isUser={isUser} fallbackId={row.teamId} />
                  </td>
                  <td className="num">{row.record}</td>
                  <td className="num hideNarrow">{row.points}</td>
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
            ? `The 12 seeds for the playoff. The ${PLAYOFF_AUTO_BIDS} highest-ranked conference champions got automatic bids; the rest are at-large. The top four have a bye.`
            : `The 12-team field if the season ended today. The ${PLAYOFF_AUTO_BIDS} highest-ranked conference leaders get automatic bids; the rest are at-large. The top four would have a bye.`}
        </p>

        <div className="dataTableWrap">
        <table>
          <caption className="sr-only">Top 12 playoff projection</caption>
          <thead>
            <tr>
              <th scope="col" className="num">Seed</th>
              <th scope="col">Team</th>
              <th scope="col" className="num">Record</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {top12.map((row) => {
              const team = teamById.get(row.teamId);
              const hasBye = row.seed <= 4;
              const isUser = row.teamId === selectedTeamId;
              const autoBidTitle = `${conferenceNameByLeader.get(row.teamId) ?? 'Conference'} ${isPostseason ? 'champion' : 'leader'}`;
              return (
                <tr key={row.teamId} className={isUser ? 'youRow' : undefined}>
                  <td className="num font-bold">#{row.seed}</td>
                  <td>
                    <PollTeam team={team} isUser={isUser} fallbackId={row.teamId} />
                  </td>
                  <td className="num">{row.record}</td>
                  <td className="text-xs">
                    <div className="fieldNotes">
                      {hasBye && <span className="youMark">Bye</span>}
                      {row.autoBid && <abbr title={autoBidTitle} className="fieldNote">Auto bid</abbr>}
                      {row.pollRank !== row.seed && <span className="fieldNote text-gray-500">No. {row.pollRank} in poll</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {bubbleTeams.length > 0 && (
            <tbody>
              <tr className="tableDivider">
                <th scope="colgroup" colSpan={4}>Next 4 out</th>
              </tr>
              {bubbleTeams.map((row) => {
                const team = teamById.get(row.teamId);
                const isUser = row.teamId === selectedTeamId;
                return (
                  <tr key={row.teamId} className={isUser ? 'youRow' : undefined}>
                    <td className="num text-gray-500">No. {row.rank}</td>
                    <td>
                      <PollTeam team={team} isUser={isUser} fallbackId={row.teamId} />
                    </td>
                    <td className="num">{row.record}</td>
                    <td />
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
        </div>

        {!hasGamesPlayed && (
          <p className="bubbleNote">No games yet. This order is the preseason profile.</p>
        )}

      </section>

      <section className="card pollExplainer">
        <h3 className="m-0 text-base">How a team is scored</h3>
        <p className="text-sm text-gray-500 mt-2 mb-0">
          Each line is a season number times its weight. Prestige carries the preseason poll and fades out
          by game {PRESTIGE_FADE_GAMES}; after that only results count. Prestige includes what each program has earned
          over the years, and your program’s includes career drift. Margin counts each game up to {MARGIN_CAP_PER_GAME} goals,
          so a blowout is worth no more than a five-goal win. Strength of schedule is two parts your opponents’ win %
          and one part their opponents’. A win over a {QUALITY_WIN_TIERS[0].minOpponentWinPct.toFixed(3).slice(1)}+ team
          adds {QUALITY_WIN_TIERS[0].points}, over a .500+ team {QUALITY_WIN_TIERS[1].points}; a loss to a team under .333
          costs {BAD_LOSS_PENALTY}. Two teams within {HEAD_TO_HEAD_WINDOW} points of each other are ordered by their head-to-head
          result. Ties on the rounded total break by wins, point differential, prestige, then school name.
        </p>
        <div className="weightList">
          {[
            ['Overall win %', RANKING_WEIGHTS.overallWinPct],
            ['Conference win %', RANKING_WEIGHTS.conferenceWinPct],
            [`Margin per goal (capped at ${MARGIN_CAP_PER_GAME} a game)`, RANKING_WEIGHTS.pointDifferential],
            [`Program prestige (fades by game ${PRESTIGE_FADE_GAMES})`, RANKING_WEIGHTS.prestige],
            ['Strength of schedule', RANKING_WEIGHTS.strengthOfSchedule],
            ['Quality wins and bad losses (points)', RANKING_WEIGHTS.qualityResults],
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
                lines={breakdownLines(topTeamBreakdown.breakdown)}
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
                lines={breakdownLines(userTeamBreakdown.breakdown)}
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
