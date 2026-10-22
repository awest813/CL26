import { useMemo, useState } from 'react';
import TeamLogo from '../components/TeamLogo';
import PrestigeStars from '../components/PrestigeStars';
import { selectRankingTeams, selectTeamRecords } from '../features/season/seasonSlice';
import { hasSeasonHistoryForYear } from '../sim/seasonPhase';
import { prestigeStars, prestigeStarText } from '../sim/prestige';
import type { JobOffer } from '../types/sim';
import { acceptJobOffer, careerSetupFromPrestige, declineAllJobOffers, togglePortalClaim } from '../features/coach/coachSlice';
import { initializeManagedRoster } from '../features/coach/careerThunks';
import { leagueSeasonRosterSeed } from '../sim/leagueRosterSeed';
import {
  PORTAL_CLAIM_CAP,
  buildCoachPool,
  buildPortalBoard,
  buildProDraft,
} from '../sim/offseasonMarket';
import { previewOffseasonDepartures } from '../sim/rosterManagement';
import { draftLedger, expectedWinsByTeamId } from '../sim/programLedger';
import { playerYearLabel } from '../sim/rosterSummary';
import { useAppDispatch, useAppSelector } from '../store/hooks';

const JOB_TIER_LABEL: Record<JobOffer['tier'], string> = {
  UPGRADE: 'Upgrade',
  LATERAL: 'Lateral move',
  STEP_DOWN: 'Step down',
};

