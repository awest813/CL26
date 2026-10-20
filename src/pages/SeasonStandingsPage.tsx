import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TeamLogo from '../components/TeamLogo';
import { selectConferenceStandings, selectOverallStandings } from '../features/season/seasonSlice';
import { useAppSelector } from '../store/hooks';

function ordinal(n: number): string {
  const mod = n % 100;
  if (mod >= 11 && mod <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function SeasonStandingsPage() {
  const conferences = useAppSelector((state) => state.league.conferences);
  const teams = useAppSelector((state) => state.league.teams);
  const selectedTeamId = useAppSelector((state) => state.coach.selectedTeamId);
  const userConferenceId = teams.find((team) => team.id === selectedTeamId)?.conferenceId ?? '';
  const [conferenceOverride, setConferenceOverride] = useState<string | null>(null);
  const conferenceId = conferenceOverride ?? (userConferenceId || conferences[0]?.id || '');

  const overall = useAppSelector(selectOverallStandings);
  const conferenceSelector = useMemo(() => selectConferenceStandings(conferenceId), [conferenceId]);
  const conferenceRows = useAppSelector(conferenceSelector);
  const userOverallIndex = selectedTeamId ? overall.findIndex((row) => row.team.id === selectedTeamId) : -1;
  const userOverall = userOverallIndex >= 0 ? overall[userOverallIndex] : null;

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h2>Standings</h2>
        <p className="pageHeader-sub">
          Conference tables sort by conference record, then point differential, overall record, and school name.
          Overall tables sort by record, then point differential and school name.
        </p>
      </div>

      <div className="card">
        <div className="standingsToolbar">
          <h3 className="m-0">Conference Standings</h3>
          <label className="text-sm">
            Conference
            <select
              value={conferenceId}
              onChange={(event) => setConferenceOverride(event.target.value)}
              className="p-1 text-sm border rounded ml-1"
            >
            {conferences.map((conference) => (
              <option key={conference.id} value={conference.id}>
                {conference.name}
              </option>
            ))}
          </select>
          </label>
        </div>
        {userConferenceId && conferenceId !== userConferenceId && (
          <p className="text-sm text-gray-600 mt-0 mb-2">
            <button type="button" className="textButton" onClick={() => setConferenceOverride(null)}>
              Show your conference
            </button>
          </p>
        )}

        <div className="dataTableWrap">
        <table>
          <caption className="text-sm text-gray-500 text-left mb-2">Conference standings</caption>
          <thead>
            <tr>
              <th scope="col">Team</th>
              <th scope="col">Conf</th>
              <th scope="col">Overall</th>
              <th scope="col">PF</th>
              <th scope="col">PA</th>
              <th scope="col">Diff</th>
            </tr>
          </thead>
          <tbody>
            {conferenceRows.map((row) => {
              const isUser = row.team.id === selectedTeamId;
              return (
              <tr key={row.team.id} className={isUser ? 'youRow' : undefined}>
                <td>
                  <span className="standingsTeam">
                    <TeamLogo team={row.team} size="sm" />
                    <span>
                      <Link to={`/team/${row.team.id}`}>{row.team.schoolName}</Link>{' '}
                      <span className="text-xs text-gray-500">{row.team.nickname}</span>
                      {isUser && <span className="youMark ml-1">(You)</span>}
                    </span>
                  </span>
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
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <div className="card">
        <h3 className="m-0 mb-2">Overall Standings</h3>
        {userOverall && (
          <p className="text-sm text-gray-600 mt-0 mb-2">
            Your program is {ordinal(userOverallIndex + 1)} overall ({userOverall.record.wins}–{userOverall.record.losses}).
          </p>
        )}
        <div className="dataTableWrap">
        <table>
          <caption className="text-sm text-gray-500 text-left mb-2">Overall league standings</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Team</th>
              <th scope="col">W-L</th>
              <th scope="col">Conf</th>
              <th scope="col">Diff</th>
            </tr>
          </thead>
          <tbody>
            {overall.map((row, index) => {
              const isUser = row.team.id === selectedTeamId;
              return (
              <tr key={row.team.id} className={isUser ? 'youRow' : undefined}>
                <td className="font-mono text-gray-500">{index + 1}</td>
                <td>
                  <span className="standingsTeam">
                    <TeamLogo team={row.team} size="sm" />
                    <span>
                      <Link to={`/team/${row.team.id}`}>{row.team.schoolName}</Link>{' '}
                      <span className="text-xs text-gray-500">{row.team.nickname}</span>
                      {isUser && <span className="youMark ml-1">(You)</span>}
                    </span>
                  </span>
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
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

export default SeasonStandingsPage;
