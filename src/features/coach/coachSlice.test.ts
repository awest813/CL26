import assert from 'node:assert';
import { describe, test } from 'node:test';
import type { GameResult, Team } from '../../types/sim.ts';
import { computeWeeklyCoachXp, userWonResult } from './careerThunks.ts';
import {
  addRecruitToBoard,
  applyJobOfferAcceptance,
  applyAutoRecruitingPlan,
  applyRecruitingUpdates,
  clearRecruitPitch,
  coachReducer,
  declineAllJobOffers,
  hireAssistant,
  replaceStarter,
  setManagedRoster,
  setStarterIds,
  initializeRecruitingBoard,
  setRecruitHours,
  setRecruitPitch,
  setPlayerRedshirt,
  setSelectedTeam,
  togglePortalClaim,
} from './coachSlice.ts';
import { generateRoster } from '../../sim/generateRoster.ts';
import { generateStaff } from '../../sim/assistants.ts';

const mockTeams: Team[] = [
  {
    id: 'team-1',
    schoolName: 'North Harbor',
    nickname: 'Anchors',
    conferenceId: 'conf-1',
    region: 'Northeast',
    prestige: 74,
  },
  {
    id: 'team-2',
    schoolName: 'Mesa State',
    nickname: 'Coyotes',
    conferenceId: 'conf-2',
    region: 'West',
    prestige: 61,
  },
];

