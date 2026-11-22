import { useSyncExternalStore } from 'react';
import { IconWarning } from './UiIcons';
import { getSaveStatus, subscribeSaveStatus, type SaveProblem } from '../store/saveStatus';

const MESSAGES: Record<SaveProblem, { title: string; body: string }> = {
  full: {
    title: 'Your progress is not being saved.',
    body: "This browser's storage for the site is full. Free up space (for example, clear other sites' data in your browser settings), then keep playing: the game saves on your next move and this notice goes away. Anything played since the last save is lost if you close or reload the page first; to keep it now, download a backup from Settings.",
  },
  blocked: {
    title: 'Your progress is not being saved.',
    body: 'This browser is blocking site storage (private browsing or a site-data setting). You can keep playing, but the career is lost when you close or reload the page. Download a backup from Settings to keep it, or allow site data for this site and restore the backup after reloading.',
  },
  failed: {
    title: 'Your last save did not go through.',
    body: 'The browser refused to store the career. The game tries again on your next move and this notice goes away once a save works. Reloading now would lose what you played since the last save; a backup from Settings keeps it.',
  },
};

/** A notice on every page while saves are failing, so progress is never lost silently. */
function SaveStatusBanner() {
  const { problem } = useSyncExternalStore(subscribeSaveStatus, getSaveStatus, getSaveStatus);
  if (!problem) return null;
  const message = MESSAGES[problem];
  return (
    <div className="statusBanner statusBanner-warning" role="alert">
      <span className="statusBanner-icon" aria-hidden>
        <IconWarning />
      </span>
      <span>
        <strong>{message.title}</strong> {message.body}
      </span>
    </div>
  );
}

export default SaveStatusBanner;
