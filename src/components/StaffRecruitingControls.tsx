import { useState } from 'react';
import { runAutoRecruiting, setAutoRecruiting } from '../features/coach/coachSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

type StaffRecruitingControlsProps = {
  /** Recruiting periods only run with regular-season weeks. */
  canPlan: boolean;
};

function StaffRecruitingControls({ canPlan }: StaffRecruitingControlsProps) {
  const dispatch = useAppDispatch();
  const autoRecruiting = useAppSelector((state) => state.coach.autoRecruiting ?? false);
  const [planned, setPlanned] = useState(false);

  async function onPlan() {
    const applied = await dispatch(runAutoRecruiting()).unwrap();
    setPlanned(applied);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="settingRow" style={{ flex: '1 1 16rem' }}>
        <input
          type="checkbox"
          checked={autoRecruiting}
          onChange={(event) => dispatch(setAutoRecruiting(event.target.checked))}
        />
        <span>
          <span className="settingTitle">Staff runs recruiting</span>
          <span className="settingDetail">
            Before each week your staff drops lost targets, fills the board to your open scholarships and position
            needs, sets the best pitch, and puts the hours on prospects you can still close.
          </span>
        </span>
      </label>
      <div className="text-right">
        <button type="button" className="btn text-sm" onClick={onPlan} disabled={!canPlan}>
          Plan this week
        </button>
        {planned && (
          <div className="text-xs text-gray-500 mt-1" aria-live="polite">
            {autoRecruiting ? 'Board and hours set. Your staff plans again before the week plays.' : 'Board and hours set. Adjust anything before you play.'}
          </div>
        )}
      </div>
    </div>
  );
}

export default StaffRecruitingControls;