describe('coach recruiting reducer', () => {
  test('clearing a pitch removes it from the board state', () => {
    let state = coachReducer(undefined, initializeRecruitingBoard({ seed: 2026, teams: mockTeams }));
    const recruitId = state.recruitPool[0]?.id;

    assert.ok(recruitId);

    state = coachReducer(state, addRecruitToBoard({ recruitId, startingInterest: 18 }));
    state = coachReducer(state, setRecruitPitch({ recruitId, pitch: 'PRESTIGE' }));

    assert.strictEqual(state.activePitchesByRecruitId[recruitId], 'PRESTIGE');

    state = coachReducer(state, clearRecruitPitch(recruitId));

    assert.strictEqual(state.activePitchesByRecruitId[recruitId], undefined);
  });

  test('weekly commits fill the recruiting report and free the hours they held', () => {
    let state = coachReducer(undefined, setSelectedTeam('team-1'));
    state = coachReducer(state, initializeRecruitingBoard({ seed: 2026, teams: mockTeams }));
    const [mine, lost, open] = state.recruitPool.map((r) => r.id);
    for (const id of [mine, lost, open]) {
      state = coachReducer(state, addRecruitToBoard({ recruitId: id, startingInterest: 20 }));
      state = coachReducer(state, setRecruitHours({ recruitId: id, hours: 15 }));
      state = coachReducer(state, setRecruitPitch({ recruitId: id, pitch: 'PRESTIGE' }));
    }

    state = coachReducer(state, applyRecruitingUpdates({
      interestUpdates: {},
      commitments: [
        { recruitId: mine, teamId: 'team-1' },
        { recruitId: lost, teamId: 'team-2' },
      ],
    }));

    assert.deepStrictEqual(state.recruitingReport, {
      period: 1,
      committedToUserIds: [mine],
      lostTargets: [{ recruitId: lost, teamId: 'team-2' }],
      totalCommits: 2,
      commits: [
        { recruitId: mine, teamId: 'team-1' },
        { recruitId: lost, teamId: 'team-2' },
      ],
    });
    assert.strictEqual(state.weeklyHoursByRecruitId[mine], 0);
    assert.strictEqual(state.weeklyHoursByRecruitId[lost], 0);
    assert.strictEqual(state.weeklyHoursByRecruitId[open], 15);
    assert.strictEqual(state.activePitchesByRecruitId[lost], undefined);

    state = coachReducer(state, setRecruitHours({ recruitId: lost, hours: 10 }));
    assert.strictEqual(state.weeklyHoursByRecruitId[lost], 0, 'committed prospects take no hours');

    // Re-sent commitments from later weeks are not new news.
    state = coachReducer(state, applyRecruitingUpdates({
      interestUpdates: {},
      commitments: [{ recruitId: lost, teamId: 'team-2' }],
    }));
    assert.strictEqual(state.recruitingReport?.totalCommits, 0);
    assert.strictEqual(state.recruitingReport?.period, 2);
  });

  test('a staff plan cannot push the board past the hour caps', () => {
    let state = coachReducer(undefined, setSelectedTeam('team-1'));
    state = coachReducer(state, initializeRecruitingBoard({ seed: 2026, teams: mockTeams }));
    const ids = state.recruitPool.slice(0, 8).map((r) => r.id);
    state = coachReducer(state, applyAutoRecruitingPlan({
      adds: ids.map((recruitId) => ({ recruitId, startingInterest: 30 })),
      removals: [],
      hoursByRecruitId: Object.fromEntries(ids.map((id) => [id, 40])),
      pitchByRecruitId: { [ids[0]]: 'ACADEMIC' },
      priorityIds: ids,
    }));

    const hours = state.boardRecruitIds.map((id) => state.weeklyHoursByRecruitId[id]);
    assert.deepStrictEqual(state.boardRecruitIds, ids);
    assert.ok(hours.every((h) => h <= 20));
    assert.strictEqual(hours.reduce((sum, h) => sum + h, 0), 120);
    assert.strictEqual(state.activePitchesByRecruitId[ids[0]], 'ACADEMIC');
    assert.strictEqual(state.recruitPool[0].interestByTeamId['team-1'] >= 30, true);
  });

  test('a prospect committed elsewhere cannot be added to the board', () => {
    let state = coachReducer(undefined, setSelectedTeam('team-1'));
    state = coachReducer(state, initializeRecruitingBoard({ seed: 2026, teams: mockTeams }));
    const id = state.recruitPool[0].id;
    state = coachReducer(state, applyRecruitingUpdates({ interestUpdates: {}, commitments: [{ recruitId: id, teamId: 'team-2' }] }));
    state = coachReducer(state, addRecruitToBoard({ recruitId: id, startingInterest: 20 }));
    assert.deepStrictEqual(state.boardRecruitIds, []);
  });

  test('setting a pitch for a non-board recruit is ignored', () => {
    const state = coachReducer(
      undefined,
      setRecruitPitch({ recruitId: 'missing-recruit', pitch: 'ACADEMIC' }),
    );

    assert.deepStrictEqual(state.activePitchesByRecruitId, {});
  });

  test('accepting a job keeps signing day resolved and drops only the current class', () => {
    let state = coachReducer(undefined, { type: '@@INIT' });
    state = {
      ...state,
      signedRecruitsByYear: {
        2025: [{ recruitId: 'prior', signedAtYear: 2025, stars: 4, position: 'M' }],
        2026: [{ recruitId: 'current', signedAtYear: 2026, stars: 3, position: 'A' }],
      },
      portalClaimIds: ['portal-1'],
      draftClaimId: 'draft-1',
      employment: 'FIRED',
      pendingJobOffers: [{ teamId: 'team-2', tier: 'STEP_DOWN', presentedAtYear: 2026 }],
    };

    state = coachReducer(
      state,
      applyJobOfferAcceptance({
        teamId: 'team-2',
        seasonYear: 2026,
        careerTier: 'STABLE',
        programExpectations: { winTarget: 7, rankTarget: 35, securityBaseline: 58 },
      }),
    );

    assert.strictEqual(state.selectedTeamId, 'team-2');
    assert.strictEqual(state.managedRoster, null);
    assert.deepStrictEqual(state.signedRecruitsByYear[2026], []);
    assert.strictEqual(state.signedRecruitsByYear[2025]?.[0]?.recruitId, 'prior');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(state.signedRecruitsByYear, 2026), true);
    assert.deepStrictEqual(state.portalClaimIds, []);
    assert.strictEqual(state.draftClaimId, null);
    assert.strictEqual(state.employment, 'ACTIVE');
    assert.deepStrictEqual(state.pendingJobOffers, []);
  });

  test('a firing keeps the landing offer when decline is clicked', () => {
    let state = coachReducer(undefined, { type: '@@INIT' });
    state = {
      ...state,
      employment: 'FIRED',
      jobSecurity: 12,
      pendingJobOffers: [{ teamId: 'team-2', tier: 'STEP_DOWN', presentedAtYear: 2026 }],
    };
    state = coachReducer(state, declineAllJobOffers());
    assert.equal(state.pendingJobOffers.length, 1);
    assert.equal(state.jobSecurity, 12);
  });
});

