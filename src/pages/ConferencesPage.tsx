import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { selectConferenceBrowserRows } from '../features/league/leagueSlice';
import { useAppSelector } from '../store/hooks';

function ConferencesPage() {
  const conferenceRows = useAppSelector(selectConferenceBrowserRows);
  const [regionFilter, setRegionFilter] = useState('all');
  const [searchText, setSearchText] = useState('');

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

  const hasNoResults = filteredRows.length === 0;
  const hasActiveFilters = regionFilter !== 'all' || searchText.trim().length > 0;
  const totalTeamCount = conferenceRows.reduce((sum, row) => sum + row.teamCount, 0);
  const { visibleTeamCount, averageVisibleRosterStrengthValue } = useMemo(() => {
    const totals = filteredRows.reduce(
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
        filteredRows.length > 0 ? Number((totals.totalVisibleRosterStrength / filteredRows.length).toFixed(1)) : 0,
    };
  }, [filteredRows]);

  const clearFilters = () => {
    setRegionFilter('all');
    setSearchText('');
  };

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h2>Conferences</h2>
        <p className="pageHeader-sub">Browse the full 128-team league by conference, region, and generated roster profile.</p>
      </div>

      <div className="card card-elevated leagueOverviewCard">
        <div className="leagueOverviewStats" aria-label="League browser summary">
          <div className="leagueOverviewStat">
            <span className="leagueOverviewLabel">Visible conferences</span>
            <strong>{filteredRows.length}</strong>
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

      {filteredRows.map(({ conference, teams, rosterStrength, averagePrestige, teamCount }) => {
        const conferenceRegions = Array.from(new Set(teams.map((team) => team.region))).join(' · ');

        return (
        <section key={conference.id} className="conferenceCard card-elevated conferenceBrowserCard">
          <div className="conferenceBrowserHeader">
            <div>
              <h3 className="m-0">{conference.name}</h3>
              <p className="conferenceBrowserSubhead">{conferenceRegions}</p>
            </div>
            <div className="conferenceBrowserMetrics" aria-label={`${conference.name} summary`}>
              <span className="conferenceMetricChip">Teams {teamCount}</span>
              <span className="conferenceMetricChip">Avg prestige {averagePrestige}</span>
              <span className="conferenceMetricChip">Roster {rosterStrength}</span>
            </div>
          </div>

          <div className="conferenceTeamGrid">
            {teams.map((team) => (
              <Link key={team.id} to={`/team/${team.id}`} className="conferenceTeamCard">
                <div>
                  <strong>{team.schoolName}</strong>
                  <div className="conferenceTeamNickname">{team.nickname}</div>
                </div>
                <div className="conferenceTeamMeta">
                  <span>{team.region}</span>
                  <span>Prestige {team.prestige}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
        );
      })}
    </div>
  );
}

export default ConferencesPage;
