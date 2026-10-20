import { FormEvent, useState } from 'react';
import TeamLogo from '../components/TeamLogo';
import { runExhibition, setSeed, setTactics, setTeams } from '../features/exhibition/exhibitionSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { Tactics } from '../types/sim';

const tempoOptions: Tactics['tempo'][] = ['slow', 'normal', 'fast'];
const rideOptions: Tactics['rideClear'][] = ['conservative', 'balanced', 'aggressive'];
const slideOptions: Tactics['slideAggression'][] = ['early', 'normal', 'late'];
const offenseSetOptions: NonNullable<Tactics['offenseSet']>[] = ['balanced', 'motion', 'invert', 'crease'];
const defensePackageOptions: NonNullable<Tactics['defensePackage']>[] = ['man', 'zone', 'pressure'];

const TEMPO_LABELS: Record<Tactics['tempo'], string> = {
  slow: 'Slow — limit possessions',
  normal: 'Balanced',
  fast: 'Fast — push transition',
};
const RIDE_LABELS: Record<Tactics['rideClear'], string> = {
  conservative: 'Conservative',
  balanced: 'Balanced',
  aggressive: 'Aggressive',
};
const SLIDE_LABELS: Record<Tactics['slideAggression'], string> = {
  early: 'Early help',
  normal: 'Standard',
  late: 'Late slides — pack in',
};
const OFFENSE_LABELS: Record<NonNullable<Tactics['offenseSet']>, string> = {
  balanced: 'Balanced',
  motion: 'Motion — off-ball movement',
  invert: 'Invert — midfield dodges',
  crease: 'Crease — inside finishing',
};
const DEFENSE_LABELS: Record<NonNullable<Tactics['defensePackage']>, string> = {
  man: 'Man-to-man',
  zone: 'Zone — protect the slot',
  pressure: 'Pressure — force pace',
};

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
    <div className="card">
      <h4>{label} Tactics</h4>
      <label>
        Tempo
        <select value={value.tempo} onChange={(event) => onChange({ ...value, tempo: event.target.value as Tactics['tempo'] })}>
          {tempoOptions.map((option) => (
            <option key={option} value={option}>
              {TEMPO_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Ride/Clear
        <select
          value={value.rideClear}
          onChange={(event) => onChange({ ...value, rideClear: event.target.value as Tactics['rideClear'] })}
        >
          {rideOptions.map((option) => (
            <option key={option} value={option}>
              {RIDE_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Slide Aggression
        <select
          value={value.slideAggression}
          onChange={(event) => onChange({ ...value, slideAggression: event.target.value as Tactics['slideAggression'] })}
        >
          {slideOptions.map((option) => (
            <option key={option} value={option}>
              {SLIDE_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Offense Set
        <select
          value={value.offenseSet ?? 'balanced'}
          onChange={(event) => onChange({ ...value, offenseSet: event.target.value as NonNullable<Tactics['offenseSet']> })}
        >
          {offenseSetOptions.map((option) => (
            <option key={option} value={option}>
              {OFFENSE_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Defense Package
        <select
          value={value.defensePackage ?? 'man'}
          onChange={(event) =>
            onChange({ ...value, defensePackage: event.target.value as NonNullable<Tactics['defensePackage']> })
          }
        >
          {defensePackageOptions.map((option) => (
            <option key={option} value={option}>
              {DEFENSE_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
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
      <div className="pageHeader">
        <h2>Exhibition Lab</h2>
        <p className="pageHeader-sub">
          Run a single deterministic game with custom tactics and seeds — results do not affect your career save.
        </p>
      </div>

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
            value={exhibition.tacticsA}
            onChange={(next) => dispatch(setTactics({ team: 'A', tactics: next }))}
          />
          <TacticsControls
            label="Team B"
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
            Random Seed
          </button>
          <button type="submit" className="btn btn-primary" disabled={sameTeamSelected}>
            Sim Game
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

          <h4>Team Box Score</h4>
          <div className="dataTableWrap">
          <table>
            <caption className="text-sm text-gray-500 text-left mb-2">Team totals for this exhibition game</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">Goals</th>
                <th scope="col">Shots</th>
                <th scope="col">Saves</th>
                <th scope="col">Turnovers</th>
                <th scope="col">Caused TO</th>
                <th scope="col">Ground Balls</th>
                <th scope="col">Penalties</th>
                <th scope="col">Faceoff%</th>
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
                <td>{lastResult.statsA.goals}</td>
                <td>{lastResult.statsA.shots}</td>
                <td>{lastResult.statsA.saves}</td>
                <td>{lastResult.statsA.turnovers}</td>
                <td>{lastResult.statsA.causedTurnovers ?? 0}</td>
                <td>{lastResult.statsA.groundBalls}</td>
                <td>{lastResult.statsA.penalties}</td>
                <td>{lastResult.statsA.faceoffPct}%</td>
              </tr>
              <tr>
                <td>
                  <span className="standingsTeam">
                    {resultB && <TeamLogo team={resultB} size="sm" />}
                    <span>{lastResult.teamBName}</span>
                  </span>
                </td>
                <td>{lastResult.statsB.goals}</td>
                <td>{lastResult.statsB.shots}</td>
                <td>{lastResult.statsB.saves}</td>
                <td>{lastResult.statsB.turnovers}</td>
                <td>{lastResult.statsB.causedTurnovers ?? 0}</td>
                <td>{lastResult.statsB.groundBalls}</td>
                <td>{lastResult.statsB.penalties}</td>
                <td>{lastResult.statsB.faceoffPct}%</td>
              </tr>
            </tbody>
          </table>
          </div>

          <div className="grid2">
            <div>
              <h4>Top Players — {lastResult.teamAName}</h4>
              <ul>
                {lastResult.topPlayersA.map((player) => (
                  <li key={player.playerId}>
                    {player.name} ({player.position}) — G:{player.goals} A:{player.assists} SV:{player.saves}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Top Players — {lastResult.teamBName}</h4>
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