describe('offseason market claims', () => {
  test('portal claims stop at three and at the scholarships left', () => {
    let state = coachReducer(undefined, { type: '@@INIT' });
    state = { ...state, scholarshipsAvailable: 2 };
    state = coachReducer(state, togglePortalClaim('a'));
    state = coachReducer(state, togglePortalClaim('b'));
    state = coachReducer(state, togglePortalClaim('c'));
    assert.deepStrictEqual(state.portalClaimIds, ['a', 'b']);
  });
});

describe('weekly coach xp', () => {
  test('winning-week bonus applies only when the user won that game', () => {
    assert.strictEqual(computeWeeklyCoachXp(false, 0), 8);
    assert.strictEqual(computeWeeklyCoachXp(true, 0), 11);
    assert.strictEqual(computeWeeklyCoachXp(true, 2), 13);

    const win = {
      teamAId: 'us',
      teamBId: 'them',
      scoreA: 12,
      scoreB: 9,
    } as GameResult;
    const loss = {
      teamAId: 'them',
      teamBId: 'us',
      scoreA: 11,
      scoreB: 8,
    } as GameResult;

    assert.strictEqual(userWonResult(win, 'us'), true);
    assert.strictEqual(userWonResult(loss, 'us'), false);
    assert.strictEqual(userWonResult(undefined, 'us'), false);
  });
});

describe('redshirting a starter', () => {
  test('the best backup at his position takes the spot', () => {
    const team: Team = { id: 'rs', schoolName: 'Redshirt U', nickname: 'Reds', conferenceId: 'c1', region: 'East', prestige: 70 };
    const roster = generateRoster(team, 'redshirt-starter');
    const midfield = roster.filter((player) => player.position === 'M').sort((a, b) => b.overall - a.overall);
    const starter = midfield.find((player) => player.year < 4 && !player.redshirtUsed);
    assert.ok(starter, 'a midfielder who can redshirt');
    const starterIds = midfield.slice(0, 3).map((player) => player.id);
    if (!starterIds.includes(starter.id)) starterIds[0] = starter.id;
    const base = { ...coachReducer(undefined, { type: 'init' }), managedRoster: roster, starterIds };

    const state = coachReducer(base, setPlayerRedshirt({ playerId: starter.id, redshirt: true }));
    assert.ok(!state.starterIds.includes(starter.id));
    assert.strictEqual(state.starterIds.length, starterIds.length, 'the spot is filled');
    const backup = midfield.find((player) => !starterIds.includes(player.id));
    assert.ok(backup && state.starterIds.includes(backup.id));
  });

  test('hiring on a save without a staff keeps the rest of the program staff', () => {
    let state = coachReducer(undefined, setSelectedTeam('team-1'));
    assert.strictEqual(state.assistants, undefined);
    const currentStaff = generateStaff(mockTeams[0], 'staff');
    const candidate = { ...currentStaff[0], id: 'cand', name: 'New OC', rating: 80, minPrestige: 0 };
    state = coachReducer(state, hireAssistant({ candidate, currentStaff }));
    assert.strictEqual(state.assistants?.length, 4);
    assert.strictEqual(state.assistants?.find((coach) => coach.role === candidate.role)?.name, 'New OC');
    assert.ok(state.assistants?.every((coach) => !('minPrestige' in coach)));
  });

  test('a depth chart swap never overfills a unit and clears stale starters', () => {
    const roster = generateRoster(mockTeams[0], 'depth');
    const attack = roster.filter((player) => player.position === 'A');
    let state = coachReducer(undefined, setManagedRoster(roster));
    // Three attack starters plus a stale id for a player who left the roster.
    state = coachReducer(state, setStarterIds([attack[0].id, attack[1].id, attack[2].id, 'gone']));
    // Filling an "empty" slot when the unit is full does nothing.
    state = coachReducer(state, replaceStarter({ outId: null, inId: attack[3].id }));
    assert.ok(!state.starterIds.includes(attack[3].id));
    // A real swap replaces the starter and drops the stale id.
    state = coachReducer(state, replaceStarter({ outId: attack[0].id, inId: attack[3].id }));
    assert.deepStrictEqual(state.starterIds, [attack[3].id, attack[1].id, attack[2].id]);
    // A swap across positions is refused.
    const middie = roster.find((player) => player.position === 'M')!;
    state = coachReducer(state, replaceStarter({ outId: attack[1].id, inId: middie.id }));
    assert.ok(!state.starterIds.includes(middie.id));
  });
});
