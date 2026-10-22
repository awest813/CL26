import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { setPlayerRedshirt, toggleStarter } from '../features/coach/coachSlice';
import { activeRoster, canChangeRedshirts, redshirtBlocker } from '../sim/redshirts';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { Player, Position, POSITION_ORDER } from '../types/sim';
import { availabilityWeekKey, injuryTimeline, weeklyScratches, type WeekScratch } from '../sim/injuries';
import { CONFERENCE_SEMIFINAL_KEY } from '../sim/conferenceTournaments';
import { getRosterDepthSummary } from '../sim/rosterManagement';
import { faceoffRating, playerPotential, savingRating } from '../sim/playerSpecialty';
import { playerYearLabel } from '../sim/rosterSummary';
import PageHeader from '../components/PageHeader';

const POSITION_LABELS: Record<Position, string> = {
  A: 'Attack',
  M: 'Midfield',
  D: 'Defense',
  LSM: 'LSM',
  FO: 'Faceoff',
  G: 'Goalie',
};

/** The rating that matters most for a specialist: faceoffs for a faceoff man, saves for a goalie. */
function specialtyRating(player: Player): number | null {
  if (player.position === 'FO') return faceoffRating(player);
  if (player.position === 'G') return savingRating(player);
  return null;
}

function specialtyClass(player: Player): string {
  const rating = specialtyRating(player);
  return rating == null ? '' : ratingClass(rating);
}

const STARTER_COUNTS: Record<Position, number> = {
  A: 3,
  M: 3,
  D: 3,
  LSM: 1,
  FO: 1,
  G: 1,
};

function ratingClass(overall: number): string {
  if (overall >= 80) return 'rating-good';
  if (overall >= 70) return 'rating-solid';
  if (overall >= 60) return 'rating-warning';
  return 'rating-muted';
}

function computeAverageOfThreeAttributes<T>(players: T[], selector: (player: T) => [number, number, number]): number {
  if (players.length === 0) return 0;
  const total = players.reduce((sum, player) => {
    const [first, second, third] = selector(player);
    return sum + first + second + third;
  }, 0);
  return Math.round(total / (3 * players.length));
}

function StarDisplay({ count }: { count: number }) {
  return <span className="text-yellow-400">{'★'.repeat(count)}</span>;
}

