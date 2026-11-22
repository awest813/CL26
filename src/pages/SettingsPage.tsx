import { useRef, useState } from 'react';
import { useStore } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { eraseSave } from '../features/settings/eraseSave';
import {
  clearAllTeamOverrides,
  setConfirmPlay,
  setDensity,
  setGameReveal,
  setShowWinChance,
  setTheme,
  type DisplayDensity,
  type GameReveal,
  type ThemePreference,
} from '../features/settings/settingsSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import PageHeader from '../components/PageHeader';
import { persistor } from '../store/persistor';
import { saveStorage } from '../store/store';
import { backupFileName, buildBackup, parseBackup, SAVE_STORAGE_KEY } from '../store/saveBackup';
import type { RootState } from '../store/store';

const THEME_OPTIONS: { value: ThemePreference; label: string; detail: string }[] = [
  { value: 'system', label: 'System', detail: 'Follows your device: light by day, dark if your device is set to dark.' },
  { value: 'light', label: 'Light', detail: 'Always the light field-green look.' },
  { value: 'dark', label: 'Dark', detail: 'Always dark, easier on the eyes at night.' },
];

const REVEAL_OPTIONS: { value: GameReveal; label: string; detail: string }[] = [
  { value: 'instant', label: 'Instant', detail: 'The final shows the moment the week is played.' },
  { value: 'quick', label: 'Quick', detail: 'Your game plays out goal by goal in a few seconds. Skip any time.' },
  { value: 'full', label: 'Full', detail: 'A slower, goal-by-goal finish to follow along. Skip any time.' },
];

const DENSITY_OPTIONS: { value: DisplayDensity; label: string; detail: string }[] = [
  { value: 'comfortable', label: 'Comfortable', detail: 'Roomy rows and cards.' },
  { value: 'compact', label: 'Compact', detail: 'Tighter tables and cards: more rows on screen.' },
];

/** A row of choice chips that act as one radio group. */
function ChoiceGroup<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string; detail: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="choiceGrid themePicker mt-3" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className="choiceChip"
          onClick={() => onChange(option.value)}
        >
          <span className="font-semibold">{option.label}</span>
          <span className="choiceChipHelp">{option.detail}</span>
        </button>
      ))}
    </div>
  );
}

function SettingsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const confirmPlay = useAppSelector((state) => state.settings.confirmPlay);
  const showWinChance = useAppSelector((state) => state.settings.showWinChance);
  const theme = useAppSelector((state) => state.settings.theme ?? 'system');
  const gameReveal = useAppSelector((state) => state.settings.gameReveal ?? 'instant');
  const density = useAppSelector((state) => state.settings.density ?? 'comfortable');
  const editedTeams = useAppSelector((state) => Object.keys(state.settings.teamOverrides ?? {}).length);
  const [resetError, setResetError] = useState<string | null>(null);
  const [backupNote, setBackupNote] = useState<{ text: string; error: boolean } | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const appStore = useStore<RootState>();
  const [resetting, setResetting] = useState(false);

  function onDownloadBackup() {
    const state = appStore.getState();
    const programName = state.league.teams.find((team) => team.id === state.coach.selectedTeamId)?.schoolName ?? null;
    const backup = buildBackup({ season: state.season, coach: state.coach, settings: state.settings }, new Date(), programName);
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName(backup.summary);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBackupNote({ text: `Downloaded ${link.download}.`, error: false });
  }

  async function onRestoreBackup(file: File) {
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setBackupNote({ text: parsed.error, error: true });
      return;
    }
    const { summary, exportedAt } = parsed.backup;
    const who = [summary.coachName, summary.programName].filter(Boolean).join(', ') || 'a career';
    const when = [summary.year, summary.week ? `week ${summary.week}` : summary.phase?.toLowerCase()].filter(Boolean).join(', ');
    const saved = new Date(exportedAt).toLocaleString();
    if (!window.confirm(`Replace your current career with ${who}${when ? ` (${when})` : ''}, backed up ${saved}? The current career is erased.`)) return;
    // Stop the running game from writing over the restored career before the reload.
    persistor.pause();
    try {
      await saveStorage.setItem(SAVE_STORAGE_KEY, parsed.backup.persistRoot);
    } catch {
      persistor.persist();
      setBackupNote({ text: 'This browser would not store the backup (storage is full or blocked). Free up space or allow site data, then try again.', error: true });
      return;
    }
    window.location.reload();
  }

  async function onResetSave() {
    if (resetting) return;
    const confirmed = window.confirm(
      'Start a new game? This will permanently erase your current save — all season progress, coach career data, and recruits will be lost.',
    );
    if (!confirmed) return;
    setResetError(null);
    setResetting(true);
    try {
      await eraseSave(dispatch);
      navigate('/career/setup');
    } catch (err) {
      setResetError(err instanceof Error ? err.message : String(err));
      setResetting(false);
    }
  }

  return (
    <div className="pageStack">
      <PageHeader eyebrow="League" title="Settings" subtitle="How the week plays, and the save in this browser." />

      <section className="card" aria-labelledby="settings-play">
        <h3 id="settings-play" className="m-0 text-base font-bold">Play</h3>
        <div className="settingList">
          <label className="settingRow">
            <input
              type="checkbox"
              checked={confirmPlay}
              onChange={(event) => dispatch(setConfirmPlay(event.target.checked))}
            />
            <span>
              <span className="settingTitle">Ask before playing</span>
              <span className="settingDetail">A week and a playoff round wait for a yes. Signing day and the next season stay one click.</span>
            </span>
          </label>
          <label className="settingRow">
            <input
              type="checkbox"
              checked={showWinChance}
              onChange={(event) => dispatch(setShowWinChance(event.target.checked))}
            />
            <span>
              <span className="settingTitle">Show the matchup estimate</span>
              <span className="settingDetail">The hub plays the matchup 160 times through the game engine and shows how often you win. The real game is played once.</span>
            </span>
          </label>
        </div>
        <h4 className="planSubhead">Game reveal</h4>
        <p className="text-xs text-gray-500 mt-1 mb-0">How your game is shown after you play a week or a playoff round. With reduced motion on in your device settings, it is always instant.</p>
        <ChoiceGroup label="Game reveal" value={gameReveal} options={REVEAL_OPTIONS} onChange={(value) => dispatch(setGameReveal(value))} />
      </section>

      <section className="card" aria-labelledby="settings-display">
        <h3 id="settings-display" className="m-0 text-base font-bold">Display</h3>
        <h4 className="planSubhead">Theme</h4>
        <ChoiceGroup label="Theme" value={theme} options={THEME_OPTIONS} onChange={(value) => dispatch(setTheme(value))} />
        <h4 className="planSubhead">Density</h4>
        <ChoiceGroup label="Density" value={density} options={DENSITY_OPTIONS} onChange={(value) => dispatch(setDensity(value))} />
        <h4 className="planSubhead">Team names and logos</h4>
        <p className="text-xs text-gray-500 mt-1 mb-2">
          {editedTeams > 0
            ? `You have edited ${editedTeams} program${editedTeams === 1 ? '' : 's'}. Edit any team from its page.`
            : 'Rename any program or change its logo from its team page.'}
        </p>
        {editedTeams > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (window.confirm(`Restore the original names and logos for all ${editedTeams} edited program${editedTeams === 1 ? '' : 's'}?`)) {
                dispatch(clearAllTeamOverrides());
              }
            }}
          >
            Restore all original names
          </button>
        )}
      </section>

      <section className="card" aria-labelledby="settings-backup">
        <h3 id="settings-backup" className="m-0 text-base font-bold">Backup</h3>
        <p className="text-xs text-gray-500 mt-1 mb-3">
          The career lives only in this browser. Download a backup to keep it safe from cleared site data, or to move it to another browser or device. A backup holds the career and these settings.
        </p>
        <div className="backupActions">
          <button type="button" className="btn btn-primary" onClick={onDownloadBackup}>Download a backup</button>
          <button type="button" className="btn" onClick={() => restoreInput.current?.click()}>Restore from a backup</button>
          <input
            ref={restoreInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void onRestoreBackup(file);
            }}
          />
        </div>
        {backupNote && (
          <p className={`text-sm mt-2 mb-0 ${backupNote.error ? 'text-red-600' : 'mutedText'}`} role={backupNote.error ? 'alert' : 'status'}>
            {backupNote.text}
          </p>
        )}
      </section>

      <section className="card newGameCard" aria-labelledby="settings-save">
        <div>
          <h3 id="settings-save" className="sectionTitle">Save</h3>
          <p className="sectionSubtitle">
            The career stays in this browser. Resetting it clears the season, the roster, and the recruiting board. Your preferences here stay.
          </p>
          {resetError && (
            <p className="text-sm text-red-600 mt-2 mb-0" role="alert">{resetError}</p>
          )}
        </div>
        <button type="button" className="btn btn-danger" onClick={onResetSave} disabled={resetting}>
          {resetting ? 'Resetting…' : 'Reset save'}
        </button>
      </section>
    </div>
  );
}

export default SettingsPage;
