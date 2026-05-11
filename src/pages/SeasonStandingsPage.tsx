import { useMemo, useState } from 'react';
import { selectConferenceStandings, selectOverallStandings } from '../features/season/seasonSlice';
import { useAppSelector } from '../store/hooks';

function SeasonStandingsPage() {
  const conferences = useAppSelector((state) => state.league.conferences);
  const [conferenceId, setConferenceId] = useState(conferences[0]?.id ?? '');

  const overall = useAppSelector(selectOverallStandings);
  const conferenceSelector = useMemo(() => selectConferenceStandings(conferenceId), [conferenceId]);
  const conferenceRows = useAppSelector(conferenceSelector);

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h2>Standings</h2>
        <p className="pageHeader-sub">Conference and overall records across all 128 teams.</p>
      </div>

      <div className="card">
        <div className="flex justify-between items-center mb-2">
          <h3 className="m-0">Conference Standings</h3>
          <select
            value={conferenceId}
            onChange={(event) => setConferenceId(event.target.value)}
            className="p-1 text-sm border rounded"
          >
            {conferences.map((conference) => (
              <option key={conference.id} value={conference.id}>
                {conference.name}
              </option>
            ))}
          </select>
        </div>

        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Conf</th>
              <th>Overall</th>
              <th>PF</th>
              <th>PA</th>
              <th>Diff</th>
            </tr>
          </thead>
          <tbody>
            {conferenceRows.map((row) => (
              <tr key={row.team.id}>
                <td>
                  {row.team.schoolName} <span className="text-xs text-gray-500">{row.team.nickname}</span>
                </td>
                <td className="font-semibold">
                  {row.record.confWins}-{row.record.confLosses}
                </td>
                <td>
                  {row.record.wins}-{row.record.losses}
                </td>
                <td>{row.record.pointsFor}</td>
                <td>{row.record.pointsAgainst}</td>
                <td className={row.record.pointsFor - row.record.pointsAgainst >= 0 ? 'text-green-600' : 'text-red-500'}>
                  {row.record.pointsFor - row.record.pointsAgainst > 0 ? '+' : ''}
                  {row.record.pointsFor - row.record.pointsAgainst}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 className="m-0 mb-2">Overall Standings</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>W-L</th>
              <th>Conf</th>
              <th>Diff</th>
            </tr>
          </thead>
          <tbody>
            {overall.map((row, index) => (
              <tr key={row.team.id}>
                <td className="font-mono text-gray-500">{index + 1}</td>
                <td>
                  {row.team.schoolName} <span className="text-xs text-gray-500">{row.team.nickname}</span>
                </td>
                <td className="font-semibold">
                  {row.record.wins}-{row.record.losses}
                </td>
                <td>
                  {row.record.confWins}-{row.record.confLosses}
                </td>
                <td className={row.pointDiff >= 0 ? 'text-green-600' : 'text-red-500'}>
                  {row.pointDiff > 0 ? '+' : ''}{row.pointDiff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SeasonStandingsPage;
