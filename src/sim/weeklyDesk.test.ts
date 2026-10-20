import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { adGoalCopy, buildWeeklyDesk, type WeeklyDeskInput } from './weeklyDesk.ts';

const emptyNeeds = { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 };

function desk(overrides: Partial<WeeklyDeskInput> = {}): WeeklyDeskInput {
  return {
    phase: 'REGULAR',
    practiceLabel: 'Conditioning',
    practiceDetail: 'Builds faceoff and ground-ball legs.',
    schemeLine: 'Balanced tempo · Man defense',
    recruitPoolCount: 80,
    boardCount: 4,
    hoursAssigned: 40,
    hoursCap: 120,
    hasRoster: true,
    positionNeeds: { ...emptyNeeds, FO: 1, A: 2 },
    wins: 3,
    winTarget: 9,
    pollRank: 18,
    pollKnown: true,
    rankTarget: 12,
    ...overrides,
  };
}

describe('weekly desk', () => {
  test('open hours and roster holes stay visible before the week is played', () => {
    const tasks = buildWeeklyDesk(desk());
    const recruiting = tasks.find((task) => task.id === 'recruiting');
    const needs = tasks.find((task) => task.id === 'needs');
    const plan = tasks.find((task) => task.id === 'plan');
    assert.equal(recruiting?.tone, 'open');
    assert.match(recruiting?.detail ?? '', /80 of 120 hours/);
    assert.equal(recruiting?.href, '/career/recruiting');
    assert.equal(needs?.tone, 'watch');
    assert.match(needs?.detail ?? '', /Attack 2/);
    assert.match(needs?.detail ?? '', /Faceoff 1/);
    assert.equal(plan?.tone, 'ready');
    assert.match(plan?.detail ?? '', /Conditioning/);
    assert.equal(plan?.href, null);
  });

  test('a full board and a covered roster read as ready', () => {
    const tasks = buildWeeklyDesk(desk({
      hoursAssigned: 120,
      positionNeeds: emptyNeeds,
      wins: 9,
      pollRank: 8,
    }));
    assert.equal(tasks.find((task) => task.id === 'recruiting')?.tone, 'ready');
    assert.equal(tasks.find((task) => task.id === 'needs')?.tone, 'ready');
    assert.equal(tasks.find((task) => task.id === 'ad')?.tone, 'ready');
  });

  test('no class and no roster point back to the office and depth chart', () => {
    const tasks = buildWeeklyDesk(desk({
      recruitPoolCount: 0,
      boardCount: 0,
      hasRoster: false,
    }));
    assert.equal(tasks.find((task) => task.id === 'recruiting')?.action, 'Start class');
    assert.equal(tasks.find((task) => task.id === 'recruiting')?.href, '/career');
    assert.equal(tasks.find((task) => task.id === 'needs')?.tone, 'open');
  });

  test('an empty target list asks for prospects before hours', () => {
    const recruiting = buildWeeklyDesk(desk({ boardCount: 0 })).find((task) => task.id === 'recruiting');
    assert.equal(recruiting?.action, 'Add targets');
  });

  test('the offseason points recruiting at the portal and the pro draft', () => {
    const tasks = buildWeeklyDesk(desk({ phase: 'OFFSEASON', recruitPoolCount: 0 }));
    const recruiting = tasks.find((task) => task.id === 'recruiting');
    assert.match(recruiting?.detail ?? '', /portal/);
    assert.match(recruiting?.detail ?? '', /pro draft/);
    assert.equal(recruiting?.href, '/career');
  });

  test('playoff weeks lock the install and hold the board', () => {
    const tasks = buildWeeklyDesk(desk({ phase: 'PLAYOFF' }));
    assert.match(tasks.find((task) => task.id === 'plan')?.detail ?? '', /next regular season/);
    assert.match(tasks.find((task) => task.id === 'recruiting')?.detail ?? '', /pause/);
  });

  test('missing the poll target is a watch even when wins are ahead', () => {
    const goal = adGoalCopy({ wins: 10, winTarget: 9, pollRank: 20, pollKnown: true, rankTarget: 12 });
    assert.equal(goal.tone, 'watch');
    assert.match(goal.detail, /Poll #20/);
  });

  test('preseason does not invent a poll rank', () => {
    const goal = adGoalCopy({ wins: 0, winTarget: 9, pollRank: null, pollKnown: false, rankTarget: 12 });
    assert.equal(goal.tone, 'open');
    assert.match(goal.detail, /Top 12 finish/);
    assert.doesNotMatch(goal.detail, /Outside/);
  });
});