function PlayerRow({
  player,
  isStarter,
  injury,
  starterCountForPos,
  currentStartersForPos,
  onToggle,
  redshirtControl,
}: {
  player: Player;
  isStarter: boolean;
  /** This week's injury, when he is out. */
  injury: WeekScratch | null;
  starterCountForPos: number;
  currentStartersForPos: number;
  onToggle: (id: string) => void;
  /** Shown before week 1: redshirt him, or take it back. */
  redshirtControl: { label: string; blocker: string | null; onClick: () => void } | null;
}) {
  const canPromote = !player.redshirt && !isStarter && currentStartersForPos < starterCountForPos;
  const canDemote = isStarter;

  return (
    <tr className={`text-sm ${isStarter ? 'youRow' : ''}`}>
      <td>
        {player.redshirt ? (
          <span className="starterBadge starterBadge-off" title="Sitting out the season to keep a year of eligibility">Redshirt</span>
        ) : (
          <span className={`starterBadge ${isStarter ? 'starterBadge-on' : 'starterBadge-off'}`}>
            {isStarter ? 'Starter' : 'Backup'}
          </span>
        )}
        {injury && (
          <span className="starterBadge starterBadge-out" title={`${injury.injury}, ${injuryTimeline(injury)}`}>
            {injury.weeksLeft == null ? 'Out for year' : `Out ${injury.weeksLeft} wk`}
          </span>
        )}
      </td>
      <td className="font-medium rosterName">{player.name}</td>
      <td className="num text-gray-500 text-xs">{playerYearLabel(player.year, player.redshirtUsed)}</td>
      <td className="num text-gray-500 text-xs">{player.age}</td>
      <td className={`num font-bold ${ratingClass(player.overall)}`} title={`Potential ${playerPotential(player)}`}>{player.overall}</td>
      <td className="num text-xs text-gray-500">{player.shooting}</td>
      <td className="num text-xs text-gray-500">{player.passing}</td>
      <td className="num text-xs text-gray-500">{player.speed}</td>
      <td className="num text-xs text-gray-500">{player.defense}</td>
      <td className="num text-xs text-gray-500">{player.IQ}</td>
      <td className={`num font-bold ${specialtyClass(player)}`}>{specialtyRating(player) ?? ''}</td>
      <td className="text-right">
        {(canPromote || canDemote) && (
          <button
            type="button"
            aria-label={isStarter ? `Bench ${player.name}` : `Start ${player.name}`}
            className={`lineupAction ${isStarter ? 'lineupAction-bench' : ''}`}
            onClick={() => onToggle(player.id)}
          >
            {isStarter ? 'Bench' : 'Start'}
          </button>
        )}
        {redshirtControl && (
          <button
            type="button"
            className="lineupAction lineupAction-bench"
            disabled={redshirtControl.blocker != null}
            title={redshirtControl.blocker ?? undefined}
            aria-label={`${redshirtControl.label}: ${player.name}`}
            onClick={redshirtControl.onClick}
          >
            {redshirtControl.label}
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
  const roster = useMemo(() => coach.managedRoster ?? [], [coach.managedRoster]);
  const starterSet = useMemo(() => new Set(coach.starterIds), [coach.starterIds]);
  const signedClass = coach.signedRecruitsByYear[season.year] ?? [];
  const depthSummary = useMemo(
    () => getRosterDepthSummary(roster, coach.starterIds),
    [roster, coach.starterIds],
  );
  const redshirtsOpen = canChangeRedshirts(season);
  const redshirtCount = roster.filter((player) => player.redshirt).length;
  const scratches = useMemo(() => {
    // Conference championship week has no playoff round yet; read it the way the hub does.
    const championshipWeek = season.phase === 'PLAYOFF' && season.playoffs == null && !season.conferenceTournaments
      && season.completedWeeks >= season.scheduleByWeek.length;
    const weekKey = championshipWeek
      ? CONFERENCE_SEMIFINAL_KEY
      : availabilityWeekKey(season.phase, season.currentWeekIndex, season.playoffs?.currentRound ?? null);
    if (!weekKey || !coach.selectedTeamId || roster.length === 0) return [];
    return weeklyScratches(activeRoster(roster), season.seasonSeed, weekKey, coach.selectedTeamId);
  }, [coach.selectedTeamId, roster, season.completedWeeks, season.conferenceTournaments, season.currentWeekIndex, season.phase, season.playoffs, season.scheduleByWeek.length, season.seasonSeed]);
  const scratchById = useMemo(() => new Map(scratches.map((scratch) => [scratch.playerId, scratch])), [scratches]);

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
  const classBalance = [1, 2, 3, 4].map((year) => ({
    year,
    label: playerYearLabel(year),
    count: roster.filter((player) => player.year === year).length,
  }));
  const offensiveCore = computeAverageOfThreeAttributes(
    roster.filter((player) => player.position === 'A' || player.position === 'M'),
    (player) => [player.shooting, player.passing, player.IQ],
  );
  const defensiveCore = computeAverageOfThreeAttributes(
    roster.filter((player) => player.position === 'D' || player.position === 'LSM' || player.position === 'G'),
    (player) => [player.defense, player.speed, player.IQ],
  );


  if (!coach.selectedTeamId || !coach.profile) {
    return <Navigate to="/career/setup" replace />;
  }

  function onToggle(playerId: string) {
    dispatch(toggleStarter(playerId));
  }

  if (roster.length === 0) {
    return (
      <div className="pageStack">
        <PageHeader eyebrow="Program" title="Roster" />
        <div className="card emptyState">
          <h3>No roster yet</h3>
          <p>Finish career setup to generate your program&apos;s roster.</p>
          <div className="emptyState-actions">
            <Link to="/career/setup" className="btn btn-primary">Set up your career</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pageStack">
      <PageHeader
        eyebrow="Program"
        title="Roster"
        subtitle={`${selectedTeam?.schoolName ?? ''} ${selectedTeam?.nickname ?? ''} · ${season.year} season · ${roster.length} players`}
      />

      <div className="card">
        <p className="text-sm text-gray-600 m-0 max-w-2xl">
          Starters drive in-game ratings and who gets scoring chances. Bench players still contribute, but at a lower weight. Set your depth chart before big weeks and the postseason.
        </p>
        <p className="text-sm text-gray-600 mt-2 mb-0 max-w-2xl">
          {redshirtsOpen
            ? 'Before week 1 you can redshirt a player: he sits out the season, still develops, and keeps his class year. Each player gets one; seniors cannot.'
            : redshirtCount > 0
              ? `${redshirtCount} ${redshirtCount === 1 ? 'player is' : 'players are'} redshirting this season.`
              : 'Redshirts are set before week 1 of each season.'}
        </p>
        {scratches.length > 0 && (
          <p className="text-sm text-red-600 mt-2 mb-0">
            Out this week: {scratches.map((scratch) => `${scratch.name} (${scratch.position})`).join(', ')}. They sit this game. The rest of the roster stays.
          </p>
        )}

        <div className="rosterSummaryGrid">
          <div className="rosterSummaryTile">
            <span>Roster OVR</span>
            <strong className={ratingClass(rosterOverall)}>{rosterOverall}</strong>
          </div>
          <div className="rosterSummaryTile">
            <span>Offensive core</span>
            <strong>{offensiveCore}</strong>
          </div>
          <div className="rosterSummaryTile">
            <span>Defensive core</span>
            <strong>{defensiveCore}</strong>
          </div>
          <div className="rosterSummaryTile">
            <span>Class mix</span>
            <strong>{classBalance.map((row) => `${row.label} ${row.count}`).join(' · ')}</strong>
          </div>
          <div className="rosterSummaryTile">
            <span>Senior exits</span>
            <strong>{graduatingCount}</strong>
          </div>
        </div>

        {/* Depth summary grid */}
        <div className="grid grid-cols-6 gap-2 border-t pt-3 mt-4">
          {depthSummary.map((d) => (
            <div key={d.position} className="text-center">
              <div className="text-xs text-gray-400 font-semibold uppercase">{d.position}</div>
              <div className={`text-lg font-bold ${ratingClass(d.avgOverall)}`}>{d.avgOverall}</div>
              <div className="text-xs text-gray-500">{d.starters}S / {d.backups}B</div>
            </div>
          ))}
        </div>
      </div>

      {/* Offseason notes */}
      {season.phase === 'OFFSEASON' && (
        <div className="card noticeCard-warn">
          <h3 className="text-base font-bold mb-2">Offseason roster notes</h3>
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

            <div className="dataTableWrap">
              {/* Fixed columns so every position table lines up with the next. */}
              <table className="rosterTable">
                <caption className="sr-only">{POSITION_LABELS[pos]} depth chart</caption>
                <colgroup>
                  <col className="rosterCol-role" />
                  <col />
                  <col className="rosterCol-stat" />
                  <col className="rosterCol-stat" />
                  <col className="rosterCol-stat" />
                  <col className="rosterCol-stat" />
                  <col className="rosterCol-stat" />
                  <col className="rosterCol-stat" />
                  <col className="rosterCol-stat" />
                  <col className="rosterCol-stat" />
                  <col className="rosterCol-stat" />
                  <col className="rosterCol-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Role</th>
                    <th scope="col">Name</th>
                    <th scope="col" className="num">Yr</th>
                    <th scope="col" className="num">Age</th>
                    <th scope="col" className="num">OVR</th>
                    <th scope="col" className="num"><abbr title="Shooting">SHT</abbr></th>
                    <th scope="col" className="num"><abbr title="Passing">PAS</abbr></th>
                    <th scope="col" className="num"><abbr title="Speed">SPD</abbr></th>
                    <th scope="col" className="num"><abbr title="Defense">DEF</abbr></th>
                    <th scope="col" className="num"><abbr title="Lacrosse IQ">IQ</abbr></th>
                    {/* Kept in every table so the columns line up; only specialists fill it. */}
                    <th scope="col" className="num">
                      {pos === 'FO' ? <abbr title="Faceoffs">FO</abbr> : pos === 'G' ? <abbr title="Saves">SV</abbr> : <span className="sr-only">Specialty</span>}
                    </th>
                    <th scope="col"><span className="sr-only">Lineup</span></th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <PlayerRow
                      key={player.id}
                      player={player}
                      isStarter={starterSet.has(player.id)}
                      injury={scratchById.get(player.id) ?? null}
                      starterCountForPos={starterTarget}
                      currentStartersForPos={currentStarters}
                      onToggle={onToggle}
                      redshirtControl={redshirtsOpen && (player.redshirt || (!player.redshirtUsed && player.year < 4))
                        ? {
                            label: player.redshirt ? 'Undo redshirt' : 'Redshirt',
                            blocker: player.redshirt ? null : redshirtBlocker(player, roster),
                            onClick: () => dispatch(setPlayerRedshirt({ playerId: player.id, redshirt: !player.redshirt })),
                          }
                        : null}
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
          <h3 className="text-base font-bold mb-2">Signed recruiting class ({signedClass.length})</h3>
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
                <div className="text-xs text-gray-400">Joins {season.year + 1}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default RosterPage;
