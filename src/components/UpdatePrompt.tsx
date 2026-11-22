import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { persistor } from '../store/persistor';

/**
 * The app installs as a PWA and plays offline. When a new version is deployed it waits
 * for the player: reloading mid-week is their call, and the career is flushed to storage
 * first so nothing in flight is lost.
 */
function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  // The "ready offline" note is a one-time heads-up; let it go on its own.
  useEffect(() => {
    if (!offlineReady) return undefined;
    const timer = window.setTimeout(() => setOfflineReady(false), 8000);
    return () => window.clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (needRefresh) {
    return (
      <div className="statusBanner updateBanner" role="status" aria-live="polite">
        <span>
          <strong>A new version of the game is ready.</strong> Reload to update. Your career is saved first.
        </span>
        <span className="updateBannerActions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await persistor.flush();
              await updateServiceWorker(true);
            }}
          >
            Reload now
          </button>
          <button type="button" className="btn" onClick={() => setNeedRefresh(false)}>Later</button>
        </span>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div className="statusBanner updateBanner" role="status" aria-live="polite">
        <span>
          <strong>Ready to play offline.</strong> The game is saved on this device and now loads without a connection.
        </span>
        <span className="updateBannerActions">
          <button type="button" className="btn" onClick={() => setOfflineReady(false)}>OK</button>
        </span>
      </div>
    );
  }

  return null;
}

export default UpdatePrompt;
