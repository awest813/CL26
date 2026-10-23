import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { eraseSave } from '../features/settings/eraseSave';
import { setConfirmPlay, setShowWinChance, setTheme, type ThemePreference } from '../features/settings/settingsSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import PageHeader from '../components/PageHeader';

const THEME_OPTIONS: { value: ThemePreference; label: string; detail: string }[] = [
  { value: 'system', label: 'System', detail: 'Follows your device: light by day, dark if your device is set to dark.' },
  { value: 'light', label: 'Light', detail: 'Always the light field-green look.' },
  { value: 'dark', label: 'Dark', detail: 'Always dark, easier on the eyes at night.' },
];

function SettingsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const confirmPlay = useAppSelector((state) => state.settings.confirmPlay);
  const showWinChance = useAppSelector((state) => state.settings.showWinChance);
  const theme = useAppSelector((state) => state.settings.theme ?? 'system');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

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
      </section>

      <section className="card" aria-labelledby="settings-display">
        <h3 id="settings-display" className="m-0 text-base font-bold">Display</h3>
        <div className="choiceGrid themePicker mt-3" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={theme === option.value}
              className="choiceChip"
              onClick={() => dispatch(setTheme(option.value))}
            >
              <span className="font-semibold">{option.label}</span>
              <span className="choiceChipHelp">{option.detail}</span>
            </button>
          ))}
        </div>
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
