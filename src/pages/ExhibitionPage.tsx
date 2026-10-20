import { FormEvent, useState } from 'react';
import TeamLogo from '../components/TeamLogo';
import { runExhibition, setSeed, setTactics, setTeams } from '../features/exhibition/exhibitionSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { Tactics } from '../types/sim';
import PageHeader from '../components/PageHeader';
import { TacticSelects } from '../components/GamePlan';

function TacticsControls({
  label,
  idPrefix,
  value,
  onChange,
}: {
  label: string;
  idPrefix: string;
  value: Tactics;
  onChange: (next: Tactics) => void;
}) {
  return (
    <div className="card">
      <h4>{label} tactics</h4>
      <TacticSelects idPrefix={idPrefix} tactics={value} onChange={onChange} />
    </div>
  );
}

function ExhibitionPage() {
  const dispatch = useAppDispatch();
  const teams = useAppSelector((state) => state.league.teams);
  const exhibition = useAppSelector((state) => state.exhibition);
  const [validationError, setValidationError] = useState<string | null>(null);

  const teamAId = exhibition.selectedTeamAId ?? teams[0]?.id ?? '';
  const teamBId = exhibition.selectedTeamBId ?? teams[1]?.id ?? '';
  const teamA = teams.find((team) => team.id === teamAId) ?? null;
  const teamB = teams.find((team) => team.id === teamBId) ?? null;
  const sameTeamSelected = Boolean(teamAId && teamBId && teamAId === teamBId);
  const resultTeam = (name: string) =>
    teams.find((team) => name === `${team.schoolName} ${team.nickname}`) ?? null;
  const lastResult = exhibition.lastResult;
  const resultA = lastResult ? resultTeam(lastResult.teamAName) : null;
  const resultB = lastResult ? resultTeam(lastResult.teamBName) : null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (sameTeamSelected) {
      setValidationError('Choose two different teams for an exhibition matchup.');
      return;
    }
    setValidationError(null);
    dispatch(setTeams({ teamAId, teamBId }));
    try {
      const result = await dispatch(runExhibition()).unwrap();
      if (!result) {
        setValidationError('Could not simulate that matchup. Confirm both teams are selected.');
      }
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="pageStack">
      <PageHeader
        eyebrow="League"
        title="Exhibition"
        subtitle="Run a single deterministic game with custom tactics and seeds. Results do not touch your career save."
      />

      <form className="card" onSubmit={onSubmit}>
        {validationError && (
          <p className="text-sm text-red-600 mb-3" role="alert">
            {validationError}
          </p>
        )}
        <div className="grid2">
          <label>
            Team A
            <select
              value={teamAId}
              onChange={(event) => dispatch(setTeams({ teamAId: event.target.value, teamBId }))}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.schoolName} {team.nickname}
                </option>
              ))}
            </select>
          </label>

          <label>
            Team B
            <select
              value={teamBId}
              onChange={(event) => dispatch(setTeams({ teamAId, teamBId: event.target.value }))}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.schoolName} {team.nickname}
                </option>
              ))}
            </select>
          </label>
        </div>

        {teamA && teamB && (
          <div className="exhibitionPreview" aria-hidden="true">
            <span className="programLockup">
              <TeamLogo team={teamA} />
              <span>{teamA.schoolName}</span>
            </span>
            <span className="exhibitionVs">vs</span>
            <span className="programLockup">
              <TeamLogo team={teamB} />
              <span>{teamB.schoolName}</span>
            </span>
          </div>
        )}

        {sameTeamSelected && (
          <p className="text-sm text-amber-700 mt-2 mb-0">Select two different teams before simulating.</p>
        )}

        <div className="grid2">
          <TacticsControls
            label="Team A"
            idPrefix="exhibition-a"
            value={exhibition.tacticsA}
            onChange={(next) => dispatch(setTactics({ team: 'A', tactics: next }))}
          />
          <TacticsControls
            label="Team B"
            idPrefix="exhibition-b"
            value={exhibition.tacticsB}
            onChange={(next) => dispatch(setTactics({ team: 'B', tactics: next }))}
          />
        </div>

        <div className="seedRow flex flex-wrap gap-2 items-end mt-3">
          <label>
            Seed
            <input
              type="number"
              value={exhibition.seed}
              onChange={(event) => dispatch(setSeed(Number(event.target.value) || 0))}
            />
          </label>
          <button type="button" className="btn" onClick={() => dispatch(setSeed(Math.floor(Math.random() * 1000000000)))}>
            Random seed
          </button>
          <button type="submit" className="btn btn-primary" disabled={sameTeamSelected}>
            Sim game
          </button>
        </div>
      </form>

      {lastResult ? (
        <div className="card">
          <h3 className="exhibitionFinal">
            <span className="programLockup">
              {resultA && <TeamLogo team={resultA} size="sm" />}
              <span>{lastResult.teamAName}</span>
            </span>
            <span className="exhibitionFinalScore">
              {lastResult.scoreA}–{lastResult.scoreB}
            </span>
            <span className="programLockup">
              {resultB && <TeamLogo team={resultB} size="sm" />}
              <span>{lastResult.teamBName}</span>
            </span>
          </h3>

          <h4>Team box score</h4>
          <div className="dataTableWrap">
          <table>
            <caption className="sr-only">Team totals for this exhibition game</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col" className="num">Goals</th>
                <th scope="col" className="num">Shots</th>
                <th scope="col" className="num">Saves</th>
                <th scope="col" className="num">Turnovers</th>
                <th scope="col" className="num">Caused TO</th>
                <th scope="col" className="num">Ground balls</th>
                <th scope="col" className="num">Penalties</th>
                <th scope="col" className="num">Faceoff%</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="standingsTeam">
                    {resultA && <TeamLogo team={resultA} size="sm" />}
                    <span>{lastResult.teamAName}</span>
                  </span>
                </td>
                <td className="num">{lastResult.statsA.goals}</td>
                <td className="num">{lastResult.statsA.shots}</td>
                <td className="num">{lastResult.statsA.saves}</td>
                <td className="num">{lastResult.statsA.turnovers}</td>
                <td className="num">{lastResult.statsA.causedTurnovers ?? 0}</td>
                <td className="num">{lastResult.statsA.groundBalls}</td>
                <td className="num">{lastResult.statsA.penalties}</td>
                <td className="num">{lastResult.statsA.faceoffPct}%</td>
              </tr>
              <tr>
                <td>
                  <span className="standingsTeam">
                    {resultB && <TeamLogo team={resultB} size="sm" />}
                    <span>{lastResult.teamBName}</span>
                  </span>
                </td>
                <td className="num">{lastResult.statsB.goals}</td>
                <td className="num">{lastResult.statsB.shots}</td>
                <td className="num">{lastResult.statsB.saves}</td>
                <td className="num">{lastResult.statsB.turnovers}</td>
                <td className="num">{lastResult.statsB.causedTurnovers ?? 0}</td>
                <td className="num">{lastResult.statsB.groundBalls}</td>
                <td className="num">{lastResult.statsB.penalties}</td>
                <td className="num">{lastResult.statsB.faceoffPct}%</td>
              </tr>
            </tbody>
          </table>
          </div>

          <div className="grid2">
            <div>
              <h4>Top players — {lastResult.teamAName}</h4>
              <ul>
                {lastResult.topPlayersA.map((player) => (
                  <li key={player.playerId}>
                    {player.name} ({player.position}) — G:{player.goals} A:{player.assists} SV:{player.saves}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Top players — {lastResult.teamBName}</h4>
              <ul>
                {lastResult.topPlayersB.map((player) => (
                  <li key={player.playerId}>
                    {player.name} ({player.position}) — G:{player.goals} A:{player.assists} SV:{player.saves}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <h4>Highlights</h4>
          <ul>
            {lastResult.highlights.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default ExhibitionPage;
