import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { selectConferenceById, selectTeamWithRosterSummary } from '../features/league/leagueSlice';
import { buildRosterSummary, playerYearLabel } from '../sim/rosterSummary';
import { useAppSelector } from '../store/hooks';

function TeamPage() {
  const { id } = useParams();
  const generatedSummary = useAppSelector((state) => (id ? selectTeamWithRosterSummary(state, id) : null));
  const selectedTeamId = useAppSelector((state) => state.coach.selectedTeamId);
  const prestigeDrift = useAppSelector((state) => state.coach.programPrestigeDrift ?? 0);
  const managedRoster = useAppSelector((state) => state.coach.managedRoster);
  const isOwnTeam = Boolean(id && selectedTeamId === id);
  const ownRoster = isOwnTeam && managedRoster && managedRoster.length > 0 ? managedRoster : null;

  const teamSummary = useMemo(() => {
    if (!generatedSummary) return null;
    if (!ownRoster) return generatedSummary;
    return {
      ...generatedSummary,
      rosterSource: 'managed' as const,
      ...buildRosterSummary(ownRoster),
    };
  }, [generatedSummary, ownRoster]);

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
  const isManagedRoster = teamSummary.rosterSource === 'managed';
  const displayedPrestige = isOwnTeam
    ? Math.max(1, Math.min(100, teamSummary.team.prestige + prestigeDrift))
    : teamSummary.team.prestige;

  return (
    <div className="pageStack">
      <section className="card card-elevated teamHeroCard">
        <Link to="/conferences" className="teamHeroBackLink">
          ← Back to conferences
        </Link>
        <div className="teamHeroHeader">
          <div>
            <h2 className="m-0">
              {teamSummary.displayName}
            </h2>
            <p className="teamHeroSubhead">
              {conference?.name ?? teamSummary.team.conferenceId} · {teamSummary.team.region}
            </p>
          </div>
          <div className="teamHeroBadges" aria-label="Program profile">
            <span className="conferenceMetricChip">Prestige {displayedPrestige}</span>
            <span className="conferenceMetricChip">Roster overall {teamSummary.rosterOverall}</span>
            <span className="conferenceMetricChip">Players {teamSummary.rosterSize}</span>
          </div>
        </div>
        {isManagedRoster && (
          <p className="teamHeroSubhead">
            Showing your current roster.{' '}
            <Link to="/career/roster">Open the full roster</Link>
          </p>
        )}
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
              <span className="teamInfoLabel">{isManagedRoster ? 'Current roster' : 'Generated roster'}</span>
              <strong>{teamSummary.rosterOverall} overall</strong>
            </div>
            {isOwnTeam && prestigeDrift !== 0 && (
              <div className="teamInfoRow">
                <span className="teamInfoLabel">Career drift</span>
                <strong>
                  {prestigeDrift > 0 ? '+' : ''}
                  {prestigeDrift} (base {teamSummary.team.prestige})
                </strong>
              </div>
            )}
            <div className="teamInfoRow">
              <span className="teamInfoLabel">Top-player mix</span>
              <strong>{topPlayerPositionMix || 'N/A'}</strong>
            </div>
            <div className="teamInfoRow">
              <span className="teamInfoLabel">Class balance</span>
              <strong>{teamSummary.classSummary.map((row) => `${row.label} ${row.count}`).join(' · ')}</strong>
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
                {playerYearLabel(topPlayer.year)} · Age {topPlayer.age} · Skill {topPlayer.skill}
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
            <h3 className="m-0">Roster Identity</h3>
            <p className="pageHeader-sub">
              {isManagedRoster
                ? 'Unit strengths from your current roster, including development and signed players.'
                : 'Unit strengths generated from position groups, experience, and the current season seed.'}
            </p>
          </div>
        </div>
        <div className="rosterSummaryGrid">
          <div className="rosterSummaryTile">
            <span>Offense</span>
            <strong>{teamSummary.unitStrengths.offense}</strong>
          </div>
          <div className="rosterSummaryTile">
            <span>Defense</span>
            <strong>{teamSummary.unitStrengths.defense}</strong>
          </div>
          <div className="rosterSummaryTile">
            <span>Faceoff</span>
            <strong>{teamSummary.unitStrengths.faceoff}</strong>
          </div>
          <div className="rosterSummaryTile">
            <span>Goalie</span>
            <strong>{teamSummary.unitStrengths.goalie}</strong>
          </div>
          <div className="rosterSummaryTile">
            <span>Experience</span>
            <strong>{teamSummary.unitStrengths.experience}</strong>
          </div>
        </div>
        <div className="dataTableWrap">
          <table>
            <caption className="text-sm text-gray-500 text-left mb-2">Roster depth by position</caption>
            <thead>
              <tr>
                <th scope="col">Position</th>
                <th scope="col">Players</th>
                <th scope="col">Avg OVR</th>
              </tr>
            </thead>
            <tbody>
              {teamSummary.positionSummary.map((row) => (
                <tr key={row.position}>
                  <td>{row.position}</td>
                  <td>{row.count}</td>
                  <td>{row.avgOverall}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="seasonHeaderRow">
          <div>
            <h3 className="m-0">Top Players</h3>
            <p className="pageHeader-sub">
              {isManagedRoster
                ? 'Top players on your current roster.'
                : 'Deterministic roster preview generated from the current season seed.'}
            </p>
          </div>
        </div>
        <div className="dataTableWrap">
          <table>
            <caption className="text-sm text-gray-500 text-left mb-2">Top roster players</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Pos</th>
                <th scope="col">Year</th>
                <th scope="col">Age</th>
                <th scope="col">Skill</th>
                <th scope="col">Overall</th>
              </tr>
            </thead>
            <tbody>
              {teamSummary.topPlayers.map((player) => (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{player.position}</td>
                  <td>{playerYearLabel(player.year)}</td>
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
