import { resetCoach } from '../coach/coachSlice';
import { resetSeason } from '../season/seasonSlice';
import type { AppDispatch } from '../../store/store';
import { persistor } from '../../store/persistor';

/** Clears the career and the season. Display preferences stay. */
export async function eraseSave(dispatch: AppDispatch): Promise<void> {
  dispatch(resetCoach());
  dispatch(resetSeason({ force: true }));
  await persistor.flush();
}
