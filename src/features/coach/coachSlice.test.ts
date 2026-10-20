import assert from 'node:assert';
import { describe, test } from 'node:test';
import type { GameResult, Team } from '../../types/sim.ts';
import { computeWeeklyCoachXp, userWonResult } from './careerThunks.ts';
import {
  addRecruitToBoard,
  applyJobOfferAcceptance,
  applyRecruitingUpdates,
  clearRecruitPitch,
  coachReducer,
  declineAllJobOffers,
  initializeRecruitingBoard,
  setRecruitHours,
  setRecruitPitch,
  setSelectedTeam,
  togglePortalClaim,
} from './coachSlice.ts';

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
