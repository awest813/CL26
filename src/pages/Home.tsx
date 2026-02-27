import { Link } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';

function Home() {
  const season = useAppSelector((state) => state.season);
  const coach = useAppSelector((state) => state.coach);
  const { year, phase, currentWeekIndex, seasonSeed } = season;

  const statusText =
    phase === 'PRE'
      ? 'Pre-Season'
      : phase === 'REGULAR'
        ? `Week ${currentWeekIndex + 1}`
        : phase === 'PLAYOFF'
          ? 'Playoffs'
          : 'Offseason';

  const action =
    phase === 'PRE'
      ? { label: 'Start New Season', link: '/season', primary: true }
      : phase === 'REGULAR'
        ? { label: `Go to Week ${currentWeekIndex + 1}`, link: '/season', primary: true }
        : phase === 'PLAYOFF'
          ? { label: 'Go to Playoffs', link: '/playoffs', primary: true }
          : { label: 'Review Season', link: '/season', primary: false };

  return (
    <div className="flex-col gap-4">
      <section className="card dashboardHero">
        <div>
          <p className="eyebrow">Session 3 / 4</p>
          <h2>UI + Menu + Career Systems Expansion</h2>
          <p className="muted">
            Session 3 layers in career strategy controls and progression-facing context while preserving deterministic sim boundaries.
          </p>
        </div>
        <Link to={action.link} className={`btn ${action.primary ? 'btn-primary' : ''}`}>
          {action.label}
        </Link>
      </section>

      <section className="card">
        <h3 className="m-0">League Pulse</h3>
        <div className="stat-row">
          <div className="stat-item">
            <label>Year</label>
            <span className="value">{year}</span>
          </div>
          <div className="stat-item">
            <label>Status</label>
            <span className="value">{statusText}</span>
          </div>
          <div className="stat-item">
            <label>Seed</label>
            <span className="value" style={{ fontSize: '1rem' }}>{seasonSeed || '-'}</span>
          </div>
          <div className="stat-item">
            <label>Coach Setup</label>
            <span className="value" style={{ fontSize: '1rem' }}>{coach.profile ? 'Ready' : 'Incomplete'}</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h3>Quick Actions</h3>
        <div className="link-grid">
          <Link to="/career" className="link-card">
            <strong>Career HQ</strong>
            <div>Recruiting board, weekly progression, commitments.</div>
          </Link>
          <Link to="/season" className="link-card">
            <strong>Season Center</strong>
            <div>Advance weeks and track core outcomes.</div>
          </Link>
          <Link to="/conferences" className="link-card">
            <strong>Conference Browser</strong>
            <div>Explore all programs and standings context.</div>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default Home;
