import { useEffect, useState } from 'react';
import { saveStorage } from '../store/store';
import { requestPersistentSave, storageHealth, type StorageHealth } from '../store/saveStorage';

/** Safari (on a Mac, and every iPhone and iPad browser) clears a site's data after a week without a visit. */
function isSafariEngine(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return iOS || (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|Firefox\/|FxiOS|CriOS/.test(ua));
}

/** Installed to the home screen (or as an app), where Safari does not clear the site's data. */
function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

/** Where the career is kept, how much room it has, and whether the browser may clear it. */
function StorageHealthPanel() {
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void storageHealth(saveStorage).then((result) => { if (live) setHealth(result); });
    return () => { live = false; };
  }, []);

  async function onAsk() {
    setAsking(true);
    const granted = await requestPersistentSave();
    const next = await storageHealth(saveStorage);
    setHealth(next);
    setAsking(false);
    setNote(granted
      ? 'The browser will keep the career until you clear the site data yourself.'
      : granted === false
        ? 'The browser did not agree this time. Browsers decide on their own, often by how much you use the site; installing the game helps. Keep a backup either way.'
        : 'This browser does not take the request. Keep a backup.');
  }

  if (!health) return null;
  const safari = isSafariEngine();
  const installed = isInstalled();
  const where = health.location === 'indexeddb'
    ? "the browser's database (IndexedDB)"
    : health.location === 'localstorage'
      ? "the browser's local storage, a smaller space (the database is unavailable here)"
      : 'nowhere: this browser is not letting the site store data';

  return (
    <div className="storageHealth">
      <h4 id="settings-storage" className="planSubhead">Where your career is saved</h4>
      <ul className="text-sm m-0 pl-4 space-y-1">
        <li>Saved in {where}.</li>
        {health.usage != null && health.quota != null && health.quota > 0 && (
          <li>
            The site uses {megabytes(health.usage)} of the {megabytes(health.quota)} this browser allows it.
          </li>
        )}
        {health.persisted === true && <li>The browser has agreed to keep it: it will not clear the career to free up space.</li>}
        {health.persisted === false && (
          <li>
            The browser may clear it on its own when the device runs low on space.{' '}
            <button type="button" className="textButton" onClick={() => void onAsk()} disabled={asking}>
              {asking ? 'Asking…' : 'Ask the browser to keep it'}
            </button>
          </li>
        )}
        {safari && !installed && (
          <li>
            Safari clears a site&apos;s saved data after 7 days without a visit. On iPhone or iPad, tap Share, then Add to Home Screen,
            and play from there; or download a backup before a break.
          </li>
        )}
      </ul>
      {note && <p className="text-sm mutedText mt-2 mb-0" role="status">{note}</p>}
    </div>
  );
}

export default StorageHealthPanel;
