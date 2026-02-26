import { FormEvent } from 'react';
import { runExhibition, setSeed, setTactics, setTeams } from '../features/exhibition/exhibitionSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { Tactics } from '../types/sim';

const tempoOptions: Tactics['tempo'][] = ['slow', 'normal', 'fast'];
const rideOptions: Tactics['rideClear'][] = ['conservative', 'balanced', 'aggressive'];
const slideOptions: Tactics['slideAggression'][] = ['early', 'normal', 'late'];

function TacticsControls({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Tactics;
  onChange: (next: Tactics) => void;
}) {
  return (
    <div className="card p-4">
      <h4 className="font-bold border-b pb-2 mb-2">{label} Tactics</h4>
      <div className="flex-col gap-2">
        <label className="text-sm">
          Tempo
          <select
            value={value.tempo}
            onChange={(event) => onChange({ ...value, tempo: event.target.value as Tactics['tempo'] })}
            className="p-1 border rounded"
          >
            {tempoOptions.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Ride/Clear
          <select
            value={value.rideClear}
            onChange={(event) => onChange({ ...value, rideClear: event.target.value as Tactics['rideClear'] })}
            className="p-1 border rounded"
          >
            {rideOptions.map((option) => (
              <option key={option} value={option}>
                 {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Slide Aggression
          <select
            value={value.slideAggression}
            onChange={(event) => onChange({ ...value, slideAggression: event.target.value as Tactics['slideAggression'] })}
            className="p-1 border rounded"
          >
            {slideOptions.map((option) => (
              <option key={option} value={option}>
                 {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function ExhibitionPage() {
  const dispatch = useAppDispatch();
  const teams = useAppSelector((state) => state.league.teams);
  const exhibition = useAppSelector((state) => state.exhibition);

  const teamAId = exhibition.selectedTeamAId ?? teams[0]?.id ?? '';
  const teamBId = exhibition.selectedTeamBId ?? teams[1]?.id ?? '';

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    dispatch(setTeams({ teamAId, teamBId }));
    dispatch(runExhibition());
  };

  return (
    <div className="flex-col gap-4">
      <h2 className="m-0">Exhibition Mode</h2>

      <form className="card flex-col gap-4" onSubmit={onSubmit}>
        <div className="grid2 gap-4">
          <label>
            <span className="font-bold">Home Team (Team A)</span>
            <select
              value={teamAId}
              onChange={(event) => dispatch(setTeams({ teamAId: event.target.value, teamBId }))}
              className="p-2 border rounded"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.schoolName} {team.nickname}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="font-bold">Away Team (Team B)</span>
            <select
              value={teamBId}
              onChange={(event) => dispatch(setTeams({ teamAId, teamBId: event.target.value }))}
              className="p-2 border rounded"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.schoolName} {team.nickname}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid2 gap-4">
          <TacticsControls
            label="Home"
            value={exhibition.tacticsA}
            onChange={(next) => dispatch(setTactics({ team: 'A', tactics: next }))}
          />
          <TacticsControls
            label="Away"
            value={exhibition.tacticsB}
            onChange={(next) => dispatch(setTactics({ team: 'B', tactics: next }))}
          />
        </div>

        <div className="flex justify-between items-end border-t pt-4">
          <label className="flex-1 max-w-xs">
            <span className="text-sm text-gray-500">Random Seed</span>
            <div className="flex gap-2">
                <input
                  type="number"
                  value={exhibition.seed}
                  onChange={(event) => dispatch(setSeed(Number(event.target.value) || 0))}
                  className="p-2 border rounded w-24"
                />
                <button type="button" className="btn text-sm" onClick={() => dispatch(setSeed(Math.floor(Math.random() * 1000000)))}>
                    Randomize
                </button>
            </div>
          </label>
          <button type="submit" className="btn btn-primary text-lg px-8 py-2">
              Run Simulation
          </button>
        </div>
      </form>

      {exhibition.lastResult ? (
        <div className="card p-0 overflow-hidden">
          <div className="bg-gray-800 text-white p-4 flex justify-around items-center">
             <div className="text-center">
                 <div className="text-2xl font-bold">{exhibition.lastResult.scoreA}</div>
                 <div className="text-sm opacity-80">{exhibition.lastResult.teamAName}</div>
             </div>
             <div className="text-gray-400 font-mono">FINAL</div>
             <div className="text-center">
                 <div className="text-2xl font-bold">{exhibition.lastResult.scoreB}</div>
                 <div className="text-sm opacity-80">{exhibition.lastResult.teamBName}</div>
             </div>
          </div>

          <div className="p-4">
              <h4 className="font-bold mb-2">Team Stats</h4>
              <table className="w-full text-sm text-center border">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="p-2 text-left">Team</th>
                    <th className="p-2">Goals</th>
                    <th className="p-2">Shots</th>
                    <th className="p-2">Saves</th>
                    <th className="p-2">TO</th>
                    <th className="p-2">GB</th>
                    <th className="p-2">Pen</th>
                    <th className="p-2">FO%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2 text-left font-bold">{exhibition.lastResult.teamAName}</td>
                    <td>{exhibition.lastResult.statsA.goals}</td>
                    <td>{exhibition.lastResult.statsA.shots}</td>
                    <td>{exhibition.lastResult.statsA.saves}</td>
                    <td>{exhibition.lastResult.statsA.turnovers}</td>
                    <td>{exhibition.lastResult.statsA.groundBalls}</td>
                    <td>{exhibition.lastResult.statsA.penalties}</td>
                    <td>{exhibition.lastResult.statsA.faceoffPct}%</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-left font-bold">{exhibition.lastResult.teamBName}</td>
                    <td>{exhibition.lastResult.statsB.goals}</td>
                    <td>{exhibition.lastResult.statsB.shots}</td>
                    <td>{exhibition.lastResult.statsB.saves}</td>
                    <td>{exhibition.lastResult.statsB.turnovers}</td>
                    <td>{exhibition.lastResult.statsB.groundBalls}</td>
                    <td>{exhibition.lastResult.statsB.penalties}</td>
                    <td>{exhibition.lastResult.statsB.faceoffPct}%</td>
                  </tr>
                </tbody>
              </table>
          </div>

          <div className="grid2 p-4 gap-4 border-t">
            <div>
              <h4 className="font-bold mb-2 text-sm uppercase text-gray-500">Top Performers — {exhibition.lastResult.teamAName}</h4>
              <ul className="text-sm">
                {exhibition.lastResult.topPlayersA.map((player) => (
                  <li key={player.playerId} className="mb-1">
                    <span className="font-semibold">{player.name}</span> <span className="text-gray-500">({player.position})</span>
                    <span className="ml-2 font-mono text-xs">{player.goals}G, {player.assists}A, {player.saves > 0 ? `${player.saves}SV` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-2 text-sm uppercase text-gray-500">Top Performers — {exhibition.lastResult.teamBName}</h4>
              <ul className="text-sm">
                {exhibition.lastResult.topPlayersB.map((player) => (
                  <li key={player.playerId} className="mb-1">
                    <span className="font-semibold">{player.name}</span> <span className="text-gray-500">({player.position})</span>
                    <span className="ml-2 font-mono text-xs">{player.goals}G, {player.assists}A, {player.saves > 0 ? `${player.saves}SV` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="p-4 bg-gray-50 border-t">
            <h4 className="font-bold mb-2 text-sm uppercase text-gray-500">Game Highlights</h4>
            <ul className="text-xs font-mono max-h-40 overflow-y-auto">
                {exhibition.lastResult.highlights.length === 0 && <li className="text-gray-400">No highlights recorded.</li>}
                {exhibition.lastResult.highlights.map((line, index) => (
                  <li key={`${line}-${index}`} className="mb-1">{line}</li>
                ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ExhibitionPage;
