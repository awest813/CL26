import { Link } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { selectTop25 } from '../features/season/rankingsSelector';

function TeamNameDisplay({ teamId }: { teamId: string }) {
    const team = useAppSelector(state => state.league.teams.find(t => t.id === teamId));
    if (!team) return <span>Unknown Team</span>;
    return (
        <Link to={`/team/${teamId}`} className="hover:underline text-black block">
            <span className="font-semibold">{team.schoolName}</span>
            <span className="text-xs text-gray-500 ml-1">{team.nickname}</span>
        </Link>
    );
}

function RankingsPage() {
  const top25 = useAppSelector(selectTop25);
  const season = useAppSelector(state => state.season);

  if (season.phase === 'PRE') {
    return (
      <div className="card text-center py-8">
        <h2>Pre-Season Rankings</h2>
        <p className="text-gray-500">Rankings will be available after Week 1.</p>
      </div>
    );
  }

  return (
    <div className="flex-col gap-4">
      <div className="card flex justify-between items-center">
         <h2 className="m-0">Top 25 Rankings</h2>
         <div className="text-sm text-gray-500">Week {season.currentWeekIndex + 1}</div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 border-b">
            <tr>
              <th className="p-2 w-12 text-center">Rank</th>
              <th className="p-2 text-left">Team</th>
              <th className="p-2 w-24 text-center">Record</th>
              <th className="p-2 w-20 text-center">Points</th>
            </tr>
          </thead>
          <tbody>
            {top25.map((row) => (
              <tr key={row.teamId} className="border-b last:border-0 hover:bg-gray-50">
                <td className="p-2 text-center font-bold">#{row.rank}</td>
                <td className="p-2">
                   <TeamNameDisplay teamId={row.teamId} />
                </td>
                <td className="p-2 text-center font-mono">{row.record}</td>
                <td className="p-2 text-center text-gray-500">{row.points.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RankingsPage;
