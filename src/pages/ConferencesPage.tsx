import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TeamLogo from '../components/TeamLogo';
import PrestigeStars from '../components/PrestigeStars';
import { selectConferenceBrowserRows } from '../features/league/leagueSlice';
import { selectRankingTeams } from '../features/season/seasonSlice';
import { useAppSelector } from '../store/hooks';
import PageHeader from '../components/PageHeader';

function ConferencesPage() {
  const conferenceRows = useAppSelector(selectConferenceBrowserRows);
  const selectedTeamId = useAppSelector((state) => state.coach.selectedTeamId);
  // Prestige as it stands now: base plus what each program has earned.
  const currentTeams = useAppSelector(selectRankingTeams);
  const prestigeByTeamId = useMemo(() => new Map(currentTeams.map((team) => [team.id, team.prestige])), [currentTeams]);
  const [regionFilter, setRegionFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const userConferenceId = useMemo(() => {
    if (!selectedTeamId) return '';
    return conferenceRows.find((row) => row.teams.some((team) => team.id === selectedTeamId))?.conference.id ?? '';
  }, [conferenceRows, selectedTeamId]);

  const regions = useMemo(
    () => [
      'all',
      ...new Set(conferenceRows.flatMap(({ teams }) => teams.map((team) => team.region)).sort((a, b) => a.localeCompare(b))),
    ],
    [conferenceRows],
  );

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return conferenceRows.filter(({ conference, teams }) => {
      const matchesRegion = regionFilter === 'all' || teams.some((team) => team.region === regionFilter);
      const matchesSearch =
        query.length === 0 ||
        conference.name.toLowerCase().includes(query) ||
        teams.some((team) => `${team.schoolName} ${team.nickname} ${team.region}`.toLowerCase().includes(query));
      return matchesRegion && matchesSearch;
    });
  }, [conferenceRows, regionFilter, searchText]);

  const orderedRows = useMemo(() => {
    if (!userConferenceId) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      if (a.conference.id === userConferenceId) return -1;
      if (b.conference.id === userConferenceId) return 1;
      return 0;
    });
  }, [filteredRows, userConferenceId]);

  const hasNoResults = orderedRows.length === 0;
  const hasActiveFilters = regionFilter !== 'all' || searchText.trim().length > 0;
  const totalTeamCount = conferenceRows.reduce((sum, row) => sum + row.teamCount, 0);
  const { visibleTeamCount, averageVisibleRosterStrengthValue } = useMemo(() => {
    const totals = orderedRows.reduce(
      (summary, row) => {
        summary.visibleTeamCount += row.teamCount;
        summary.totalVisibleRosterStrength += row.rosterStrength;
        return summary;
      },
      { visibleTeamCount: 0, totalVisibleRosterStrength: 0 },
    );

    return {
      visibleTeamCount: totals.visibleTeamCount,
      averageVisibleRosterStrengthValue:
        orderedRows.length > 0 ? Number((totals.totalVisibleRosterStrength / orderedRows.length).toFixed(1)) : 0,
    };
  }, [orderedRows]);

  const clearFilters = () => {
    setRegionFilter('all');
    setSearchText('');
  };

  return (
    <div className="pageStack">
      <PageHeader
        eyebrow="League"
        title="Conferences"
        subtitle="Browse the full 128-team league by conference, region, and generated roster profile."
        actions={userConferenceId && orderedRows.some((row) => row.conference.id === userConferenceId) ? (
          <a href="#your-conference" className="btn">Jump to your conference</a>
        ) : undefined}
      />

      <div className="card card-elevated leagueOverviewCard">
        <div className="leagueOverviewStats" aria-label="League browser summary">
          <div className="leagueOverviewStat">
            <span className="leagueOverviewLabel">Visible conferences</span>
            <strong>{orderedRows.length}</strong>
          </div>
          <div className="leagueOverviewStat">
            <span className="leagueOverviewLabel">Visible teams</span>
            <strong>
              {visibleTeamCount}
              <span className="leagueOverviewMuted"> / {totalTeamCount}</span>
            </strong>
          </div>
          <div className="leagueOverviewStat">
            <span className="leagueOverviewLabel">Avg roster strength</span>
            <strong>{averageVisibleRosterStrengthValue}</strong>
          </div>
        </div>

        <div className="leagueFilterBar">
          <label>
            Search conference/team
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Atlantic, Harbor, Summit..."
            />
          </label>
          <label>
            Region filter
            <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region === 'all' ? 'All regions' : region}
                </option>
              ))}
            </select>
          </label>
          {hasActiveFilters ? (
            <button type="button" className="btn" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {hasNoResults ? (
        <div className="card">
          <h3>No conferences match your filters.</h3>
          <p>Try broadening your search text or reset to all regions.</p>
          <button type="button" className="btn" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : null}

      {orderedRows.map(({ conference, teams, rosterStrength, teamCount }) => {
        const averagePrestige = teams.reduce((sum, team) => sum + (prestigeByTeamId.get(team.id) ?? team.prestige), 0) / Math.max(1, teams.length);
        const conferenceRegions = Array.from(new Set(teams.map((team) => team.region))).join(' · ');
        const isYourConference = conference.id === userConferenceId;

        return (
        <section
          key={conference.id}
          id={isYourConference ? 'your-conference' : undefined}
          className={`conferenceCard card-elevated conferenceBrowserCard ${isYourConference ? 'conferenceBrowserCard-you' : ''}`}
        >
          <div className="conferenceBrowserHeader">
            <div>
              <h3 className="m-0">
                {conference.name}
                {isYourConference && <span className="youMark ml-2">Your conference</span>}
              </h3>
              <p className="conferenceBrowserSubhead">{conferenceRegions}</p>
            </div>
            <div className="conferenceBrowserMetrics" aria-label={`${conference.name} summary`}>
              <span className="conferenceMetricChip">Teams {teamCount}</span>
              <span className="conferenceMetricChip">Avg <PrestigeStars prestige={averagePrestige} /></span>
              <span className="conferenceMetricChip">Roster {rosterStrength}</span>
            </div>
          </div>

          <div className="conferenceTeamGrid">
            {teams.map((team) => {
              const isUser = team.id === selectedTeamId;
              return (
              <Link key={team.id} to={`/team/${team.id}`} className={`conferenceTeamCard ${isUser ? 'conferenceTeamCard-you' : ''}`}>
                <div className="conferenceTeamIdentity">
                  <TeamLogo team={team} size="sm" />
                  <div>
                    <strong>
                      {team.schoolName}
                      {isUser && <span className="youMark ml-1">(You)</span>}
                    </strong>
                    <div className="conferenceTeamNickname">{team.nickname}</div>
                  </div>
                </div>
                <div className="conferenceTeamMeta">
                  <span>{team.region}</span>
                  <PrestigeStars prestige={prestigeByTeamId.get(team.id) ?? team.prestige} />
                </div>
              </Link>
              );
            })}
          </div>
        </section>
        );
      })}
    </div>
  );
}

export default ConferencesPage;
