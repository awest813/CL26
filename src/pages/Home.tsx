import { Link } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';

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
  const season = useAppSelector(state => state.season);
  const hasCareerTeam = useAppSelector((state) => Boolean(state.coach.selectedTeamId));
  const { year, phase, currentWeekIndex, seasonSeed } = season;

  const statusLabel =
    phase === 'REGULAR' ? `Week ${currentWeekIndex + 1}` : (PHASE_STATUS_LABEL[phase] ?? phase);

  const action: DashboardAction = (() => {
    if (phase === 'PRE') return { label: 'Start New Season', link: '/season', primary: true };
    if (phase === 'REGULAR') return { label: `Go to Week ${currentWeekIndex + 1}`, link: '/season', primary: true };
    if (phase === 'PLAYOFF') return { label: 'Go to Playoffs', link: '/playoffs', primary: true };
    if (phase === 'OFFSEASON') {
      if (hasCareerTeam) return { label: 'Finalize Offseason', link: '/career', primary: true };
      return { label: 'Review Season', link: '/season', primary: false };
    }
    return { label: 'View Season', link: '/season', primary: false };
  })();

  return (
    <div className="pageStack">
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-inner">
          <p className="home-hero-eyebrow">128 teams · 12-game season · 12-team playoff</p>
          <h2 id="home-hero-title" className="home-hero-title">
            Own the clipboard. Build the dynasty.
          </h2>
          <p className="home-hero-lede">
            Run your fictional program through polls, recruiting swings, and a full postseason bracket—deterministic sim
            logic, one save in the browser.
          </p>
          <div className="home-hero-actions">
            <Link to={action.link} className={`btn ${action.primary ? 'btn-primary' : ''}`}>
              {action.label}
            </Link>
            <Link to="/career" className="btn">
              Coach office
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
          <Link to="/career" className="link-card">
            <strong>Coach Career</strong>
            <div className="link-card-meta">Manage recruiting &amp; status</div>
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
            <strong>Rankings &amp; Polls</strong>
            <div className="link-card-meta">Top 25 and playoff projection</div>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default Home;
