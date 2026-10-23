import { Link } from 'react-router-dom';
import type { Conference, PostseasonAwards, SeasonAward, Team } from '../types/sim';

type AwardsPanelProps = {
  year: number;
  national: SeasonAward[];
  allAmericans?: { first: SeasonAward[]; second: SeasonAward[] };
  postseason?: PostseasonAwards;
  teams: Team[];
  conferences: Conference[];
  userTeamId: string;
  /** The user's conference, shown first in the conference awards. */
  userConferenceId: string | null;
};

/** The season's awards as they are handed out: national awards and All-Americans, then the postseason honors. */
function AwardsPanel({ year, national, allAmericans, postseason, teams, conferences, userTeamId, userConferenceId }: AwardsPanelProps) {
  const teamName = (teamId: string) => teams.find((team) => team.id === teamId)?.schoolName ?? 'Unknown';
  const yourAllAmericans = [
    ...(allAmericans?.first ?? []).filter((row) => row.teamId === userTeamId).map((row) => ({ ...row, team: 'First team' })),
    ...(allAmericans?.second ?? []).filter((row) => row.teamId === userTeamId).map((row) => ({ ...row, team: 'Second team' })),
  ];
  const conferenceAwards = Object.entries(postseason?.conferencePlayers ?? {})
    .sort(([a], [b]) => (a === userConferenceId ? -1 : b === userConferenceId ? 1 : a.localeCompare(b)));
  const yourConference = conferenceAwards.find(([conferenceId]) => conferenceId === userConferenceId);
  const yourConferenceWins = conferenceAwards.filter(([, award]) => award.teamId === userTeamId).length;
  const coach = postseason?.coachOfTheYear;
  const mop = postseason?.mostOutstandingPlayer;
  const conferenceName = (conferenceId: string) => conferences.find((conference) => conference.id === conferenceId)?.name ?? conferenceId;

  const honor = (label: string, award: { name: string; teamId: string; detail: string }) => (
    <li key={label} className={`awardRow${award.teamId === userTeamId ? ' awardRow-you' : ''}`}>
      <span className="awardLabel">{label}</span>
      <span>
        <strong>{award.name}</strong>, <Link to={`/team/${award.teamId}`}>{teamName(award.teamId)}</Link>
        <span className="awardDetail">{award.detail}</span>
      </span>
    </li>
  );

  return (
    <section className="card" aria-labelledby="awards-title">
      <div className="cardHeadRow mb-3">
        <h3 id="awards-title" className="m-0 text-base font-bold">{year} awards</h3>
        <Link to="/season/leaders" className="text-sm hover:underline">All awards</Link>
      </div>
      <div className="wireGrid">
        <div>
          <div className="planReadoutLabel">Postseason honors</div>
          <ul className="awardList">
            {coach
              ? honor('Coach of the Year', { name: coach.coachName, teamId: coach.teamId, detail: `${coach.record}, ${coach.detail}` })
              : <li className="awardPending">Coach of the Year is named after the championship.</li>}
            {mop
              ? honor('Most Outstanding Player', { name: mop.name, teamId: mop.teamId, detail: `${mop.position} · ${mop.statLine}` })
              : <li className="awardPending">The championship's Most Outstanding Player is named after the final.</li>}
            {yourConference && honor(`${conferenceName(yourConference[0])} Player of the Year`, {
              name: yourConference[1].name,
              teamId: yourConference[1].teamId,
              detail: `${yourConference[1].position} · ${yourConference[1].statLine}`,
            })}
          </ul>
          <div className="planReadoutLabel mt-3">National awards</div>
          <ul className="awardList">
            {national.map((award) => honor(award.award, { name: award.name, teamId: award.teamId, detail: `${award.position} · ${award.statLine}` }))}
          </ul>
        </div>
        <div className="wireSide">
          <div>
            <div className="planReadoutLabel">Your All-Americans</div>
            {yourAllAmericans.length > 0 ? (
              <ul className="wireMini">
                {yourAllAmericans.map((row) => (
                  <li key={row.playerId}><strong>{row.name}</strong> · {row.award} · {row.team}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 m-0">None this year.</p>
            )}
          </div>
          {conferenceAwards.length > 0 && (
            <div>
              <div className="planReadoutLabel">Conference Players of the Year{yourConferenceWins > 0 ? ' · yours won' : ''}</div>
              <ul className="wireMini">
                {conferenceAwards.slice(0, 6).map(([conferenceId, award]) => (
                  <li key={conferenceId} className={award.teamId === userTeamId ? 'youMark' : undefined}>
                    {conferenceName(conferenceId)}: {award.name} ({teamName(award.teamId)})
                  </li>
                ))}
                {conferenceAwards.length > 6 && (
                  <li><Link to="/season/leaders" className="hover:underline">+{conferenceAwards.length - 6} more conferences</Link></li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default AwardsPanel;
