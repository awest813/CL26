import { useState } from 'react';
import { Link } from 'react-router-dom';
import { selectTeamsByConference } from '../features/league/leagueSlice';
import { useAppSelector } from '../store/hooks';

function ConferencesPage() {
  const conferenceTables = useAppSelector(selectTeamsByConference);
  const [filter, setFilter] = useState('');

  const displayedConferences = conferenceTables.filter(c =>
      filter === '' || c.conference.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex-col gap-4">
      <div className="card flex justify-between items-center">
         <h2 className="m-0">Conferences</h2>
         <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search conference..."
            className="p-1 border rounded text-sm"
         />
      </div>

      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {displayedConferences.map(({ conference, teams }) => (
            <div key={conference.id} className="card p-0 overflow-hidden">
                <div className="bg-gray-50 p-2 border-b font-bold flex justify-between items-center">
                    <span>{conference.name}</span>
                    <span className="text-xs text-gray-500 font-normal">{teams.length} Teams</span>
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-gray-500 text-xs border-b">
                            <th className="p-2 text-left">School</th>
                            <th className="p-2 text-center w-12">Rtg</th>
                        </tr>
                    </thead>
                    <tbody>
                        {teams.map((team) => (
                            <tr key={team.id} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="p-2">
                                    <Link to={`/team/${team.id}`} className="font-semibold text-blue-600 hover:underline">
                                        {team.schoolName}
                                    </Link>
                                    <span className="text-xs text-gray-500 ml-1">{team.nickname}</span>
                                </td>
                                <td className="p-2 text-center font-mono text-gray-600">
                                    {team.prestige}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ))}
      </div>
    </div>
  );
}

export default ConferencesPage;
