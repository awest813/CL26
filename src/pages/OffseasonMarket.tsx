import { useMemo, useState } from 'react';
import { acceptJobOffer, declineAllJobOffers, togglePortalClaim } from '../features/coach/coachSlice';
import { initializeManagedRoster } from '../features/coach/careerThunks';
import { leagueSeasonRosterSeed } from '../sim/leagueRosterSeed';
import {
  PORTAL_CLAIM_CAP,
  buildCoachPool,
  buildPortalBoard,
  buildProDraft,
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
  const selectedTeam = teams.find((team) => team.id === coach.selectedTeamId) ?? null;
  const claims = coach.portalClaimIds ?? [];
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
  const proDraft = useMemo(
    () => buildProDraft({
      teams,
      rosterSeed: leagueSeasonRosterSeed(season.seasonSeed ?? 0),
      seasonSeed: season.seasonSeed ?? 0,
      year: season.year,
      userTeamId: selectedTeam?.id ?? null,
      userRoster: coach.managedRoster,
    }),
    [coach.managedRoster, season.seasonSeed, season.year, selectedTeam?.id, teams],
  );
  const yourPicks = selectedTeam ? proDraft.filter((pick) => pick.collegeId === selectedTeam.id) : [];
  const yourPickById = new Map(yourPicks.map((pick) => [pick.playerId, pick]));
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
  const seatsThatFit = Math.min(claims.length, scholarships);
  const canAddPortal = claims.length < PORTAL_CLAIM_CAP && claims.length < scholarships;
  const earlyPros = (coach.managedRoster ?? []).filter((player) => {
    const pick = yourPickById.get(player.id);
    return Boolean(pick?.early) && !departures.some((departure) => departure.player.id === player.id);
  });

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
        Scholarships left: {scholarships}. You can claim up to {PORTAL_CLAIM_CAP} portal players.
        {' '}
        {seatsThatFit} of {claims.length} reserved
        {claims.length > scholarships ? '. Extra claims are dropped when the next season begins.' : '.'}
      </p>

      <div className="marketGrid">
        <div>
          <h4 className="marketHeading">Leaving</h4>
          {departures.length === 0 ? (
            <p className="text-sm text-gray-500 m-0">Nobody is scheduled to leave.</p>
          ) : (
            <ul className="marketList">
              {graduates.map((departure) => {
                const pick = yourPickById.get(departure.player.id);
                return (
                  <li key={departure.player.id} className={`marketRow ${pick ? 'marketRow-claimed' : ''}`}>
                    <span>
                      <strong>{departure.player.name}</strong>
                      <span className="pollNick">
                        {playerYearLabel(departure.player.year)} · {departure.player.position} · {pick ? `Rd ${pick.round} · ${pick.clubName}` : 'Undrafted'}
                      </span>
                    </span>
                    <span className="tabular">{departure.player.overall}</span>
                  </li>
                );
              })}
              {earlyPros.map((player) => {
                const pick = yourPickById.get(player.id);
                return (
                  <li key={player.id} className="marketRow marketRow-claimed">
                    <span>
                      <strong>{player.name}</strong>
                      <span className="pollNick">
                        {playerYearLabel(player.year)} · {player.position} · Rd {pick?.round} · {pick?.clubName}
                      </span>
                    </span>
                    <span className="tabular">{player.overall}</span>
                  </li>
                );
              })}
              {transfers.map((departure) => {
                const pick = yourPickById.get(departure.player.id);
                return (
                  <li key={departure.player.id} className={`marketRow ${pick ? 'marketRow-claimed' : ''}`}>
                    <span>
                      <strong>{departure.player.name}</strong>
                      <span className="pollNick">
                        {playerYearLabel(departure.player.year)} · {departure.player.position} · {pick ? `Rd ${pick.round} · ${pick.clubName}` : 'Portal'}
                      </span>
                    </span>
                    <span className="tabular">{departure.player.overall}</span>
                  </li>
                );
              })}
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
        <h4 className="marketHeading">Pro draft</h4>
        <p className="text-xs text-gray-500 mt-0 mb-2">
          Eight Premier Circuit clubs draft college players. Seniors are eligible. A junior at 80 or better can turn pro and does not return.
        </p>
        <p className="text-sm mt-0 mb-2">
          {yourPicks.length === 0
            ? 'Nobody from your program was selected.'
            : `Your program: ${yourPicks.map((pick) => `${pick.playerName} (Rd ${pick.round}, ${pick.clubName})`).join('; ')}.`}
        </p>
        <ul className="marketList">
          {proDraft.map((pick) => {
            const yours = pick.collegeId === selectedTeam.id;
            return (
              <li key={`${pick.pick}-${pick.playerId}`} className={`marketRow ${yours ? 'marketRow-claimed' : ''}`}>
                <span className="draftSlot tabular">{pick.pick}</span>
                <span>
                  <strong>{pick.playerName}</strong>
                  <span className="pollNick">
                    {playerYearLabel(pick.year)} · {pick.position} · {pick.overall} · {pick.collegeName}
                    {pick.early ? ' · Early entry' : ''}
                    {yours ? ' · Your player' : ''}
                  </span>
                </span>
                <span className="draftClub">
                  <strong>{pick.clubName}</strong>
                  <span className="pollNick">Round {pick.round}</span>
                </span>
              </li>
            );
          })}
        </ul>
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
