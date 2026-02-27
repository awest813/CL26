import { Link, useLocation } from 'react-router-dom';
import { setSidebarOpen } from '../../features/ui/uiSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';

function Header() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const season = useAppSelector((state) => state.season);
  const coach = useAppSelector((state) => state.coach);
  const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen);

  const seasonLabel =
    season.phase === 'REGULAR'
      ? `Week ${season.currentWeekIndex + 1}`
      : season.phase === 'PRE'
        ? 'Preseason'
        : season.phase === 'PLAYOFF'
          ? 'Playoffs'
          : 'Offseason';

  const sectionName = location.pathname === '/'
    ? 'Dashboard'
    : location.pathname.split('/').filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(' / ');

  return (
    <header className="header appHeader">
      <div>
        <p className="eyebrow">College Lacrosse Head Coach Sim</p>
        <h1>Front Office Command Center</h1>
        <p className="muted text-sm m-0">Current area: {sectionName}</p>
      </div>
      <div className="headerMeta">
        <button type="button" className="btn text-sm" onClick={() => dispatch(setSidebarOpen(!sidebarOpen))}>
          {sidebarOpen ? 'Hide Menu' : 'Show Menu'}
        </button>
        <span className="badge">{season.year} • {seasonLabel}</span>
        <span className="badge">Coach: {coach.profile?.name ?? 'Unassigned'}</span>
        <Link to="/career" className="btn btn-primary text-sm">Career HQ</Link>
      </div>
    </header>
  );
}

export default Header;
