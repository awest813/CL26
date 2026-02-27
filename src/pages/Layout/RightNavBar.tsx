import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useAppSelector } from '../../store/hooks';

function RightNavBar() {
  const teams = useAppSelector((state) => state.league.teams);
  const coach = useAppSelector((state) => state.coach);
  const season = useAppSelector((state) => state.season);

  const selectedTeamName = useMemo(() => {
    if (!coach.selectedTeamId) return 'Not selected';
    return teams.find((team) => team.id === coach.selectedTeamId)?.schoolName ?? 'Unknown';
  }, [coach.selectedTeamId, teams]);

  const signedCount = coach.recruitPool.filter(
    (recruit) => recruit.committedTeamId === coach.selectedTeamId,
  ).length;

  return (
    <aside className="rightNav">
      <h3>Career Snapshot</h3>
      <div className="sideStats">
        <div>
          <span>Program</span>
          <strong>{selectedTeamName}</strong>
        </div>
        <div>
          <span>Recruiting Week</span>
          <strong>{coach.recruitingWeekIndex + 1}</strong>
        </div>
        <div>
          <span>Board Size</span>
          <strong>{coach.boardRecruitIds.length} / 25</strong>
        </div>
        <div>
          <span>Committed</span>
          <strong>{signedCount} / 12</strong>
        </div>
      </div>
      <div className="separator" />
      <h3>Session 3 Focus</h3>
      <ul>
        <li>Tactical identity controls</li>
        <li>Expectation-aware career context</li>
        <li>Momentum-focused recruiting insights</li>
      </ul>
      <Link className="btn text-sm" to={season.phase === 'PLAYOFF' ? '/playoffs' : '/season'}>
        Open {season.phase === 'PLAYOFF' ? 'Playoffs' : 'Season Center'}
      </Link>
    </aside>
  );
}

export default RightNavBar;
