import { useMemo } from 'react';
import { hireAssistant } from '../features/coach/coachSlice';
import {
  ASSISTANT_ROLE_LABELS,
  ASSISTANT_ROLES,
  assistantCandidates,
  staffEffectLines,
  VACANT_RATING,
  type AssistantCandidate,
  type AssistantCoach,
  type StaffDeparture,
} from '../sim/assistants';
import { prestigeStars, prestigeStarText } from '../sim/prestige';
import { useAppDispatch } from '../store/hooks';
import type { Team } from '../types/sim';

type StaffPanelProps = {
  staff: AssistantCoach[] | undefined;
  departures: StaffDeparture[];
  /** Hiring is open between seasons only. */
  canHire: boolean;
  teamId: string;
  effectivePrestige: number;
  seasonSeed: number;
  year: number;
  teams: Team[];
};

function ratingTone(rating: number): string {
  if (rating >= 80) return 'staffRating staffRating-elite';
  if (rating >= 66) return 'staffRating staffRating-good';
  if (rating >= 56) return 'staffRating';
  return 'staffRating staffRating-weak';
}

/** The four assistants, what each one does, who left, and who is on the market. */
function StaffPanel({ staff, departures, canHire, teamId, effectivePrestige, seasonSeed, year, teams }: StaffPanelProps) {
  const dispatch = useAppDispatch();
  const lines = staffEffectLines(staff);
  const candidates = useMemo(() => assistantCandidates(seasonSeed, year, teamId), [seasonSeed, teamId, year]);
  const onStaffIds = new Set((staff ?? []).map((coach) => coach.id));

  function hire(candidate: AssistantCandidate) {
    const current = staff?.find((coach) => coach.role === candidate.role);
    const replacing = current ? ` ${current.name} (${current.rating}) leaves the staff.` : '';
    if (!window.confirm(`Hire ${candidate.name} (${candidate.rating}) as ${ASSISTANT_ROLE_LABELS[candidate.role].toLowerCase()}?${replacing}`)) return;
    dispatch(hireAssistant(candidate));
  }

  return (
    <section className="card" id="staff" aria-labelledby="staff-title">
      <h3 id="staff-title" className="text-base font-bold m-0">Assistant coaches</h3>
      <p className="text-xs text-gray-500 mt-1 mb-3">
        A 60 is a league-average hire. Coordinators move their side of the ball and the install that drills it; an empty
        seat plays at {VACANT_RATING}. The best assistants get hired away as head coaches, more often after a playoff year.
      </p>
      {departures.length > 0 && (
        <ul className="staffNews" aria-label="Staff changes">
          {departures.map((row) => (
            <li key={`${row.role}-${row.name}`}>
              <strong>{row.name}</strong> ({ASSISTANT_ROLE_LABELS[row.role].toLowerCase()}, {row.rating}){' '}
              {row.reason === 'head-coach'
                ? `left to be head coach at ${teams.find((team) => team.id === row.teamId)?.schoolName ?? 'another program'}.`
                : 'retired.'}
            </li>
          ))}
        </ul>
      )}
      {!staff ? (
        <p className="text-sm text-gray-500 m-0">Your staff arrives with the first game of the season.</p>
      ) : (
        <ul className="staffList">
          {ASSISTANT_ROLES.map((role) => {
            const coach = staff.find((row) => row.role === role);
            return (
              <li key={role} className="staffRow">
                <div>
                  <div className="staffRole">{ASSISTANT_ROLE_LABELS[role]}</div>
                  {coach ? (
                    <div>
                      <strong>{coach.name}</strong>
                      <div className="pollNick">Age {coach.age} · {coach.tenure === 0 ? 'new hire' : `${coach.tenure} yr${coach.tenure === 1 ? '' : 's'} on staff`}</div>
                    </div>
                  ) : (
                    <div className="text-red-600 text-sm font-semibold">Vacant{canHire ? ': hire below' : ''}</div>
                  )}
                  <div className="staffEffect">{lines[role]}</div>
                </div>
                <span className={ratingTone(coach?.rating ?? VACANT_RATING)}>{coach?.rating ?? VACANT_RATING}</span>
              </li>
            );
          })}
        </ul>
      )}
      {canHire && (
        <>
          <h4 className="planSubhead">On the market</h4>
          <ul className="staffList">
            {candidates.map((candidate) => {
              const current = staff?.find((coach) => coach.role === candidate.role);
              const hired = onStaffIds.has(candidate.id);
              const tooBig = candidate.minPrestige > effectivePrestige;
              const upgrade = candidate.rating - (current?.rating ?? VACANT_RATING);
              return (
                <li key={candidate.id} className="staffRow">
                  <div>
                    <div className="staffRole">{ASSISTANT_ROLE_LABELS[candidate.role]}</div>
                    <div>
                      <strong>{candidate.name}</strong>
                      <div className="pollNick">Age {candidate.age}</div>
                      <div className={upgrade > 0 ? 'text-green-600 text-xs font-semibold' : 'text-gray-500 text-xs'}>
                        {upgrade > 0 ? `+${upgrade}` : upgrade} on your {current ? 'current hire' : 'empty seat'}
                      </div>
                    </div>
                    {tooBig && (
                      <div className="staffEffect">Wants a {prestigeStarText(prestigeStars(candidate.minPrestige))} program or better.</div>
                    )}
                  </div>
                  <span className="staffHire">
                    <span className={ratingTone(candidate.rating)}>{candidate.rating}</span>
                    {hired ? (
                      <span className="text-xs text-green-600 font-semibold">On staff</span>
                    ) : (
                      <button type="button" className="btn text-xs" disabled={tooBig} onClick={() => hire(candidate)}>
                        Hire
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {!canHire && staff && (
        <p className="text-xs text-gray-500 mt-2 mb-0">Assistants are hired between seasons: after the bracket and before week 1.</p>
      )}
    </section>
  );
}

export default StaffPanel;
