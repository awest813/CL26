import { Link } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import { selectSeasonSummary, selectTop12Projection, selectTeamRecords, selectUserConferenceStanding } from '../../features/season/seasonSlice';
import { useMemo } from 'react';

function ordinalSuffix(n: number): string {
  if (n === 1) return 'st';
  if (n === 2) return 'nd';
  if (n === 3) return 'rd';
  return 'th';
}

function standingClassName(place: number): string {
  if (place <= 2) return 'standing-good';
  if (place <= 4) return 'standing-watch';
  return 'standing-danger';
}

function RightNavBar() {
  const summary = useAppSelector(selectSeasonSummary);
  const onboardingStep = useAppSelector((state) => state.coach.onboardingStep);
  const selectedTeamId = useAppSelector((state) => state.coach.selectedTeamId);
  const teams = useAppSelector((state) => state.league.teams);
  const conferences = useAppSelector((state) => state.league.conferences);
  const records = useAppSelector(selectTeamRecords);
  const top12 = useAppSelector(selectTop12Projection);
  const confStanding = useAppSelector(selectUserConferenceStanding);

  const seasonStarted = summary.phase !== 'PRE';
  const careerReady = onboardingStep === 'READY';

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  const userConference = useMemo(
    () => (selectedTeam ? conferences.find((c) => c.id === selectedTeam.conferenceId) ?? null : null),
    [conferences, selectedTeam],
  );

  const userRecord = selectedTeamId ? records[selectedTeamId] : null;
  const userSeed = selectedTeamId
    ? top12.find((s) => s.teamId === selectedTeamId)?.rank ?? null
    : null;

  const phaseLabel: Record<string, string> = {
    PRE: 'Preseason',
    REGULAR: `Week ${summary.currentWeekIndex + 1} of 12`,
    PLAYOFF: 'College Lacrosse Playoff',
    OFFSEASON: 'Offseason',
  };

  return (
    <aside className="rightNav dynastyRightRail">
      <div className="rightNavSection dynastyPanel">
        <h3 className="m-0">Season Status</h3>
        <p className="m-0 dynastyPanelMuted">
          {summary.year} · {phaseLabel[summary.phase] ?? summary.phase}
        </p>
      </div>

      {careerReady && selectedTeam && (
        <div className="rightNavSection dynastyPanel">
          <h3 className="m-0 dynastyPanelSubheading">My Program</h3>
          <p className="m-0 dynastyPanelTeamName">
            {selectedTeam.schoolName} {selectedTeam.nickname}
          </p>
          {userRecord && (
            <p className="m-0 dynastyPanelMuted dynastyPanelRecord">
              {userRecord.wins}–{userRecord.losses}
              {userRecord.confWins + userRecord.confLosses > 0
                ? ` · ${userRecord.confWins}–${userRecord.confLosses} conf`
                : ''}
              {userSeed != null ? ` · #${userSeed} seed` : ''}
            </p>
          )}
          {confStanding && seasonStarted && (
            <p className={`m-0 text-xs mt-1 font-semibold ${standingClassName(confStanding.place)}`}>
              {confStanding.place === 1 ? '🏆 ' : ''}
              {confStanding.place}{ordinalSuffix(confStanding.place)} in {userConference?.name ?? 'Conference'}
            </p>
          )}
        </div>
      )}

      <div className="rightNavSection dynastyPanel">
        <h3 className="m-0">Quick Actions</h3>
        <div className="flex flex-col gap-2 mt-2">
          {careerReady && (
            <Link to="/career/week" className="btn dynastyRailBtn">
              Weekly Hub
            </Link>
          )}
          <Link to={careerReady ? '/season' : '/career/setup'} className="btn dynastyRailBtn">
            {careerReady ? 'Season Hub' : 'Finish Career Setup'}
          </Link>
          <Link to={careerReady ? '/career' : '/career/setup'} className="btn dynastyRailBtn">
            {careerReady ? 'Coach Office' : 'Create Coach Profile'}
          </Link>
          <Link to="/rankings" className="btn dynastyRailBtn">
            Top 25 Poll
          </Link>
          {seasonStarted && (
            <Link to="/playoffs" className="btn dynastyRailBtn">
              Playoff Bracket
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}

export default RightNavBar;
