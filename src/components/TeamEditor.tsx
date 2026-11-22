import { useEffect, useState } from 'react';
import TeamLogo from './TeamLogo';
import { baseTeamById } from '../features/league/leagueSlice';
import { clearTeamOverride, setTeamOverride } from '../features/settings/settingsSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { defaultColorIndex, defaultLetters, TEAM_COLORS } from '../sim/teamMark';
import { NICKNAME_MAX, SCHOOL_NAME_MAX, validateTeamOverride } from '../sim/teamOverrides';
import type { Team } from '../types/sim';

/** Rename a program and pick its logo letters and colors. Only branding: the sim is untouched. */
function TeamEditor({ team }: { team: Team }) {
  const dispatch = useAppDispatch();
  const teams = useAppSelector((state) => state.league.teams);
  const saved = useAppSelector((state) => state.settings.teamOverrides?.[team.id]);
  const base = baseTeamById(team.id) ?? team;
  const [schoolName, setSchoolName] = useState(team.schoolName);
  const [nickname, setNickname] = useState(team.nickname);
  const [abbreviation, setAbbreviation] = useState(team.abbreviation ?? '');
  const [colorIndex, setColorIndex] = useState(team.colorIndex ?? defaultColorIndex(team.id));
  const [savedNote, setSavedNote] = useState<string | null>(null);

  // Start over from the team as it is whenever another team is opened or the edit is cleared.
  useEffect(() => {
    setSchoolName(team.schoolName);
    setNickname(team.nickname);
    setAbbreviation(team.abbreviation ?? '');
    setColorIndex(team.colorIndex ?? defaultColorIndex(team.id));
  }, [team]);

  // Cheap enough to check on every keystroke.
  const errors = validateTeamOverride(team.id, { schoolName, nickname, abbreviation, colorIndex }, teams);
  const hasErrors = Object.keys(errors).length > 0;
  const preview = { id: team.id, schoolName: schoolName.trim() || base.schoolName, abbreviation: abbreviation.trim() || undefined, colorIndex };
  const autoLetters = defaultLetters({ id: team.id, schoolName: preview.schoolName });

  function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (hasErrors) return;
    // Store only what differs from the original, so a later data update still reaches the rest.
    dispatch(setTeamOverride({
      teamId: team.id,
      override: {
        schoolName: schoolName.trim() !== base.schoolName ? schoolName : undefined,
        nickname: nickname.trim() !== base.nickname ? nickname : undefined,
        abbreviation: abbreviation.trim() || undefined,
        colorIndex: colorIndex !== defaultColorIndex(team.id) ? colorIndex : undefined,
      },
    }));
    setSavedNote('Saved. The new name shows across the league.');
  }

  function onRestore() {
    dispatch(clearTeamOverride(team.id));
    setSavedNote(`Restored to ${base.schoolName} ${base.nickname}.`);
  }

  return (
    <details className="card teamEditor">
      <summary className="font-bold">Edit team</summary>
      <p className="text-xs text-gray-500 mt-2 mb-0">
        Rename the program and pick its logo. Only the look changes: schedules, rosters, prestige, and every result stay the same. Edits are kept in this browser, even if you reset the career.
      </p>
      <form className="teamEditorForm" onSubmit={onSave}>
        <div className="teamEditorPreview" aria-hidden="true">
          <TeamLogo team={preview} size="lg" />
          <span>
            <strong>{preview.schoolName}</strong> {nickname.trim() || base.nickname}
          </span>
        </div>
        <div className="grid2">
          <label>
            School name
            <input value={schoolName} maxLength={SCHOOL_NAME_MAX + 8} onChange={(event) => setSchoolName(event.target.value)} aria-invalid={Boolean(errors.schoolName)} aria-describedby="team-edit-school-error" />
            {errors.schoolName && <small id="team-edit-school-error" className="formError">{errors.schoolName}</small>}
          </label>
          <label>
            Nickname
            <input value={nickname} maxLength={NICKNAME_MAX + 8} onChange={(event) => setNickname(event.target.value)} aria-invalid={Boolean(errors.nickname)} aria-describedby="team-edit-nickname-error" />
            {errors.nickname && <small id="team-edit-nickname-error" className="formError">{errors.nickname}</small>}
          </label>
        </div>
        <label>
          Logo letters
          <input
            value={abbreviation}
            maxLength={4}
            placeholder={autoLetters}
            onChange={(event) => setAbbreviation(event.target.value.toUpperCase())}
            aria-invalid={Boolean(errors.abbreviation)}
            aria-describedby="team-edit-letters-help"
          />
          <small id="team-edit-letters-help" className={errors.abbreviation ? 'formError' : 'mutedText'}>
            {errors.abbreviation ?? `2 to 4 letters. Leave blank for ${autoLetters}.`}
          </small>
        </label>
        <fieldset className="teamColorPicker">
          <legend>Logo colors</legend>
          <div className="teamColorGrid" role="radiogroup" aria-label="Logo colors">
            {TEAM_COLORS.map((colors, index) => (
              <button
                key={`${colors.primary}-${colors.secondary}`}
                type="button"
                role="radio"
                aria-checked={colorIndex === index}
                aria-label={`Color set ${index + 1}${index === defaultColorIndex(team.id) ? ' (original)' : ''}`}
                className="teamColorSwatch"
                style={{ backgroundColor: colors.primary, boxShadow: `inset 0 -0.45em 0 ${colors.secondary}` }}
                onClick={() => setColorIndex(index)}
              />
            ))}
          </div>
        </fieldset>
        <div className="teamEditorActions">
          <button type="submit" className="btn btn-primary" disabled={hasErrors}>Save</button>
          {saved && <button type="button" className="btn" onClick={onRestore}>Restore original</button>}
          {savedNote && <span className="text-sm mutedText" role="status">{savedNote}</span>}
        </div>
      </form>
    </details>
  );
}

export default TeamEditor;
