import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { resetCoach } from '../features/coach/coachSlice';
import { resetSeason } from '../features/season/seasonSlice';
import { persistor } from '../store/persistor';

type DashboardAction = {
  label: string;
  link: string;
  primary: boolean;
};

const PHASE_STATUS_LABEL: Record<string, string> = {
  PRE: 'Pre-Season',
  PLAYOFF: 'Playoffs',
  OFFSEASON: 'Offseason',
};

function Home() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const season = useAppSelector(state => state.season);
  const coach = useAppSelector(state => state.coach);
  const careerReady = coach.onboardingStep === 'READY';
  const { year, phase, currentWeekIndex, seasonSeed } = season;
  const seasonStarted = phase !== 'PRE';

  const statusLabel =
    phase === 'REGULAR' ? `Week ${currentWeekIndex + 1}` : (PHASE_STATUS_LABEL[phase] ?? phase);

  const primaryAction: DashboardAction = (() => {
    if (phase === 'PRE') return { label: 'Start New Season', link: '/season', primary: true };
    if (phase === 'REGULAR') return { label: `Go to Week ${currentWeekIndex + 1}`, link: '/season', primary: true };
    if (phase === 'PLAYOFF') return { label: 'Go to Playoffs', link: '/playoffs', primary: true };
    if (phase === 'OFFSEASON') {
      if (careerReady) return { label: 'Finalize Offseason', link: '/career', primary: true };
      return { label: 'Review Season', link: '/season', primary: false };
    }
    return { label: 'View Season', link: '/season', primary: false };
  })();

  const secondaryAction: DashboardAction = careerReady
    ? { label: 'Coach Office', link: '/career', primary: false }
    : { label: 'Career Setup', link: '/career/setup', primary: false };

  function handleNewGame() {
    const confirmed = window.confirm(
      'Start a new game? This will permanently erase your current save — all season progress, coach career data, and recruits will be lost.',
    );
    if (!confirmed) return;
    dispatch(resetCoach());
    dispatch(resetSeason());
    persistor.purge().then(() => {
      navigate('/career/setup');
    }).catch(() => {
      // Purge failed — state resets still applied in-memory; proceed to setup so
      // the user can start fresh even if localStorage couldn't be cleared.
      navigate('/career/setup');
    });
  }

  return (
    <div className="pageStack">
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-inner">
          <p className="home-hero-eyebrow">CL26 · 128 fictional programs · deterministic lacrosse</p>
          <h2 id="home-hero-title" className="home-hero-title">
            Own the clipboard. Build the dynasty.
          </h2>
          <p className="home-hero-lede">
            Run your fictional program through polls, recruiting swings, and a full postseason bracket—deterministic sim
            logic, one save in the browser.
          </p>
          <div className="home-hero-actions">
            <Link to={primaryAction.link} className={`btn ${primaryAction.primary ? 'btn-primary' : ''}`}>
              {primaryAction.label}
            </Link>
            <Link to={secondaryAction.link} className="btn">
              {secondaryAction.label}
            </Link>
          </div>
        </div>
      </section>

      <section className="card card-elevated">
        <h2 className="sectionTitle">Season snapshot</h2>
        <p className="sectionSubtitle">Where your save stands right now.</p>

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
            <dt className="stat-label">Seed</dt>
            <dd className="value value-compact">{seasonSeed || '-'}</dd>
          </div>
        </dl>
      </section>

      <section className="card card-elevated">
        <h3 className="sectionTitle">Quick Actions</h3>
        <div className="link-grid">
          {careerReady && (
            <Link to="/career/week" className="link-card">
              <strong>Weekly Hub</strong>
              <div className="link-card-meta">Decisions &amp; matchup prep</div>
            </Link>
          )}
          <Link to={careerReady ? '/career' : '/career/setup'} className="link-card">
            <strong>{careerReady ? 'Coach Office' : 'Career Setup'}</strong>
            <div className="link-card-meta">{careerReady ? 'Manage recruiting &amp; status' : 'Create your coach profile'}</div>
          </Link>
          <Link to="/conferences" className="link-card">
            <strong>Conferences</strong>
            <div className="link-card-meta">Browse all teams by conference</div>
          </Link>
          <Link to="/season/standings" className="link-card">
            <strong>League Standings</strong>
            <div className="link-card-meta">Conference and overall records</div>
          </Link>
          <Link to="/rankings" className="link-card">
            <strong>Top 25 Poll</strong>
            <div className="link-card-meta">Poll movement and playoff projection</div>
          </Link>
          {seasonStarted && (
            <Link to="/playoffs" className="link-card">
              <strong>Playoff Bracket</strong>
              <div className="link-card-meta">Championship path</div>
            </Link>
          )}
        </div>
      </section>

      <section className="card">
        <h3 className="sectionTitle">New Game</h3>
        <p className="sectionSubtitle">
          Erase your current save and start fresh with a new coach and program. This cannot be undone.
        </p>
        <div style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-danger" onClick={handleNewGame}>
            Reset Save &amp; Start New Game
          </button>
        </div>
      </section>
    </div>
  );
}

export default Home;
