/**
 * Shown while redux-persist rehydrates saved state from storage.
 */
function BootstrapSplash() {
  return (
    <div className="bootstrap-splash" role="status" aria-live="polite" aria-busy="true">
      <div className="bootstrap-splash-inner">
        <div className="bootstrap-splash-mark" aria-hidden />
        <p className="bootstrap-splash-title">College Lacrosse Head Coach</p>
        <p className="bootstrap-splash-sub">Loading your dynasty…</p>
      </div>
    </div>
  );
}

export default BootstrapSplash;
