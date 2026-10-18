import { NavLink, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import { selectIsCareerReady } from '../../features/coach/coachSlice';

type LeftNavBarProps = {
  isMenuOpen: boolean;
  onNavigate?: () => void;
};

type NavItem = {
  to: string;
  label: string;
  hint: string;
  end?: boolean;
  prefix?: string;
};

function latestResultsWeek(phase: string, currentWeekIndex: number, scheduleLength: number): number {
  if (scheduleLength <= 0) return 0;
  const lastIndex = scheduleLength - 1;
  if (phase === 'PRE') return 0;
  if (phase === 'REGULAR') return currentWeekIndex > 0 ? Math.min(currentWeekIndex - 1, lastIndex) : 0;
  return lastIndex;
}

function LeftNavBar({ isMenuOpen, onNavigate }: LeftNavBarProps) {
  const location = useLocation();
  const currentWeekIndex = useAppSelector((state) => state.season.currentWeekIndex);
  const scheduleLength = useAppSelector((state) => state.season.scheduleByWeek.length);
  const phase = useAppSelector((state) => state.season.phase);
  const careerReady = useAppSelector(selectIsCareerReady);
  const resultsWeek = latestResultsWeek(phase, currentWeekIndex, scheduleLength);

  const navSections: Array<{ title: string; items: NavItem[] }> = [
    {
      title: 'Program',
      items: [
        { to: '/', label: 'Overview', hint: 'Where the save stands', end: true },
        { to: '/career/week', label: 'Weekly Hub', hint: 'Practice, tactics, sim' },
        { to: '/career', label: 'Coach Office', hint: 'Job, recruiting, offseason', end: true },
        { to: '/career/recruiting', label: 'Recruiting', hint: 'Board and pitches' },
        { to: '/career/roster', label: 'Roster', hint: 'Depth chart' },
      ],
    },
    {
      title: 'Season',
      items: [
        { to: '/season', label: 'Dashboard', hint: 'Schedule and controls', end: true },
        {
          to: `/season/week/${resultsWeek}`,
          label: 'Results',
          hint: scheduleLength > 0 ? `Week ${resultsWeek + 1}` : 'Scores',
          prefix: '/season/week',
        },
        { to: '/season/standings', label: 'Standings', hint: 'Conference race' },
        { to: '/rankings', label: 'Poll', hint: 'Top 25 and field' },
        { to: '/playoffs', label: 'Playoffs', hint: '12-team bracket' },
      ],
    },
    {
      title: 'League',
      items: [
        { to: '/conferences', label: 'Conferences', hint: '128 programs' },
        { to: '/exhibition', label: 'Exhibition', hint: 'One-game sandbox' },
      ],
    },
  ];

  const coachProfile = useAppSelector((state) => state.coach.profile);
  const selectedTeamId = useAppSelector((state) => state.coach.selectedTeamId);
  const teams = useAppSelector((state) => state.league.teams);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;

  return (
    <nav className={`leftNav dynastySideNav ${isMenuOpen ? 'leftNav-open' : ''}`} aria-label="Primary">
      <div className="dynastyCoachCard">
        <p className="dynastyCoachLabel">Head Coach</p>
        <h3>{coachProfile?.name ?? 'No coach yet'}</h3>
        <p>{selectedTeam ? `${selectedTeam.schoolName} ${selectedTeam.nickname}` : 'No program selected'}</p>
        <NavLink to="/career/setup" className="navProfileLink" onClick={onNavigate}>
          {careerReady ? 'Edit profile' : 'Set up career'}
        </NavLink>
      </div>

      {navSections.map((section) => (
        <div key={section.title} className="navSection dynastyNavSection">
          <p className="navSectionTitle">{section.title}</p>
          {section.items.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) => {
                const prefixActive = item.prefix ? location.pathname.startsWith(item.prefix) : false;
                return isActive || prefixActive ? 'navLink navLink-active' : 'navLink';
              }}
              onClick={onNavigate}
            >
              <span className="navLinkTitle">{item.label}</span>
              <span className="sr-only">{item.hint}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default LeftNavBar;
