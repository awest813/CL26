import { useMemo } from 'react';
import { chooseAssistantSpecialty, hireAssistant } from '../features/coach/coachSlice';
import {
  ASSISTANT_ROLE_LABELS,
  ASSISTANT_ROLES,
  ASSISTANT_SPECIALTIES,
  assistantCandidates,
  SPECIALTY_TENURE,
  specialtyInfo,
  generateStaff,
  staffEffectLines,
  VACANT_RATING,
  type AssistantCandidate,
  type AssistantCoach,
  type AssistantSpecialty,
  type StaffDeparture,
} from '../sim/assistants';
import { coachStars } from '../sim/coachRating';
import { prestigeStars, prestigeStarText } from '../sim/prestige';
import CoachStars from './CoachStars';
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

/** "★★★½ 72": an assistant's stars and rating, for confirmations and news lines. */
function ratingText(rating: number): string {
  return `${prestigeStarText(coachStars(rating))} ${rating}`;
}

/** Stars with the rating number beside them. */
function RatingMark({ rating }: { rating: number }) {
  return (
    <span className="staffMark">
      <CoachStars rating={rating} />
      <span className={ratingTone(rating)}>{rating}</span>
    </span>
  );
}

/** The four assistants, what each one does, who left, and who is on the market. */
function StaffPanel({ staff, departures, canHire, teamId, effectivePrestige, seasonSeed, year, teams }: StaffPanelProps) {
  const dispatch = useAppDispatch();
  // A save from before staffs existed shows (and hires into) the staff the program will field.
  const team = teams.find((row) => row.id === teamId);
  const currentStaff = useMemo(() => staff ?? (team ? generateStaff(team, 'staff') : []), [staff, team]);
  const lines = staffEffectLines(currentStaff);
  const candidates = useMemo(() => assistantCandidates(seasonSeed, year, teamId), [seasonSeed, teamId, year]);
  const onStaffIds = new Set(currentStaff.map((coach) => coach.id));

  function hire(candidate: AssistantCandidate) {
    const current = currentStaff.find((coach) => coach.role === candidate.role);
    const replacing = current ? ` ${current.name} (${ratingText(current.rating)}) leaves the staff.` : '';
    if (!window.confirm(`Hire ${candidate.name} (${ratingText(candidate.rating)}) as ${ASSISTANT_ROLE_LABELS[candidate.role].toLowerCase()}?${replacing}`)) return;
    dispatch(hireAssistant({ candidate, currentStaff }));
  }

  function pickSpecialty(coach: AssistantCoach, specialty: AssistantSpecialty) {
    const info = specialtyInfo(specialty);
    if (!info || !window.confirm(`Make ${coach.name} your ${info.name.toLowerCase()}? ${info.detail} It stays with him.`)) return;
    dispatch(chooseAssistantSpecialty({ assistantId: coach.id, specialty }));
  }

  function specialtyLine(coach: AssistantCoach) {
    const chosen = specialtyInfo(coach.specialty);
    if (chosen) {
      return (
        <div className="perkChosen" title={chosen.detail}>
          <span className="perkBadge">Specialty</span> <strong>{chosen.name}</strong>
          <div className="text-xs text-gray-500">{chosen.detail}</div>
        </div>
      );
    }
    const options = ASSISTANT_SPECIALTIES[coach.role];
    // A save from before staffs existed shows a staff it has not hired yet; nothing to pick.
    if (!staff || coach.tenure < SPECIALTY_TENURE) {
      return (
        <div className="staffEffect">
          After a season on staff: {options[0].name} or {options[1].name}.
        </div>
      );
    }
    return (
      <div className="perkChoice">
        <div className="text-xs font-semibold youMark">Pick a specialty</div>
        {options.map((option) => (
          <button key={option.id} type="button" className="btn text-xs perkOption" onClick={() => pickSpecialty(coach, option.id)}>
            <strong>{option.name}</strong>
            <span>{option.detail}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <section className="card" id="staff" aria-labelledby="staff-title">
      <h3 id="staff-title" className="text-base font-bold m-0">Assistant coaches</h3>
      <p className="text-xs text-gray-500 mt-1 mb-3">
        A 60 (two and a half stars) is a league-average hire; four-star assistants are the ones programs hire away. Coordinators move their side of the ball and the install that drills it; an empty
        seat plays at {VACANT_RATING}. The best assistants get hired away as head coaches, more often after a playoff year.
      </p>
      {departures.length > 0 && (
        <ul className="staffNews" aria-label="Staff changes">
          {departures.map((row) => (
            <li key={`${row.role}-${row.name}`}>
              <strong>{row.name}</strong> ({ASSISTANT_ROLE_LABELS[row.role].toLowerCase()}, {ratingText(row.rating)}){' '}
              {row.reason === 'head-coach'
                ? `left to be head coach at ${teams.find((team) => team.id === row.teamId)?.schoolName ?? 'another program'}.`
                : 'retired.'}
            </li>
          ))}
        </ul>
      )}
      {(

        <ul className="staffList">
          {ASSISTANT_ROLES.map((role) => {
            const coach = currentStaff.find((row) => row.role === role);
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
                  {coach && specialtyLine(coach)}
                </div>
                <RatingMark rating={coach?.rating ?? VACANT_RATING} />
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
              const current = currentStaff.find((coach) => coach.role === candidate.role);
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
                    <RatingMark rating={candidate.rating} />
                    {hired ? (
                      <span className="text-xs text-green-600 font-semibold">On staff</span>
                    ) : (
                      <button
                        type="button"
                        className="btn text-xs"
                        disabled={tooBig}
                        aria-label={`Hire ${candidate.name} as ${ASSISTANT_ROLE_LABELS[candidate.role].toLowerCase()}`}
                        onClick={() => hire(candidate)}
                      >
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
      {!canHire && (
        <p className="text-xs text-gray-500 mt-2 mb-0">Assistants are hired between seasons: after the bracket and before week 1.</p>
      )}
    </section>
  );
}

export default StaffPanel;
