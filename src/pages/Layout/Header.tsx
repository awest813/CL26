import { Link } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';

function seasonPhaseLabel(phase: string, currentWeekIndex: number, scheduleLength: number): string {
  if (phase === 'PRE') return 'Preseason';
  if (phase === 'REGULAR') {
    const week = Math.min(currentWeekIndex + 1, Math.max(scheduleLength, 1));
    return `Week ${week} of ${Math.max(scheduleLength, 12)}`;
  }
  if (phase === 'PLAYOFF') return 'Playoffs';
  if (phase === 'OFFSEASON') return 'Offseason';
  return phase;
}

function continueTarget(phase: string, onboardingReady: boolean): { path: string; label: string } {
  if (!onboardingReady) return { path: '/career/setup', label: 'Start Career' };
  if (phase === 'REGULAR') return { path: '/career/week', label: 'Continue' };
  if (phase === 'PLAYOFF') return { path: '/playoffs', label: 'Continue' };
  if (phase === 'OFFSEASON') return { path: '/career', label: 'Continue' };
  return { path: '/career', label: 'Continue' };
}

function Header() {
  const onboardingStep = useAppSelector((state) => state.coach.onboardingStep);
  const selectedTeamId = useAppSelector((state) => state.coach.selectedTeamId);
  const teams = useAppSelector((state) => state.league.teams);
  const season = useAppSelector((state) => state.season);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const onboardingReady = onboardingStep === 'READY';
  const continueAction = continueTarget(season.phase, onboardingReady);
  const phaseLabel = seasonPhaseLabel(season.phase, season.currentWeekIndex, season.scheduleByWeek.length);

  return (
    <header className="header dynastyHeader">
      <div className="dynastyBrandLockup">
        <div className="lacrosseLogoMark" aria-hidden="true">
          <span>CL</span>
        </div>
        <div>
          <p className="dynastyEyebrow">Fictional College Lacrosse</p>
          <h1 className="dynastyTitle">CL26 Head Coach</h1>
        </div>
      </div>
      <div className="dynastyHeaderMeta">
        <div className="dynastyMetaCard">
          <span className="dynastyMetaLabel">Program</span>
          <strong>{selectedTeam ? `${selectedTeam.schoolName} ${selectedTeam.nickname}` : 'Unassigned'}</strong>
        </div>
        <div className="dynastyMetaCard">
          <span className="dynastyMetaLabel">Season</span>
          <strong>{season.year}</strong>
          <small>{phaseLabel}</small>
        </div>
        <Link to={continueAction.path} className="btn btn-primary dynastyActionBtn">
          {continueAction.label}
        </Link>
      </div>
    </header>
  );
}

export default Header;