function OffseasonMarket() {
  const dispatch = useAppDispatch();
  const [offerError, setOfferError] = useState<string | null>(null);
  const coach = useAppSelector((state) => state.coach);
  const teams = useAppSelector((state) => state.league.teams);
  const conferences = useAppSelector((state) => state.league.conferences);
  // A job reads the program as it stands now, the prestige accepting it carries over.
  const currentTeams = useAppSelector(selectRankingTeams);
  const records = useAppSelector(selectTeamRecords);
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
  const proDraftLedger = draftLedger(season);
  const proDraft = useMemo(
    () => buildProDraft({
      teams,
      rosterSeed: leagueSeasonRosterSeed(season.seasonSeed ?? 0),
      seasonSeed: season.seasonSeed ?? 0,
      year: season.year,
      userTeamId: selectedTeam?.id ?? null,
      userRoster: coach.managedRoster,
      ledger: proDraftLedger,
    }),
    [coach.managedRoster, proDraftLedger, season.seasonSeed, season.year, selectedTeam?.id, teams],
  );
  const yourPicks = selectedTeam ? proDraft.filter((pick) => pick.collegeId === selectedTeam.id) : [];
  const yourPickById = new Map(yourPicks.map((pick) => [pick.playerId, pick]));
  // Openings are announced when the season is recorded; until then the market waits.
  const seasonRecorded = hasSeasonHistoryForYear(coach.seasonHistory, season.year);
  const openingIds = useMemo(
    () => new Set(seasonRecorded ? coach.jobOpenings ?? [] : []),
    [coach.jobOpenings, seasonRecorded],
  );
  const coaches = useMemo(
    () => (selectedTeam ? buildCoachPool(teams, season.seasonSeed, season.year, selectedTeam.id, openingIds) : []),
    [openingIds, season.seasonSeed, season.year, selectedTeam, teams],
  );
  const conferenceName = useMemo(() => new Map(conferences.map((conference) => [conference.id, conference.name])), [conferences]);
  const offerIds = new Set((coach.pendingJobOffers ?? []).map((offer) => offer.teamId));
  const expectedWins = useMemo(() => expectedWinsByTeamId(currentTeams), [currentTeams]);
  const marketCoaches = coaches
    .filter((staff) => staff.hiring || offerIds.has(staff.teamId))
    .map((staff) => ({ staff, prestige: currentTeams.find((team) => team.id === staff.teamId)?.prestige ?? 0 }))
    .sort((a, b) => Number(offerIds.has(b.staff.teamId)) - Number(offerIds.has(a.staff.teamId)) || b.prestige - a.prestige);
  const currentPrestige = currentTeams.find((team) => team.id === selectedTeam?.id)?.prestige ?? selectedTeam?.prestige ?? 0;
  const committedHere = coach.recruitPool.filter((recruit) => recruit.committedTeamId === selectedTeam?.id).length
    + (coach.signedRecruitsByYear[season.year]?.length ?? 0);

  /** Why the seat is open: the old staff missed badly, or moved on. */
  function openingReason(teamId: string, coachName: string): string {
    const record = records[teamId];
    if (!record) return `${coachName} moved on.`;
    const shortfall = (expectedWins.get(teamId) ?? 6) - record.wins;
    return shortfall >= 1.5
      ? `${coachName} was let go after ${record.wins}–${record.losses}.`
      : `${coachName} moved on after ${record.wins}–${record.losses}.`;
  }
  const transfers = departures.filter((departure) => departure.reason === 'transfer');
  const graduates = departures.filter((departure) => departure.reason === 'graduate');
  const seatsThatFit = Math.min(claims.length, scholarships);
  const canAddPortal = claims.length < PORTAL_CLAIM_CAP && claims.length < scholarships;
  const earlyPros = (coach.managedRoster ?? []).filter((player) => {
    const pick = yourPickById.get(player.id);
    return Boolean(pick?.early) && !departures.some((departure) => departure.player.id === player.id);
  });

  async function onAcceptOffer(teamId: string, prestige: number) {
    const school = teams.find((team) => team.id === teamId)?.schoolName ?? 'the new program';
    const leaving = [
      committedHere > 0 ? `${committedHere} commit${committedHere === 1 ? '' : 's'}` : null,
      'your assistants',
      'the prestige you built',
    ].filter(Boolean).join(', ');
    if (!window.confirm(`Take the ${school} job (${prestigeStarText(prestigeStars(prestige))})? ${leaving} stay at ${selectedTeam?.schoolName ?? 'your program'}. You take over ${school}'s roster, staff, and standing.`)) return;
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
              const origin = teams.find((team) => team.schoolName === entrant.originName);
              return (
                <li key={entrant.id} className={`marketRow ${claimed ? 'marketRow-claimed' : ''}`}>
                  <span className="programLockup">
                    {origin && <TeamLogo team={origin} size="sm" />}
                    <span>
                      <strong>{entrant.name}</strong>
                      <span className="pollNick">
                        {playerYearLabel(entrant.year)} · {entrant.position} · {entrant.overall} · {entrant.originName}
                      </span>
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
            const college = teams.find((team) => team.id === pick.collegeId);
            return (
              <li key={`${pick.pick}-${pick.playerId}`} className={`marketRow ${yours ? 'marketRow-claimed' : ''}`}>
                <span className="draftSlot tabular">{pick.pick}</span>
                <span className="programLockup">
                  {college && <TeamLogo team={college} size="sm" />}
                  <span>
                    <strong>{pick.playerName}</strong>
                    <span className="pollNick">
                      {playerYearLabel(pick.year)} · {pick.position} · {pick.overall} · {pick.collegeName}
                      {pick.early ? ' · Early entry' : ''}
                      {yours ? ' · Your player' : ''}
                    </span>
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
          <h4 className="marketHeading m-0">Head-coaching jobs</h4>
          {coach.pendingJobOffers.length > 0 && (coach.employment ?? 'ACTIVE') !== 'FIRED' && (
            <button type="button" className="btn text-xs" onClick={() => dispatch(declineAllJobOffers())}>
              Stay and decline (+3 security)
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1 mb-0">
          {!seasonRecorded
            ? 'Jobs open when the season is recorded: staffs that missed badly are let go, and a few coaches move on.'
            : (coach.employment ?? 'ACTIVE') === 'FIRED'
              ? 'The AD let you go. The offer below is the seat that will have you.'
              : coach.pendingJobOffers.length > 0
                ? `${coach.pendingJobOffers.length} program${coach.pendingJobOffers.length === 1 ? '' : 's'} called. A title reaches furthest, then a playoff run, then hitting the win target.`
                : 'No one called. Make the field, or win the title, to get a call from a bigger program.'}
        </p>
        {offerError && <p className="text-xs text-red-600 mt-2 mb-0">{offerError}</p>}
        {seasonRecorded && marketCoaches.length === 0 && (
          <p className="text-sm text-gray-500 mt-2 mb-0">No program is searching. Your seat is the job.</p>
        )}
        {marketCoaches.length > 0 && (
          <ul className="marketList mt-2">
            {marketCoaches.map(({ staff, prestige }) => {
              const school = teams.find((team) => team.id === staff.teamId);
              const offer = coach.pendingJobOffers.find((item) => item.teamId === staff.teamId);
              const expectations = careerSetupFromPrestige(prestige).programExpectations;
              return (
                <li key={staff.id} className={`marketRow jobRow${offer ? ' jobRow-offer' : ''}`}>
                  <span className="programLockup">
                    {school && <TeamLogo team={school} size="sm" />}
                    <span>
                      <strong>{school?.schoolName ?? staff.teamId}</strong>{' '}
                      {offer && <span className={`jobTier jobTier-${offer.tier}`}>{JOB_TIER_LABEL[offer.tier]}</span>}
                      <span className="pollNick">
                        {school ? `${conferenceName.get(school.conferenceId) ?? 'Independent'} · ${school.region}` : ''}
                        {' · '}Targets: {expectations.winTarget}+ wins, Top {expectations.rankTarget}
                      </span>
                      <span className="jobMeta">
                        <PrestigeStars prestige={prestige} showTier />
                        <span className="pollNick">{openingReason(staff.teamId, staff.name)}</span>
                      </span>
                    </span>
                  </span>
                  {offer ? (
                    <button type="button" className="btn btn-primary text-xs" onClick={() => void onAcceptOffer(staff.teamId, prestige)}>
                      {offer.tier === 'UPGRADE' ? 'Take the upgrade' : 'Take the job'}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-500" title={prestige > currentPrestige ? 'A bigger season gets this call' : undefined}>
                      {prestige > currentPrestige ? 'Not calling yet' : 'Searching'}
                    </span>
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
