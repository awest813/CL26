import { Link, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import TeamLogo from '../components/TeamLogo';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectIsCareerReady } from '../features/coach/coachSlice';
import { selectRankTrends, selectTeamRecords, selectTop12Projection, selectUserConferenceStanding } from '../features/season/seasonSlice';
import { adGoalCopy } from '../sim/weeklyDesk';
import { eraseSave } from '../features/settings/eraseSave';
import { seasonPhaseHomeStatus, seasonPhaseLabel } from '../lib/seasonLabels';

type DashboardAction = {
  label: string;
  link: string;
  primary: boolean;
};

function ordinal(n: number): string {
  const mod = n % 100;
  if (mod >= 11 && mod <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function Home() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const season = useAppSelector((state) => state.season);
  const careerReady = useAppSelector(selectIsCareerReady);
  const coach = useAppSelector((state) => state.coach);
  const teams = useAppSelector((state) => state.league.teams);
  const conferences = useAppSelector((state) => state.league.conferences);
  const records = useAppSelector(selectTeamRecords);
  const top12 = useAppSelector(selectTop12Projection);
  const top25 = useAppSelector(selectRankTrends);
  const confStanding = useAppSelector(selectUserConferenceStanding);
  const { year, phase, currentWeekIndex, seasonSeed } = season;
  const seasonStarted = phase !== 'PRE';

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === coach.selectedTeamId) ?? null,
    [teams, coach.selectedTeamId],
  );
  const conferenceName = selectedTeam
    ? conferences.find((conference) => conference.id === selectedTeam.conferenceId)?.name ?? selectedTeam.conferenceId
    : null;
  const record = coach.selectedTeamId ? records[coach.selectedTeamId] : null;
  const projectedSeed = coach.selectedTeamId
    ? top12.find((row) => row.teamId === coach.selectedTeamId)?.seed ?? null
    : null;
  const pollRank = seasonStarted && coach.selectedTeamId
    ? top25.find((row) => row.teamId === coach.selectedTeamId)?.rank ?? null
    : null;
  const adGoal = coach.programExpectations
    ? adGoalCopy({
        wins: record?.wins ?? 0,
        winTarget: coach.programExpectations.winTarget,
        pollRank,
        pollKnown: seasonStarted,
        rankTarget: coach.programExpectations.rankTarget,
      })
    : null;
  const statusLabel = seasonPhaseHomeStatus(phase, currentWeekIndex);
  const phaseLabel = seasonPhaseLabel(phase, currentWeekIndex, season.scheduleByWeek.length);

  const primaryAction: DashboardAction = (() => {
    if (phase === 'PRE') {
      if (!careerReady) return { label: 'Start career', link: '/career/setup', primary: true };
      return { label: 'Begin season', link: '/season', primary: true };
    }
    if (phase === 'REGULAR') {
      if (careerReady) return { label: `Open week ${currentWeekIndex + 1}`, link: '/career/week', primary: true };
      return { label: `Open week ${currentWeekIndex + 1}`, link: '/season', primary: true };
    }
    if (phase === 'PLAYOFF') {
      if (careerReady) return { label: 'Next round', link: '/career/week', primary: true };
      return { label: 'Open the playoffs', link: '/playoffs', primary: true };
    }
    if (phase === 'OFFSEASON') {
      if (careerReady) return { label: 'Offseason', link: '/career/week', primary: true };
      return { label: 'Review the season', link: '/season', primary: false };
    }
    return { label: 'Season dashboard', link: '/season', primary: false };
  })();

  const secondaryAction: DashboardAction = careerReady
    ? { label: 'Coach Office', link: '/career', primary: false }
    : { label: 'How a season works', link: '/season', primary: false };

  function handleNewGame() {
    const confirmed = window.confirm(
      'Start a new game? This will permanently erase your current save — all season progress, coach career data, and recruits will be lost.',
    );
    if (!confirmed) return;
    eraseSave(dispatch).then(() => {
      navigate('/career/setup');
    }).catch(() => {
      navigate('/career/setup');
    });
  }

  return (
    <div className="pageStack">
      {careerReady && selectedTeam ? (
        <section className="commandBoard" aria-labelledby="home-hero-title">
          <div className="commandBoardCopy">
            <p className="commandEyebrow">{conferenceName} · {phaseLabel}</p>
            <div className="programLockup">
              <TeamLogo team={selectedTeam} size="lg" />
              <h2 id="home-hero-title">{selectedTeam.schoolName} {selectedTeam.nickname}</h2>
            </div>
            <p className="commandLede">
              {coach.profile?.name ?? 'Head coach'} · {year} season · {statusLabel}
            </p>
            {adGoal && <p className="commandGoals">AD goal: {adGoal.detail}</p>}
          </div>
          <dl className="commandStats" aria-label="Program snapshot">
            <div>
              <dt>Overall</dt>
              <dd>{record ? `${record.wins}–${record.losses}` : '0–0'}</dd>
            </div>
            <div>
              <dt>Conference</dt>
              <dd>{record ? `${record.confWins}–${record.confLosses}` : '0–0'}</dd>
            </div>
            <div>
              <dt>Place</dt>
              <dd>{confStanding && seasonStarted ? ordinal(confStanding.place) : '—'}</dd>
            </div>
            <div>
              <dt>Field</dt>
              <dd>{!seasonStarted ? '—' : projectedSeed != null ? `#${projectedSeed}` : 'Out'}</dd>
            </div>
          </dl>
          <div className="commandActions">
            <Link to={primaryAction.link} className={`btn ${primaryAction.primary ? 'btn-primary' : ''}`}>
              {primaryAction.label}
            </Link>
            <Link to={secondaryAction.link} className="btn">
              {secondaryAction.label}
            </Link>
            <Link to={`/team/${selectedTeam.id}`} className="btn">
              Program page
            </Link>
          </div>
        </section>
      ) : (
        <section className="home-hero" aria-labelledby="home-hero-title">
          <div className="home-hero-inner">
            <p className="home-hero-eyebrow">128 programs · 12-game season · 12-team playoff</p>
            <h2 id="home-hero-title" className="home-hero-title">
              Take a program. Chase the bracket.
            </h2>
            <p className="home-hero-lede">
              Coach a fictional college lacrosse team through the poll, a recruiting class, and a postseason. The sim is deterministic, and the save stays in this browser.
            </p>
            <div className="home-hero-actions">
              <Link to={primaryAction.link} className={`btn ${primaryAction.primary ? 'btn-primary' : ''}`}>
                {primaryAction.label}
              </Link>
              <Link to="/conferences" className="btn">
                Browse programs
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="card card-elevated">
        <h3 className="sectionTitle">Season</h3>
        <p className="sectionSubtitle">The year, where it stands, and the random seed that drew the schedule.</p>
        <dl className="stat-row" aria-label="Current season status">
          <div className="stat-item">
            <dt className="stat-label">Year</dt>
            <dd className="value">{year}</dd>
          </div>
          <div className="stat-item">
            <dt className="stat-label">Status</dt>
            <dd className="value">{statusLabel}</dd>
          </div>
          <div className="stat-item">
            <dt className="stat-label">Schedule seed</dt>
            <dd className="value value-compact">{seasonStarted ? seasonSeed : '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h3 className="sectionTitle">Around the league</h3>
        <div className="link-grid">
          {careerReady && (
            <Link to="/career/week" className="link-card">
              <strong>Weekly Hub</strong>
              <div className="link-card-meta">Game plan, recruiting hours, and this week’s game</div>
            </Link>
          )}
          <Link to="/season/standings" className="link-card">
            <strong>Standings</strong>
            <div className="link-card-meta">Conference race and overall table</div>
          </Link>
          <Link to="/rankings" className="link-card">
            <strong>Top 25</strong>
            <div className="link-card-meta">Poll, movement, and the projected field</div>
          </Link>
          <Link to="/conferences" className="link-card">
            <strong>Conferences</strong>
            <div className="link-card-meta">Every program, grouped by league</div>
          </Link>
          {seasonStarted && (
            <Link to="/playoffs" className="link-card">
              <strong>Playoffs</strong>
              <div className="link-card-meta">Seeds, byes, and the championship</div>
            </Link>
          )}
          <Link to="/exhibition" className="link-card">
            <strong>Exhibition</strong>
            <div className="link-card-meta">Sim one game without touching the save</div>
          </Link>
        </div>
      </section>

      <section className="card newGameCard">
        <div>
          <h3 className="sectionTitle">New game</h3>
          <p className="sectionSubtitle">
            Erase this save and start with a new coach. Season results, the roster, and the recruiting board all go with it.
          </p>
        </div>
        <button type="button" className="btn btn-danger" onClick={handleNewGame}>
          Reset save
        </button>
      </section>
    </div>
  );
}

export default Home;
