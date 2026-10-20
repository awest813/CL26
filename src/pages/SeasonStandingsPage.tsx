import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import TeamLogo from '../components/TeamLogo';
import { selectConferenceStandings, selectOverallStandings } from '../features/season/seasonSlice';
import { useAppSelector } from '../store/hooks';
import PageHeader from '../components/PageHeader';

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
  const overallWrapRef = useRef<HTMLDivElement>(null);

  function scrollToUserRow() {
    const wrap = overallWrapRef.current;
    const row = wrap?.querySelector<HTMLTableRowElement>('[data-user-row]');
    if (!wrap || !row) return;
    // Scroll only the table box, leaving the page where it is.
    const rowTop = row.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop;
    wrap.scrollTo({ top: Math.max(0, rowTop - wrap.clientHeight / 2), behavior: 'smooth' });
  }

  return (
    <div className="pageStack">
      <PageHeader
        eyebrow="Season"
        title="Standings"
        subtitle={
          <>
            Conference tables sort by conference record, then point differential, overall record, and school name.
            Overall tables sort by record, then point differential and school name.
          </>
        }
      />

      <div className="card">
        <div className="standingsToolbar">
          <h3 className="m-0">Conference standings</h3>
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
          <caption className="sr-only">Conference standings</caption>
          <thead>
            <tr>
              <th scope="col">Team</th>
              <th scope="col" className="num">Conf</th>
              <th scope="col" className="num">Overall</th>
              <th scope="col" className="num hideNarrow">PF</th>
              <th scope="col" className="num hideNarrow">PA</th>
              <th scope="col" className="num">Diff</th>
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
                <td className="num font-semibold">
                  {row.record.confWins}-{row.record.confLosses}
                </td>
                <td className="num">
                  {row.record.wins}-{row.record.losses}
                </td>
                <td className="num hideNarrow">{row.record.pointsFor}</td>
                <td className="num hideNarrow">{row.record.pointsAgainst}</td>
                <td className={`num ${row.record.pointsFor - row.record.pointsAgainst >= 0 ? 'text-green-600' : 'text-red-500'}`}>
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
        <h3 className="m-0 mb-2">Overall standings</h3>
        {userOverall && (
          <p className="text-sm text-gray-600 mt-0 mb-2">
            Your program is {ordinal(userOverallIndex + 1)} overall ({userOverall.record.wins}–{userOverall.record.losses}).{' '}
            <button type="button" className="textButton" onClick={scrollToUserRow}>
              Show your row
            </button>
          </p>
        )}
        <div className="dataTableWrap dataTableWrap-tall" ref={overallWrapRef}>
        <table>
          <caption className="sr-only">Overall league standings</caption>
          <thead>
            <tr>
              <th scope="col" className="num">#</th>
              <th scope="col">Team</th>
              <th scope="col" className="num">W-L</th>
              <th scope="col" className="num">Conf</th>
              <th scope="col" className="num">Diff</th>
            </tr>
          </thead>
          <tbody>
            {overall.map((row, index) => {
              const isUser = row.team.id === selectedTeamId;
              return (
              <tr key={row.team.id} className={isUser ? 'youRow' : undefined} data-user-row={isUser || undefined}>
                <td className="num text-gray-500">{index + 1}</td>
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
                <td className="num font-semibold">
                  {row.record.wins}-{row.record.losses}
                </td>
                <td className="num">
                  {row.record.confWins}-{row.record.confLosses}
                </td>
                <td className={`num ${row.pointDiff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
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
