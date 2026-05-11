import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { selectConferenceById, selectTeamWithRosterSummary } from '../features/league/leagueSlice';
import { useAppSelector } from '../store/hooks';

function TeamPage() {
  const { id } = useParams();
  const teamSummary = useAppSelector((state) => (id ? selectTeamWithRosterSummary(state, id) : null));

  const conference = useAppSelector((state) => {
    if (!teamSummary) return null;
    return selectConferenceById(state, teamSummary.team.conferenceId);
  });

  const byPosition = useMemo(() => {
    if (!teamSummary) return {} as Record<string, number>;
    return teamSummary.topPlayers.reduce<Record<string, number>>((acc, player) => {
      acc[player.position] = (acc[player.position] || 0) + 1;
      return acc;
    }, {});
  }, [teamSummary]);

  if (!teamSummary) {
    return (
      <section className="card">
        <h2>Team not found</h2>
        <p className="m-0">We couldn&apos;t find a program for id: {id ?? 'unknown'}.</p>
        <Link to="/conferences">Back to conferences</Link>
      </section>
    );
  }

  const topPlayerPositionMix = Object.entries(byPosition)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pos, count]) => `${pos}(${count})`)
    .join(', ');
  const topPlayer = teamSummary.topPlayers[0] ?? null;
  const topPlayersAverageOverall =
    teamSummary.topPlayers.length > 0
      ? Math.round(
          teamSummary.topPlayers.reduce((sum, player) => sum + player.overall, 0) / teamSummary.topPlayers.length,
        )
      : 0;

  return (
    <div className="pageStack">
      <section className="card card-elevated teamHeroCard">
        <Link to="/conferences" className="teamHeroBackLink">
          ← Back to conferences
        </Link>
        <div className="teamHeroHeader">
          <div>
            <h2 className="m-0">
              {teamSummary.team.schoolName} {teamSummary.team.nickname}
            </h2>
            <p className="teamHeroSubhead">
              {conference?.name ?? teamSummary.team.conferenceId} · {teamSummary.team.region}
            </p>
          </div>
          <div className="teamHeroBadges" aria-label="Program profile">
            <span className="conferenceMetricChip">Prestige {teamSummary.team.prestige}</span>
            <span className="conferenceMetricChip">Roster overall {teamSummary.rosterOverall}</span>
            <span className="conferenceMetricChip">Players {teamSummary.rosterSize}</span>
          </div>
        </div>
      </section>

      <div className="grid2 teamSummaryGrid">
        <section className="card">
          <h3 className="m-0">Program Snapshot</h3>
          <div className="teamInfoList">
            <div className="teamInfoRow">
              <span className="teamInfoLabel">Conference</span>
              <strong>{conference?.name ?? teamSummary.team.conferenceId}</strong>
            </div>
            <div className="teamInfoRow">
              <span className="teamInfoLabel">Region</span>
              <strong>{teamSummary.team.region}</strong>
            </div>
            <div className="teamInfoRow">
              <span className="teamInfoLabel">Generated roster</span>
              <strong>{teamSummary.rosterOverall} overall</strong>
            </div>
            <div className="teamInfoRow">
              <span className="teamInfoLabel">Top-player mix</span>
              <strong>{topPlayerPositionMix || 'N/A'}</strong>
            </div>
          </div>
        </section>

        <section className="card">
          <h3 className="m-0">Top-End Talent</h3>
          {topPlayer ? (
            <div className="teamSpotlightCard">
              <span className="teamInfoLabel">Best player</span>
              <strong>
                {topPlayer.name} · {topPlayer.position}
              </strong>
              <p className="teamSpotlightMeta">
                Year {topPlayer.year} · Age {topPlayer.age} · Skill {topPlayer.skill}
              </p>
            </div>
          ) : (
            <div className="teamSpotlightCard">
              <span className="teamInfoLabel">Best player</span>
              <strong>No roster preview available</strong>
              <p className="teamSpotlightMeta">Generated player data will appear here once the roster seed resolves.</p>
            </div>
          )}
          <div className="teamInfoList">
            <div className="teamInfoRow">
              <span className="teamInfoLabel">Top player overall</span>
              <strong>{topPlayer?.overall ?? '—'}</strong>
            </div>
            <div className="teamInfoRow">
              <span className="teamInfoLabel">Top-5 average overall</span>
              <strong>{topPlayersAverageOverall}</strong>
            </div>
            <div className="teamInfoRow">
              <span className="teamInfoLabel">Roster size</span>
              <strong>{teamSummary.rosterSize}</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="seasonHeaderRow">
          <div>
            <h3 className="m-0">Top Players</h3>
            <p className="pageHeader-sub">Deterministic roster preview generated from the current season seed.</p>
          </div>
        </div>
        <div className="dataTableWrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Pos</th>
                <th>Year</th>
                <th>Age</th>
                <th>Skill</th>
                <th>Overall</th>
              </tr>
            </thead>
            <tbody>
              {teamSummary.topPlayers.map((player) => (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{player.position}</td>
                  <td>{player.year}</td>
                  <td>{player.age}</td>
                  <td>{player.skill}</td>
                  <td>{player.overall}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default TeamPage;
