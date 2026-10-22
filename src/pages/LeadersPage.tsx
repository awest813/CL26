import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import TeamLogo from '../components/TeamLogo';
import PageHeader from '../components/PageHeader';
import { useAppSelector } from '../store/hooks';
import { LEADER_CATEGORIES, MIN_FACEOFFS, MIN_SHOTS_FACED, seasonLeaders } from '../sim/seasonStats';
import { playerYearLabel } from '../sim/rosterSummary';
import type { SeasonAward, Team } from '../types/sim';

function PlayerCell({ name, team, isUser, detail }: { name: string; team: Team | undefined; isUser: boolean; detail: string }) {
  return (
    <span className="pollIdentity">
      {team && <TeamLogo team={team} size="sm" />}
      <span className="pollTeam">
        <span className="font-semibold">{name}</span>
        <span className="pollNick">
          {team ? <Link to={`/team/${team.id}`}>{team.schoolName}</Link> : null}
          {detail ? ` · ${detail}` : ''}
          {isUser && <span className="youMark"> (You)</span>}
        </span>
      </span>
    </span>
  );
}

function LeadersPage() {
  const stats = useAppSelector((state) => state.season.playerSeasonStats);
  const awardHistory = useAppSelector((state) => state.season.awardHistory);
  const allAmericanHistory = useAppSelector((state) => state.season.allAmericanHistory);
  const postseasonAwardHistory = useAppSelector((state) => state.season.postseasonAwardHistory);
  const year = useAppSelector((state) => state.season.year);
  const phase = useAppSelector((state) => state.season.phase);
  const teams = useAppSelector((state) => state.league.teams);
  const selectedTeamId = useAppSelector((state) => state.coach.selectedTeamId);

  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const tables = useMemo(
    () => LEADER_CATEGORIES.map((category) => ({ category, rows: seasonLeaders(stats, category, 10) })),
    [stats],
  );
  const hasStats = Object.keys(stats ?? {}).length > 0;

  const awardYears = Object.keys(awardHistory ?? {}).map(Number).sort((a, b) => b - a);
  const awardsYear = awardYears[0] ?? null;
  const awards = awardsYear != null ? awardHistory?.[awardsYear] ?? [] : [];
  const awardsAreThisYear = awardsYear === year;
  const allAmericans = awardsYear != null ? allAmericanHistory?.[awardsYear] : undefined;
  const postseason = awardsYear != null ? postseasonAwardHistory?.[awardsYear] : undefined;
  const conferences = useAppSelector((state) => state.league.conferences);
  const conferenceName = (conferenceId: string) => conferences.find((conference) => conference.id === conferenceId)?.name ?? conferenceId;
  const postseasonRows: SeasonAward[] = [
    ...(postseason?.coachOfTheYear
      ? [{
          award: 'Coach of the Year',
          playerId: `coach-${postseason.coachOfTheYear.teamId}`,
          name: postseason.coachOfTheYear.coachName,
          teamId: postseason.coachOfTheYear.teamId,
          position: 'A' as const,
          statLine: `${postseason.coachOfTheYear.record}, ${postseason.coachOfTheYear.detail}`,
        }]
      : []),
    ...(postseason?.mostOutstandingPlayer ? [postseason.mostOutstandingPlayer] : []),
    ...Object.entries(postseason?.conferencePlayers ?? {})
      .sort(([a], [b]) => conferenceName(a).localeCompare(conferenceName(b)))
      .map(([conferenceId, award]) => ({ ...award, award: `${conferenceName(conferenceId)} Player of the Year` })),
  ];

  return (
    <div className="pageStack">
      <PageHeader
        eyebrow="Season"
        title="Leaders"
        subtitle={`${year} regular-season leaders and the national awards. Bracket games do not count.`}
      />

      <section className="card">
        <h3 className="m-0">{awardsYear != null ? `${awardsYear} national awards` : 'National awards'}</h3>
        <p className="text-sm text-gray-500 mt-1 mb-2">
          {awardsAreThisYear
            ? 'Named at the end of the regular season.'
            : phase === 'PRE' || phase === 'REGULAR'
              ? `This year's awards are named after week 12.${awardsYear != null ? ' Last season’s winners are below.' : ''}`
              : 'Named at the end of the regular season.'}
        </p>
        {awards.length > 0 ? (
          <div className="dataTableWrap">
            <table>
              <caption className="sr-only">{awardsYear} national awards</caption>
              <thead>
                <tr>
                  <th scope="col">Award</th>
                  <th scope="col">Player</th>
                  <th scope="col">Season</th>
                </tr>
              </thead>
              <tbody>
                {awards.map((award) => (
                  <tr key={award.award} className={award.teamId === selectedTeamId ? 'youRow' : undefined}>
                    <td className="font-semibold">{award.award}</td>
                    <td>
                      <PlayerCell
                        name={award.name}
                        team={teamById.get(award.teamId)}
                        isUser={award.teamId === selectedTeamId}
                        detail={award.position}
                      />
                    </td>
                    <td className="text-sm">{award.statLine}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm m-0">No awards yet. The first are named when this regular season ends.</p>
        )}
      </section>

      {postseasonRows.length > 0 && (
        <section className="card">
          <h3 className="m-0">{awardsYear} postseason honors</h3>
          <p className="text-sm text-gray-500 mt-1 mb-2">
            Conference Players of the Year are named after week 12; Coach of the Year and the Most Outstanding Player after the championship.
          </p>
          <div className="dataTableWrap">
            <table>
              <caption className="sr-only">{awardsYear} postseason honors</caption>
              <thead>
                <tr>
                  <th scope="col">Award</th>
                  <th scope="col">Winner</th>
                  <th scope="col">Why</th>
                </tr>
              </thead>
              <tbody>
                {postseasonRows.map((award) => (
                  <tr key={award.award} className={award.teamId === selectedTeamId ? 'youRow' : undefined}>
                    <td className="font-semibold">{award.award}</td>
                    <td>
                      <PlayerCell
                        name={award.name}
                        team={teamById.get(award.teamId)}
                        isUser={award.teamId === selectedTeamId}
                        detail={award.award === 'Coach of the Year' ? 'Head coach' : award.position}
                      />
                    </td>
                    <td className="text-sm">{award.statLine}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {allAmericans && allAmericans.first.length > 0 && (
        <div className="grid2">
          {([['First team', allAmericans.first], ['Second team', allAmericans.second]] as const).map(([label, rows]) => (
            <section key={label} className="card">
              <h3 className="m-0">{awardsYear} All-Americans: {label.toLowerCase()}</h3>
              <div className="dataTableWrap">
                <table>
                  <caption className="sr-only">{awardsYear} All-American {label.toLowerCase()}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Spot</th>
                      <th scope="col">Player</th>
                      <th scope="col">Season</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.playerId} className={row.teamId === selectedTeamId ? 'youRow' : undefined}>
                        <td className="text-xs text-gray-500">{row.award}</td>
                        <td>
                          <PlayerCell name={row.name} team={teamById.get(row.teamId)} isUser={row.teamId === selectedTeamId} detail="" />
                        </td>
                        <td className="text-sm">{row.statLine}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {!hasStats ? (
        <section className="card">
          <p className="text-sm m-0">No games played yet. Leaders fill in after week 1.</p>
        </section>
      ) : (
        <div className="grid2">
          {tables.map(({ category, rows }) => (
            <section key={category.key} className="card">
              <h3 className="m-0">{category.label}</h3>
              {category.key === 'savePct' && (
                <p className="text-xs text-gray-500 mt-1 mb-0">Goalies who have faced {MIN_SHOTS_FACED}+ shots on goal.</p>
              )}
              {category.key === 'faceoffPct' && (
                <p className="text-xs text-gray-500 mt-1 mb-0">Players who have taken {MIN_FACEOFFS}+ draws.</p>
              )}
              {rows.length === 0 ? (
                <p className="text-sm mt-2 mb-0">Nobody qualifies yet.</p>
              ) : (
                <div className="dataTableWrap">
                  <table>
                    <caption className="sr-only">{category.label} leaders</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="num">#</th>
                        <th scope="col">Player</th>
                        <th scope="col" className="num">{category.label}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((line, index) => (
                        <tr key={line.playerId} className={line.teamId === selectedTeamId ? 'youRow' : undefined}>
                          <td className="num">{index + 1}</td>
                          <td>
                            <PlayerCell
                              name={line.name}
                              team={teamById.get(line.teamId)}
                              isUser={line.teamId === selectedTeamId}
                              detail={`${line.position} · ${playerYearLabel(line.year)}`}
                            />
                          </td>
                          <td className="num">{category.format(line)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default LeadersPage;
