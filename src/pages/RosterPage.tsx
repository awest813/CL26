import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { toggleStarter } from '../features/coach/coachSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { Player, Position } from '../types/sim';
import { getRosterDepthSummary } from '../sim/rosterManagement';

const POSITION_ORDER: Position[] = ['A', 'M', 'D', 'LSM', 'FO', 'G'];

const POSITION_LABELS: Record<Position, string> = {
  A: 'Attack',
  M: 'Midfield',
  D: 'Defense',
  LSM: 'LSM',
  FO: 'Faceoff',
  G: 'Goalie',
};

const STARTER_COUNTS: Record<Position, number> = {
  A: 3,
  M: 3,
  D: 3,
  LSM: 1,
  FO: 1,
  G: 1,
};

const YEAR_LABELS: Record<number, string> = {
  1: 'Fr',
  2: 'So',
  3: 'Jr',
  4: 'Sr',
};

function overallColor(overall: number): string {
  if (overall >= 80) return '#16a34a';
  if (overall >= 70) return '#4ade80';
  if (overall >= 60) return '#f59e0b';
  return '#9ca3af';
}

function StarDisplay({ count }: { count: number }) {
  return <span className="text-yellow-400">{'★'.repeat(count)}</span>;
}

function PlayerRow({
  player,
  isStarter,
  starterCountForPos,
  currentStartersForPos,
  onToggle,
}: {
  player: Player;
  isStarter: boolean;
  starterCountForPos: number;
  currentStartersForPos: number;
  onToggle: (id: string) => void;
}) {
  const canPromote = !isStarter && currentStartersForPos < starterCountForPos;
  const canDemote = isStarter;

  return (
    <tr className={`border-b last:border-0 text-sm ${isStarter ? 'bg-blue-50' : ''}`}>
      <td className="py-1.5 pr-2">
        <span
          className={`inline-block w-16 text-center text-xs font-semibold py-0.5 rounded ${
            isStarter
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {isStarter ? 'Starter' : 'Backup'}
        </span>
      </td>
      <td className="py-1.5 pr-3 font-medium">{player.name}</td>
      <td className="py-1.5 pr-3 text-gray-500 text-xs">{YEAR_LABELS[player.year] ?? `Yr${player.year}`}</td>
      <td className="py-1.5 pr-3 text-gray-500 text-xs">{player.age}</td>
      <td className="py-1.5 pr-3 font-bold" style={{ color: overallColor(player.overall) }}>{player.overall}</td>
      <td className="py-1.5 pr-2 text-xs text-gray-500">{player.shooting}</td>
      <td className="py-1.5 pr-2 text-xs text-gray-500">{player.passing}</td>
      <td className="py-1.5 pr-2 text-xs text-gray-500">{player.speed}</td>
      <td className="py-1.5 pr-2 text-xs text-gray-500">{player.defense}</td>
      <td className="py-1.5 pr-2 text-xs text-gray-500">{player.IQ}</td>
      <td className="py-1.5">
        {(canPromote || canDemote) && (
          <button
            className={`text-xs px-2 py-0.5 rounded border cursor-pointer ${
              isStarter
                ? 'border-gray-300 text-gray-500 hover:bg-gray-100'
                : 'border-blue-300 text-blue-600 hover:bg-blue-50'
            }`}
            onClick={() => onToggle(player.id)}
          >
            {isStarter ? 'Bench' : 'Start'}
          </button>
        )}
      </td>
    </tr>
  );
}

function RosterPage() {
  const dispatch = useAppDispatch();
  const coach = useAppSelector((state) => state.coach);
  const teams = useAppSelector((state) => state.league.teams);
  const season = useAppSelector((state) => state.season);

  const selectedTeam = teams.find((t) => t.id === coach.selectedTeamId) ?? null;

  if (!coach.selectedTeamId || !coach.profile) {
    return <Navigate to="/career/setup" replace />;
  }

  const roster = coach.managedRoster ?? [];
  const starterSet = useMemo(() => new Set(coach.starterIds), [coach.starterIds]);

  const depthSummary = useMemo(
    () => getRosterDepthSummary(roster, coach.starterIds),
    [roster, coach.starterIds],
  );

  const byPosition = useMemo(() => {
    const map: Record<Position, Player[]> = { A: [], M: [], D: [], LSM: [], FO: [], G: [] };
    for (const player of roster) {
      map[player.position]?.push(player);
    }
    // Sort each group: starters first, then by overall desc
    for (const pos of POSITION_ORDER) {
      map[pos].sort((a, b) => {
        const aStarter = starterSet.has(a.id) ? 1 : 0;
        const bStarter = starterSet.has(b.id) ? 1 : 0;
        if (bStarter !== aStarter) return bStarter - aStarter;
        return b.overall - a.overall;
      });
    }
    return map;
  }, [roster, starterSet]);

  const rosterOverall = roster.length > 0
    ? Math.round(roster.reduce((s, p) => s + p.overall, 0) / roster.length)
    : 0;

  const graduatingCount = roster.filter((p) => p.year === 4).length;
  const signedClass = coach.signedRecruitsByYear[season.year] ?? [];

  function onToggle(playerId: string) {
    dispatch(toggleStarter(playerId));
  }

  if (roster.length === 0) {
    return (
      <section className="card">
        <h2>Roster Management</h2>
        <p className="text-gray-500">
          No roster loaded. Complete career setup to generate your team&apos;s roster.
        </p>
        <Link to="/career/setup" className="btn btn-primary">Go to Setup</Link>
      </section>
    );
  }

  return (
    <div className="flex-col gap-4">
      {/* Header */}
      <div className="card">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="m-0 text-xl">
              Roster Management
            </h2>
            <div className="text-sm text-gray-500 mt-0.5">
              {selectedTeam?.schoolName} {selectedTeam?.nickname} &bull; {season.year} Season &bull; {roster.length} players
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 uppercase mb-1">Roster OVR</div>
            <div className="text-2xl font-bold" style={{ color: overallColor(rosterOverall) }}>{rosterOverall}</div>
          </div>
        </div>

        {/* Depth summary grid */}
        <div className="grid grid-cols-6 gap-2 border-t pt-3">
          {depthSummary.map((d) => (
            <div key={d.position} className="text-center">
              <div className="text-xs text-gray-400 font-semibold uppercase">{d.position}</div>
              <div className="text-lg font-bold" style={{ color: overallColor(d.avgOverall) }}>{d.avgOverall}</div>
              <div className="text-xs text-gray-500">{d.starters}S / {d.backups}B</div>
            </div>
          ))}
        </div>
      </div>

      {/* Offseason notes */}
      {season.phase === 'OFFSEASON' && (
        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <h3 className="text-base font-bold mb-2">Offseason Roster Notes</h3>
          <div className="flex gap-6 text-sm">
            <div>
              <div className="text-xs text-gray-400">Graduating Seniors</div>
              <div className="font-semibold text-red-600">{graduatingCount} players leaving</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Incoming Class</div>
              <div className="font-semibold text-green-600">{signedClass.length} recruits signed</div>
              {signedClass.length > 0 && (
                <div className="text-xs text-gray-500 mt-0.5">
                  {signedClass.map((s) => `${s.position} (${'★'.repeat(s.stars)})`).join(' · ')}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-gray-400">Net Roster Change</div>
              <div className={`font-semibold ${signedClass.length - graduatingCount >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                {signedClass.length - graduatingCount >= 0 ? '+' : ''}{signedClass.length - graduatingCount}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Roster by position */}
      {POSITION_ORDER.map((pos) => {
        const players = byPosition[pos];
        if (players.length === 0) return null;
        const starterTarget = STARTER_COUNTS[pos];
        const currentStarters = players.filter((p) => starterSet.has(p.id)).length;

        return (
          <div key={pos} className="card">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-base font-bold m-0">
                {POSITION_LABELS[pos]} ({players.length})
              </h3>
              <span className="text-xs text-gray-400">
                {currentStarters}/{starterTarget} starters set
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b">
                    <th className="pb-1.5 pr-2">Role</th>
                    <th className="pb-1.5 pr-3">Name</th>
                    <th className="pb-1.5 pr-3">Yr</th>
                    <th className="pb-1.5 pr-3">Age</th>
                    <th className="pb-1.5 pr-3">OVR</th>
                    <th className="pb-1.5 pr-2">SHT</th>
                    <th className="pb-1.5 pr-2">PAS</th>
                    <th className="pb-1.5 pr-2">SPD</th>
                    <th className="pb-1.5 pr-2">DEF</th>
                    <th className="pb-1.5 pr-2">IQ</th>
                    <th className="pb-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <PlayerRow
                      key={player.id}
                      player={player}
                      isStarter={starterSet.has(player.id)}
                      starterCountForPos={starterTarget}
                      currentStartersForPos={currentStarters}
                      onToggle={onToggle}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Signed recruits incoming */}
      {signedClass.length > 0 && (
        <div className="card">
          <h3 className="text-base font-bold mb-2">Signed Recruiting Class ({signedClass.length})</h3>
          <p className="text-xs text-gray-500 mb-2">
            These recruits will join the roster at the start of next season.
          </p>
          <div className="flex flex-wrap gap-2">
            {signedClass.map((s) => (
              <div
                key={s.recruitId}
                className="px-3 py-2 rounded border text-sm"
                style={{ borderColor: '#d1d5db' }}
              >
                <div className="font-semibold">{s.position}</div>
                <div><StarDisplay count={s.stars} /></div>
                <div className="text-xs text-gray-400">Yr 2025</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2">
        <Link to="/career" className="text-sm text-blue-600 hover:underline">← Back to Coach Office</Link>
      </div>
    </div>
  );
}

export default RosterPage;
