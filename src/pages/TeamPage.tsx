import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import TeamLogo from '../components/TeamLogo';
import { selectConferenceById, selectTeamWithRosterSummary } from '../features/league/leagueSlice';
import { buildRosterSummary, playerYearLabel } from '../sim/rosterSummary';
import { useAppSelector } from '../store/hooks';
import PageHeader from '../components/PageHeader';
import { effectiveProgram, ledgerEntry } from '../sim/programLedger';
import { buildRivalries, rivalOf, rivalryFor } from '../sim/rivalries';

function TeamPage() {
  const { id } = useParams();
  const generatedSummary = useAppSelector((state) => (id ? selectTeamWithRosterSummary(state, id) : null));
  const selectedTeamId = useAppSelector((state) => state.coach.selectedTeamId);
  const prestigeDrift = useAppSelector((state) => state.coach.programPrestigeDrift ?? 0);
  const programLedger = useAppSelector((state) => state.season.programLedger);
  const leagueTeams = useAppSelector((state) => state.league.teams);
  const trophyHolders = useAppSelector((state) => state.season.trophyHolders);
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
      <div className="pageStack">
        <PageHeader eyebrow="League" title="Team not found" />
        <div className="card emptyState">
          <p>We couldn&apos;t find a program for id: {id ?? 'unknown'}.</p>
          <div className="emptyState-actions">
            <Link to="/conferences" className="btn btn-primary">Browse conferences</Link>
          </div>
        </div>
      </div>
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
  const standing = ledgerEntry(programLedger, teamSummary.team.id);
  const displayedPrestige = isOwnTeam
    ? Math.max(1, Math.min(100, teamSummary.team.prestige + prestigeDrift))
    : effectiveProgram(teamSummary.team, programLedger).prestige;
  const rivalry = rivalryFor(buildRivalries(leagueTeams), teamSummary.team.id);
  const rival = rivalry ? leagueTeams.find((team) => team.id === rivalOf(rivalry, teamSummary.team.id)) : undefined;
  const trophyHolder = rivalry ? leagueTeams.find((team) => team.id === trophyHolders?.[rivalry.trophy]) : undefined;
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;

  return (
    <div className="pageStack">
      <section className="card card-elevated teamHeroCard">
        <Link to="/conferences" className="teamHeroBackLink">
          Back to conferences
        </Link>
        <div className="teamHeroHeader">
          <div className="programLockup">
            <TeamLogo team={teamSummary.team} size="lg" />
            <div>
            <h2 className="m-0">
              {teamSummary.displayName}
            </h2>
            <p className="teamHeroSubhead">
              {conference?.name ?? teamSummary.team.conferenceId} · {teamSummary.team.region}
            </p>
            </div>
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
          <h3 className="m-0">Program snapshot</h3>
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
            {rivalry && rival && (
              <div className="teamInfoRow">
                <span className="teamInfoLabel">Rival</span>
                <strong>
                  <Link to={`/team/${rival.id}`}>{rival.schoolName}</Link> · {rivalry.trophy}
                  {trophyHolder ? ` (held by ${trophyHolder.schoolName})` : ''}
                </strong>
              </div>
            )}
            {!isOwnTeam && standing.prestigeDrift !== 0 && (
              <div className="teamInfoRow">
                <span className="teamInfoLabel">Earned prestige</span>
                <strong>{signed(standing.prestigeDrift)} (base {teamSummary.team.prestige})</strong>
              </div>
            )}
            {!isOwnTeam && standing.talent !== 0 && (
              <div className="teamInfoRow">
                <span className="teamInfoLabel">Recruiting talent</span>
                <strong>{signed(standing.talent)} roster rating</strong>
              </div>
            )}
            {!isOwnTeam && standing.lastClass && (
              <div className="teamInfoRow">
                <span className="teamInfoLabel">{standing.lastClass.year} class</span>
                <strong>
                  {standing.lastClass.commits} {standing.lastClass.commits === 1 ? 'commit' : 'commits'}
                  {standing.lastClass.commits > 0 ? ` · ${standing.lastClass.averageStars.toFixed(1)}★ average` : ''}
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
          <h3 className="m-0">Top-end talent</h3>
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
            <h3 className="m-0">Roster identity</h3>
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
            <caption className="sr-only">Roster depth by position</caption>
            <thead>
              <tr>
                <th scope="col">Position</th>
                <th scope="col" className="num">Players</th>
                <th scope="col" className="num">Avg OVR</th>
              </tr>
            </thead>
            <tbody>
              {teamSummary.positionSummary.map((row) => (
                <tr key={row.position}>
                  <td>{row.position}</td>
                  <td className="num">{row.count}</td>
                  <td className="num">{row.avgOverall}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="seasonHeaderRow">
          <div>
            <h3 className="m-0">Top players</h3>
            <p className="pageHeader-sub">
              {isManagedRoster
                ? 'Top players on your current roster.'
                : 'Deterministic roster preview generated from the current season seed.'}
            </p>
          </div>
        </div>
        <div className="dataTableWrap">
          <table>
            <caption className="sr-only">Top roster players</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Pos</th>
                <th scope="col">Year</th>
                <th scope="col" className="num hideNarrow">Age</th>
                <th scope="col" className="num">Skill</th>
                <th scope="col" className="num">Overall</th>
              </tr>
            </thead>
            <tbody>
              {teamSummary.topPlayers.map((player) => (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{player.position}</td>
                  <td>{playerYearLabel(player.year)}</td>
                  <td className="num hideNarrow">{player.age}</td>
                  <td className="num">{player.skill}</td>
                  <td className="num font-semibold">{player.overall}</td>
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
