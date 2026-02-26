import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { selectConferenceById, selectTeamWithRosterSummary } from '../features/league/leagueSlice';
import { selectTeamSchedule } from '../features/season/seasonSlice';
import { useAppSelector } from '../store/hooks';

function TeamPage() {
  const { id } = useParams();
  const teamId = id ?? '';
  const teamSummary = useAppSelector((state) => (teamId ? selectTeamWithRosterSummary(state, teamId) : null));
  const season = useAppSelector(state => state.season);

  // Create selector instance
  const scheduleSelector = useMemo(() => selectTeamSchedule, []);
  // Use selector
  const schedule = useAppSelector(state => scheduleSelector(state, teamId));

  const conference = useAppSelector((state) => {
    if (!teamSummary) return null;
    return selectConferenceById(state, teamSummary.team.conferenceId);
  });

  const allTeams = useAppSelector(state => state.league.teams);
  const teamById = useMemo(() => new Map(allTeams.map(t => [t.id, t])), [allTeams]);

  const byPosition = useMemo(() => {
    if (!teamSummary) return {} as Record<string, number>;
    return teamSummary.topPlayers.reduce<Record<string, number>>((acc, player) => {
      acc[player.position] = (acc[player.position] || 0) + 1;
      return acc;
    }, {});
  }, [teamSummary]);

  if (!teamSummary) {
    return (
      <div className="card text-center py-8">
        <h2>Team Not Found</h2>
        <Link to="/conferences" className="text-blue-600 hover:underline">
            &larr; Return to Conferences
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-col gap-4">
      <div className="card">
         <div className="flex justify-between items-start">
             <div>
                 <h2 className="m-0 text-2xl font-bold">{teamSummary.team.schoolName} {teamSummary.team.nickname}</h2>
                 <div className="text-gray-500 mt-1">
                     {conference?.name} &bull; {teamSummary.team.region} Region
                 </div>
             </div>
             <div className="text-right">
                 <div className="text-xs uppercase text-gray-500">Program Prestige</div>
                 <div className="text-xl font-bold">{teamSummary.team.prestige}</div>
             </div>
         </div>

         <div className="flex gap-8 mt-4 pt-4 border-t">
             <div>
                 <div className="text-xs uppercase text-gray-500">Roster Overall</div>
                 <div className="text-lg font-bold">{teamSummary.rosterOverall}</div>
             </div>
             <div>
                 <div className="text-xs uppercase text-gray-500">Roster Size</div>
                 <div className="text-lg font-bold">{teamSummary.rosterSize}</div>
             </div>
             <div>
                 <div className="text-xs uppercase text-gray-500">Position Mix</div>
                 <div className="text-sm font-mono mt-1">
                     {Object.entries(byPosition).map(([pos, count]) => (
                         <span key={pos} className="mr-2">
                             {pos}:{count}
                         </span>
                     ))}
                 </div>
             </div>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-0 overflow-hidden">
            <div className="bg-gray-50 p-2 border-b font-bold">Top Players</div>
            <table className="w-full text-sm">
              <thead className="bg-white border-b text-gray-500 text-xs">
                <tr>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-center w-12">Pos</th>
                  <th className="p-2 text-center w-12">Year</th>
                  <th className="p-2 text-center w-12">OVR</th>
                </tr>
              </thead>
              <tbody>
                {teamSummary.topPlayers.map((player) => (
                  <tr key={player.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="p-2 font-semibold">{player.name}</td>
                    <td className="p-2 text-center">{player.position}</td>
                    <td className="p-2 text-center">{player.year}</td>
                    <td className="p-2 text-center font-bold">{player.overall}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-0 overflow-hidden">
             <div className="bg-gray-50 p-2 border-b font-bold flex justify-between">
                 <span>{season.year} Season Schedule</span>
                 <span className="text-gray-500 font-normal text-xs self-center">Week {season.currentWeekIndex + 1}</span>
             </div>
             <table className="w-full text-sm">
                 <thead className="bg-white border-b text-gray-500 text-xs">
                     <tr>
                         <th className="p-2 w-10 text-center">Wk</th>
                         <th className="p-2 text-left">Opponent</th>
                         <th className="p-2 text-center w-16">Result</th>
                     </tr>
                 </thead>
                 <tbody>
                     {schedule.map(({ weekIndex, game, result }) => {
                         const isHome = game.homeTeamId === teamId;
                         const opponentId = isHome ? game.awayTeamId : game.homeTeamId;
                         const opponent = teamById.get(opponentId);

                         let resultText = '-';
                         let resultClass = 'text-gray-400';

                         if (result) {
                             const myScore = isHome ? result.scoreA : result.scoreB;
                             const oppScore = isHome ? result.scoreB : result.scoreA;
                             const won = myScore > oppScore;
                             resultText = won ? `W ${myScore}-${oppScore}` : `L ${myScore}-${oppScore}`;
                             resultClass = won ? 'text-green-700 font-bold' : 'text-red-700 font-bold';
                         } else if (weekIndex === season.currentWeekIndex) {
                             resultText = 'Upcoming';
                             resultClass = 'text-blue-600 font-semibold';
                         }

                         return (
                             <tr key={weekIndex} className="border-b last:border-0 hover:bg-gray-50">
                                 <td className="p-2 text-center text-gray-500">{weekIndex + 1}</td>
                                 <td className="p-2">
                                     <div className="flex items-center gap-1">
                                         <span className="text-gray-400 text-xs w-4">{isHome ? 'vs' : '@'}</span>
                                         <Link to={`/team/${opponentId}`} className="hover:underline text-blue-800">
                                            {opponent?.schoolName}
                                         </Link>
                                     </div>
                                 </td>
                                 <td className={`p-2 text-center ${resultClass} text-xs`}>
                                     {resultText}
                                 </td>
                             </tr>
                         );
                     })}
                     {schedule.length === 0 && (
                         <tr>
                             <td colSpan={3} className="p-4 text-center text-gray-500">Schedule not generated.</td>
                         </tr>
                     )}
                 </tbody>
             </table>
          </div>
      </div>

      <div className="text-center mt-4">
         <Link to="/conferences" className="text-blue-600 hover:underline">
             &larr; Back to Conferences
         </Link>
      </div>
    </div>
  );
}

export default TeamPage;
