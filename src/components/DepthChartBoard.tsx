import { replaceStarter, setStarterIds } from '../features/coach/coachSlice';
import { bestLineup, depthChartSlots, lineupGap, POSITION_NAMES, startingRating } from '../sim/depthChart';
import { rosterForAvailability, type WeekScratch } from '../sim/injuries';
import { activeRoster } from '../sim/redshirts';
import { defensiveMiddieSwap, DEFENSIVE_MIDDIE_MARGIN, middieDefense } from '../sim/matchEngine';
import { useAppDispatch } from '../store/hooks';
import { POSITION_ORDER, type Player } from '../types/sim';

type DepthChartBoardProps = {
  roster: Player[];
  starterIds: string[];
  scratches: WeekScratch[];
};

/** Every starting slot at a glance, each with a pick list, the game-day fill-ins, and a one-click best lineup. */
function DepthChartBoard({ roster, starterIds, scratches }: DepthChartBoardProps) {
  const dispatch = useAppDispatch();
  const slots = depthChartSlots(roster, starterIds);
  const gaps = lineupGap(roster, starterIds);
  const gapTotal = gaps.reduce((sum, row) => sum + row.points, 0);
  const out = new Map(scratches.map((scratch) => [scratch.playerId, scratch]));
  // Who actually takes the field this week once injured starters are covered.
  const gameDay = rosterForAvailability(activeRoster(roster), starterIds, scratches);
  const playing = new Set(gameDay.starterIds);
  const fillIns = gameDay.roster.filter((player) => playing.has(player.id) && !starterIds.includes(player.id));
  // The short-stick D-middie the staff sends on for this week's game.
  const dMiddie = defensiveMiddieSwap(gameDay.roster, gameDay.starterIds);

  return (
    <section className="card" aria-labelledby="depth-title">
      <div className="cardHeadRow mb-2">
        <div>
          <h3 id="depth-title" className="m-0 text-base font-bold">Depth chart</h3>
          <p className="text-xs text-gray-500 mt-1 mb-0">
            Pick who starts in each slot. A player already starting trades places. Specialists start on their faceoff or save rating.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary text-sm"
          disabled={gapTotal === 0}
          onClick={() => dispatch(setStarterIds(bestLineup(roster)))}
        >
          {gapTotal === 0 ? 'Best lineup set' : 'Set best lineup'}
        </button>
      </div>
      {gaps.length > 0 && (
        <p className="text-sm text-amber-600 mt-0 mb-2">
          Your lineup is {gapTotal} rating {gapTotal === 1 ? 'point' : 'points'} below the best available:{' '}
          {gaps.map((row) => `${POSITION_NAMES[row.position].toLowerCase()} ${row.points}`).join(', ')}.
        </p>
      )}
      <div className="depthBoard">
        {POSITION_ORDER.map((position) => {
          const options = roster
            .filter((player) => player.position === position && !player.redshirt)
            .sort((a, b) => startingRating(b) - startingRating(a) || a.name.localeCompare(b.name));
          return (
            <div key={position} className="depthGroup">
              <div className="depthGroupTitle">{POSITION_NAMES[position]}</div>
              {slots[position].map((slot) => {
                const injury = slot.player ? out.get(slot.player.id) : undefined;
                return (
                  <label key={`${position}${slot.index}`} className={`depthSlot${injury ? ' depthSlot-out' : ''}`}>
                    <span className="depthSlotLabel">{position}{slot.index}</span>
                    <select
                      value={slot.player?.id ?? ''}
                      aria-label={`${POSITION_NAMES[position]} starter ${slot.index}`}
                      onChange={(event) => {
                        if (event.target.value) dispatch(replaceStarter({ outId: slot.player?.id ?? null, inId: event.target.value }));
                      }}
                    >
                      {!slot.player && <option value="">Empty slot</option>}
                      {options.map((player) => {
                        const startsElsewhere = player.id !== slot.player?.id && starterIds.includes(player.id);
                        const hurt = out.get(player.id);
                        return (
                          <option key={player.id} value={player.id}>
                            {player.name} ({startingRating(player)}){startsElsewhere ? ' · starting' : ''}{hurt ? ' · out' : ''}
                          </option>
                        );
                      })}
                    </select>
                    {injury && (
                      <span className="depthSlotNote">Out this week</span>
                    )}
                  </label>
                );
              })}
              {position === 'M' && (
                <p
                  className="depthSlotNote depthDMiddie"
                  title={`On defense the bench midfielder who defends best (defense, speed, and IQ) runs on for the starter who defends worst, when he is at least ${DEFENSIVE_MIDDIE_MARGIN} points better at it.`}
                >
                  {dMiddie
                    ? `D-middie: ${dMiddie.ssdm.name} (${Math.round(middieDefense(dMiddie.ssdm))} on defense) runs on for ${dMiddie.replaces.name} (${Math.round(middieDefense(dMiddie.replaces))}) when you defend.`
                    : 'D-middie: none. No bench middie defends clearly better than your starters.'}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {fillIns.length > 0 && (
        <p className="text-xs text-gray-500 mt-2 mb-0">
          Filling in this week for injured starters: {fillIns.map((player) => `${player.name} (${player.position})`).join(', ')}.
        </p>
      )}
    </section>
  );
}

export default DepthChartBoard;
