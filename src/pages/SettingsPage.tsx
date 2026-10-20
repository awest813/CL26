import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { eraseSave } from '../features/settings/eraseSave';
import { setConfirmPlay, setShowWinChance } from '../features/settings/settingsSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import PageHeader from '../components/PageHeader';

function SettingsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const confirmPlay = useAppSelector((state) => state.settings.confirmPlay);
  const showWinChance = useAppSelector((state) => state.settings.showWinChance);
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
              <span className="settingDetail">A week and a playoff round wait for a yes. Signing day and next year stay one click.</span>
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
              <span className="settingDetail">An estimate sits on the hub matchup and uses both rosters. The sim result is the final score.</span>
            </span>
          </label>
        </div>
      </section>

      <section className="card newGameCard" aria-labelledby="settings-save">
        <div>
          <h3 id="settings-save" className="sectionTitle">Save</h3>
          <p className="sectionSubtitle">
            The career stays in this browser. Resetting it clears the season, the roster, and the recruiting board. These two preferences stay.
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
