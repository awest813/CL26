import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { selectTeamsByConference } from '../features/league/leagueSlice';
import { useAppSelector } from '../store/hooks';

type TeamSortOption = 'school' | 'prestige-desc' | 'prestige-asc';

function ConferencesPage() {
  const conferenceTables = useAppSelector(selectTeamsByConference);
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [sortOption, setSortOption] = useState<TeamSortOption>('school');

  const regions = useMemo(() => {
    const regionSet = new Set<string>();
    conferenceTables.forEach(({ teams }) => {
      teams.forEach((team) => regionSet.add(team.region));
    });

    return ['all', ...Array.from(regionSet).sort()];
  }, [conferenceTables]);

  const filteredTables = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return conferenceTables
      .map(({ conference, teams }) => {
        const filteredTeams = teams
          .filter((team) => {
            const matchesSearch =
              normalizedSearch.length === 0 ||
              `${team.schoolName} ${team.nickname}`.toLowerCase().includes(normalizedSearch);
            const matchesRegion = regionFilter === 'all' || team.region === regionFilter;

            return matchesSearch && matchesRegion;
          })
          .sort((a, b) => {
            if (sortOption === 'prestige-desc') return b.prestige - a.prestige;
            if (sortOption === 'prestige-asc') return a.prestige - b.prestige;
            return a.schoolName.localeCompare(b.schoolName);
          });

        const avgPrestige =
          filteredTeams.length > 0
            ? Math.round(filteredTeams.reduce((total, team) => total + team.prestige, 0) / filteredTeams.length)
            : 0;

        return {
          conference,
          teams: filteredTeams,
          avgPrestige,
        };
      })
      .filter(({ teams }) => teams.length > 0);
  }, [conferenceTables, regionFilter, searchTerm, sortOption]);

  return (
    <section>
      <h2>Conferences</h2>
      <div className="conferenceFilters">
        <label>
          Search team
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="School or nickname"
          />
        </label>
        <label>
          Filter by region
          <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region === 'all' ? 'All regions' : region}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort teams
          <select value={sortOption} onChange={(event) => setSortOption(event.target.value as TeamSortOption)}>
            <option value="school">School name (A-Z)</option>
            <option value="prestige-desc">Prestige (high-low)</option>
            <option value="prestige-asc">Prestige (low-high)</option>
          </select>
        </label>
      </div>

      {filteredTables.map(({ conference, teams, avgPrestige }) => (
        <div key={conference.id} className="conferenceCard">
          <h3>{conference.name}</h3>
          <p className="text-sm text-gray-500 m-0">
            Showing {teams.length} teams · Average prestige {avgPrestige}
          </p>
          <table>
            <thead>
              <tr>
                <th>School</th>
                <th>Nickname</th>
                <th>Region</th>
                <th>Prestige</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.id}>
                  <td>
                    <Link to={`/team/${team.id}`}>{team.schoolName}</Link>
                  </td>
                  <td>{team.nickname}</td>
                  <td>{team.region}</td>
                  <td>{team.prestige}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {filteredTables.length === 0 && (
        <div className="conferenceCard">
          <p className="m-0">No teams match the current filters.</p>
        </div>
      )}
    </section>
  );
}

export default ConferencesPage;
