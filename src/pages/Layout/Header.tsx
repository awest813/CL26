import type { Ref } from 'react';
import { Link, useLocation } from 'react-router-dom';
import TeamLogo from '../../components/TeamLogo';
import { IconClose, IconMenu } from '../../components/UiIcons';
import { useAppSelector } from '../../store/hooks';
import { selectIsCareerReady } from '../../features/coach/coachSlice';
import { selectTeamRecords, selectTop12Projection, selectUserConferenceStanding } from '../../features/season/seasonSlice';
import { seasonPhaseLabel } from '../../lib/seasonLabels';

function continueTarget(phase: string, onboardingReady: boolean): { path: string; label: string } {
  if (!onboardingReady) return { path: '/career/setup', label: 'Start career' };
  if (phase === 'PRE') return { path: '/season', label: 'Begin season' };
  if (phase === 'REGULAR') return { path: '/career/week', label: 'Weekly Hub' };
  if (phase === 'PLAYOFF') return { path: '/career/week', label: 'Next round' };
  if (phase === 'OFFSEASON') return { path: '/career/week', label: 'Offseason' };
  return { path: '/career', label: 'Continue' };
}

function ordinal(n: number): string {
  const mod = n % 100;
  if (mod >= 11 && mod <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

type HeaderProps = {
  menuOpen: boolean;
  onToggleMenu: () => void;
  menuButtonRef: Ref<HTMLButtonElement>;
};

function Header({ menuOpen, onToggleMenu, menuButtonRef }: HeaderProps) {
  const onboardingReady = useAppSelector(selectIsCareerReady);
  const selectedTeamId = useAppSelector((state) => state.coach.selectedTeamId);
  const teams = useAppSelector((state) => state.league.teams);
  const season = useAppSelector((state) => state.season);
  const records = useAppSelector(selectTeamRecords);
  const top12 = useAppSelector(selectTop12Projection);
  const confStanding = useAppSelector(selectUserConferenceStanding);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const { pathname } = useLocation();
  const continueAction = continueTarget(season.phase, onboardingReady);
  const onContinuePage = pathname === continueAction.path;
  const phaseLabel = seasonPhaseLabel(season.phase, season.currentWeekIndex, season.scheduleByWeek.length);
  const record = selectedTeamId ? records[selectedTeamId] : null;
  const projectedSeed = selectedTeamId ? top12.find((row) => row.teamId === selectedTeamId)?.seed ?? null : null;
  // Once the bracket is set the seed is real; before that it is a projection.
  const bracketSeed = selectedTeamId
    ? season.playoffs?.seeds.find((row) => row.teamId === selectedTeamId)?.seed ?? null
    : null;
  const seasonStarted = season.phase !== 'PRE';
  const seedLabel = season.playoffs
    ? bracketSeed != null ? `#${bracketSeed} seed` : null
    : (season.phase === 'REGULAR' || season.phase === 'PLAYOFF') && projectedSeed != null ? `#${projectedSeed} proj` : null;

  const recordLine = record
    ? [
        `${record.wins}–${record.losses}`,
        confStanding && seasonStarted && record.wins + record.losses > 0 ? `${ordinal(confStanding.place)} conf` : null,
        seedLabel,
      ].filter(Boolean).join(' · ')
    : 'No games yet';

  return (
    <header className="header dynastyHeader">
      <div className="dynastyBrandLockup">
        <button
          ref={menuButtonRef}
          type="button"
          className="menuToggleButton headerMenuButton"
          onClick={onToggleMenu}
          aria-expanded={menuOpen}
          aria-controls="app-primary-menu"
        >
          {menuOpen ? <IconClose className="menuToggleIcon" /> : <IconMenu className="menuToggleIcon" />}
          <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
        </button>
        <Link to="/" className="dynastyBrandLink">
          <div className="lacrosseLogoMark" aria-hidden="true">
            <span>CL</span>
          </div>
          <div>
            <p className="dynastyEyebrow">College Lacrosse</p>
            <h1 className="dynastyTitle">CL26 Head Coach</h1>
          </div>
        </Link>
      </div>
      <div className="dynastyHeaderMeta">
        {selectedTeam ? (
          <Link to={`/team/${selectedTeam.id}`} className="dynastyProgramChip">
            <TeamLogo team={selectedTeam} size="sm" />
            <span className="dynastyProgramText">
              <span className="dynastyMetaLabel">Program</span>
              <strong>{selectedTeam.schoolName}</strong>
              <small>
                {recordLine}
                <span className="dynastyPhaseInline"> · {phaseLabel}</span>
              </small>
            </span>
          </Link>
        ) : (
          <div className="dynastyProgramChip">
            <span className="dynastyMetaLabel">Program</span>
            <strong>Unassigned</strong>
            <small>Choose a school to begin</small>
          </div>
        )}
        <div className="dynastyMetaCard">
          <span className="dynastyMetaLabel">Season</span>
          <strong>{season.year}</strong>
          <small>{phaseLabel}</small>
        </div>
      </div>
      {!onContinuePage && (
        <Link to={continueAction.path} className="btn btn-primary dynastyActionBtn">
          {continueAction.label}
        </Link>
      )}
    </header>
  );
}

export default Header;
