import { useMemo, useState } from 'react';
import { acceptJobOffer, declineAllJobOffers, setDraftClaim, togglePortalClaim } from '../features/coach/coachSlice';
import { initializeManagedRoster } from '../features/coach/careerThunks';
import { selectTeamRecords } from '../features/season/seasonSlice';
import {
  PORTAL_CLAIM_CAP,
  buildCoachPool,
  buildDraftBoard,
  buildPortalBoard,
  draftPickIndex,
  prospectsAvailableAtPick,
  type StaffCoach,
} from '../sim/offseasonMarket';
import { previewOffseasonDepartures } from '../sim/rosterManagement';
import { playerYearLabel } from '../sim/rosterSummary';
import { useAppDispatch, useAppSelector } from '../store/hooks';

const ARCHETYPE_LABEL: Record<StaffCoach['archetype'], string> = {
  RECRUITER: 'Recruiter',
  TACTICIAN: 'Tactician',
  DEVELOPER: 'Developer',
};

function OffseasonMarket() {
  const dispatch = useAppDispatch();
  const [offerError, setOfferError] = useState<string | null>(null);
  const coach = useAppSelector((state) => state.coach);
  const teams = useAppSelector((state) => state.league.teams);
  const conferences = useAppSelector((state) => state.league.conferences);
  const season = useAppSelector((state) => state.season);
  const records = useAppSelector(selectTeamRecords);
  const selectedTeam = teams.find((team) => team.id === coach.selectedTeamId) ?? null;
  const claims = coach.portalClaimIds ?? [];
  const draftClaimId = coach.draftClaimId ?? null;
  const scholarships = coach.scholarshipsAvailable ?? 0;
  const nextSeed = (season.seasonSeed ?? 0) + 1;

  const departures = useMemo(() => {
    if (!selectedTeam || !coach.managedRoster?.length) return [];
    return previewOffseasonDepartures(coach.managedRoster, selectedTeam, nextSeed, {
      coachArchetype: coach.profile?.archetype,
      developmentSkill: coach.skillTree?.development ?? 0,
      operationsSkill: coach.skillTree?.operations ?? 0,
      facilitiesLevel: coach.programResources?.facilities ?? 50,
      boostersLevel: coach.programResources?.boosters ?? 50,
    });
  }, [coach.managedRoster, coach.profile?.archetype, coach.programResources, coach.skillTree, nextSeed, selectedTeam]);

  const portal = useMemo(
    () => (selectedTeam ? buildPortalBoard(teams, selectedTeam.id, nextSeed, season.year) : []),
    [nextSeed, season.year, selectedTeam, teams],
  );
  const draftBoard = useMemo(() => buildDraftBoard(nextSeed, season.year), [nextSeed, season.year]);
  const pickIndex = selectedTeam ? draftPickIndex(selectedTeam.id, teams, records) : 0;
  const available = useMemo(
    () => prospectsAvailableAtPick(draftBoard, pickIndex).slice(0, 6),
    [draftBoard, pickIndex],
  );
  const coaches = useMemo(
    () => (selectedTeam ? buildCoachPool(teams, season.seasonSeed, season.year, selectedTeam.id) : []),
    [season.seasonSeed, season.year, selectedTeam, teams],
  );
  const conferenceName = useMemo(() => new Map(conferences.map((conference) => [conference.id, conference.name])), [conferences]);
  const offerIds = new Set((coach.pendingJobOffers ?? []).map((offer) => offer.teamId));
  const marketCoaches = coaches
    .filter((staff) => staff.hiring || offerIds.has(staff.teamId))
    .sort((a, b) => Number(offerIds.has(b.teamId)) - Number(offerIds.has(a.teamId)) || b.skill - a.skill);
  const transfers = departures.filter((departure) => departure.reason === 'transfer');
  const graduates = departures.filter((departure) => departure.reason === 'graduate');
  const seatsUsed = claims.length + (draftClaimId ? 1 : 0);
  const seatsThatFit = Math.min(seatsUsed, scholarships);
  const portalRoom = Math.max(0, scholarships - (draftClaimId ? 1 : 0));
  const canAddPortal = claims.length < PORTAL_CLAIM_CAP && claims.length < portalRoom;
  const canSelectDraft = scholarships - claims.length > 0 || draftClaimId != null;

  async function onAcceptOffer(teamId: string) {
    setOfferError(null);
    try {
      await dispatch(acceptJobOffer(teamId)).unwrap();
      await dispatch(initializeManagedRoster()).unwrap();
    } catch (error) {
      console.error('Failed to accept coach job offer.', error);
      setOfferError('The coaching move did not complete. Reload the page and try again.');
    }
  }

  if (!selectedTeam) return null;

  return (
    <section className="card" aria-labelledby="offseason-market-title">
      <h3 id="offseason-market-title" className="m-0 text-base font-bold">Roster market</h3>
      <p className="text-xs text-gray-500 mt-1 mb-3">
        Scholarships left: {scholarships}. Portal claims and the draft pick share that number.
        {' '}
        {seatsThatFit} of {seatsUsed} reserved
        {seatsUsed > scholarships ? '. Extra claims are dropped when the next season begins.' : '.'}
      </p>

      <div className="marketGrid">
        <div>
          <h4 className="marketHeading">Leaving</h4>
          {departures.length === 0 ? (
            <p className="text-sm text-gray-500 m-0">Nobody is scheduled to leave.</p>
          ) : (
            <ul className="marketList">
              {graduates.map((departure) => (
                <li key={departure.player.id} className="marketRow">
                  <span>
                    <strong>{departure.player.name}</strong>
                    <span className="pollNick">{playerYearLabel(departure.player.year)} · {departure.player.position} · Graduate</span>
                  </span>
                  <span className="tabular">{departure.player.overall}</span>
                </li>
              ))}
              {transfers.map((departure) => (
                <li key={departure.player.id} className="marketRow">
                  <span>
                    <strong>{departure.player.name}</strong>
                    <span className="pollNick">{playerYearLabel(departure.player.year)} · {departure.player.position} · Portal</span>
                  </span>
                  <span className="tabular">{departure.player.overall}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="marketHeading">Transfer portal</h4>
          <ul className="marketList">
            {portal.slice(0, 8).map((entrant) => {
              const claimed = claims.includes(entrant.id);
              return (
                <li key={entrant.id} className={`marketRow ${claimed ? 'marketRow-claimed' : ''}`}>
                  <span>
                    <strong>{entrant.name}</strong>
                    <span className="pollNick">
                      {playerYearLabel(entrant.year)} · {entrant.position} · {entrant.overall} · {entrant.originName}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn text-xs"
                    aria-pressed={claimed}
                    aria-label={claimed ? `Remove ${entrant.name} from the portal` : `Add ${entrant.name} from the portal`}
                    disabled={!claimed && !canAddPortal}
                    onClick={() => dispatch(togglePortalClaim(entrant.id))}
                  >
                    {claimed ? 'Remove' : 'Add'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="marketSection">
        <h4 className="marketHeading">Supplemental draft · pick {pickIndex + 1} of {teams.length}</h4>
        {available.length === 0 ? (
          <p className="text-sm text-gray-500 m-0">The board is gone before this pick. The high school class already did this work.</p>
        ) : (
          <ul className="marketList">
            {available.map((prospect) => {
              const claimed = draftClaimId === prospect.id;
              return (
                <li key={prospect.id} className={`marketRow ${claimed ? 'marketRow-claimed' : ''}`}>
                  <span>
                    <strong>{prospect.name}</strong>
                    <span className="pollNick">{prospect.position} · {prospect.stars}★ · potential {prospect.potential}</span>
                  </span>
                  <button
                    type="button"
                    className="btn text-xs"
                    aria-pressed={claimed}
                    aria-label={claimed ? `Pass on ${prospect.name}` : `Select ${prospect.name}`}
                    disabled={!claimed && !canSelectDraft}
                    onClick={() => dispatch(setDraftClaim(prospect.id))}
                  >
                    {claimed ? 'Pass' : 'Select'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="marketSection">
        <div className="weekActionBar">
          <h4 className="marketHeading m-0">Coach pool</h4>
          {coach.pendingJobOffers.length > 0 && (
            <button type="button" className="btn text-xs" onClick={() => dispatch(declineAllJobOffers())}>
              Decline offers (+3 security)
            </button>
          )}
        </div>
        {offerError && <p className="text-xs text-red-600 mt-2 mb-0">{offerError}</p>}
        {marketCoaches.length === 0 ? (
          <p className="text-sm text-gray-500 mt-2 mb-0">No program is searching. Your seat is the job.</p>
        ) : (
          <ul className="marketList mt-2">
            {marketCoaches.map((staff) => {
              const school = teams.find((team) => team.id === staff.teamId);
              const offer = coach.pendingJobOffers.find((item) => item.teamId === staff.teamId);
              return (
                <li key={staff.id} className="marketRow">
                  <span>
                    <strong>{staff.name}</strong>
                    <span className="pollNick">
                      {ARCHETYPE_LABEL[staff.archetype]} · age {staff.age} · skill {staff.skill}
                      {school ? ` · ${school.schoolName}` : ''}
                      {school ? ` · ${conferenceName.get(school.conferenceId) ?? 'Independent'}` : ''}
                    </span>
                  </span>
                  {offer ? (
                    <button type="button" className="btn btn-primary text-xs" onClick={() => void onAcceptOffer(staff.teamId)}>
                      {offer.tier === 'UPGRADE' ? 'Take upgrade' : 'Take job'}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-500">Open search</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export default OffseasonMarket;
