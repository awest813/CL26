import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { adGoalCopy, buildWeeklyDesk, classPaceFloor, type WeeklyDeskInput } from './weeklyDesk.ts';

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
  test('staff-run recruiting reads as handled even with open hours', () => {
    const recruiting = buildWeeklyDesk(desk({ autoRecruiting: true, boardCount: 0, hoursAssigned: 0 })).find(
      (task) => task.id === 'recruiting',
    );
    assert.equal(recruiting?.tone, 'ready');
    assert.match(recruiting?.detail ?? '', /staff/);
  });

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
    assert.equal(plan?.action, 'Install');
    assert.equal(plan?.href, '#week-practice');
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

  test('playoff weeks out of the bracket lock the install and hold the board', () => {
    const tasks = buildWeeklyDesk(desk({ phase: 'PLAYOFF' }));
    assert.match(tasks.find((task) => task.id === 'plan')?.detail ?? '', /next regular season/);
    assert.match(tasks.find((task) => task.id === 'recruiting')?.detail ?? '', /pause/);
  });

  test('a program still in the bracket keeps its install on the desk', () => {
    const plan = buildWeeklyDesk(desk({ phase: 'PLAYOFF', inBracket: true })).find((task) => task.id === 'plan');
    assert.equal(plan?.href, '#week-practice');
    assert.doesNotMatch(plan?.detail ?? '', /next regular season/);
  });

  test('a worn-out team turns the game plan row into a warning', () => {
    const plan = buildWeeklyDesk(desk({ fatigue: 75 })).find((task) => task.id === 'plan');
    assert.equal(plan?.tone, 'watch');
    assert.match(plan?.detail ?? '', /75%/);
    assert.match(plan?.detail ?? '', /Conditioning/);
  });

  test('wins past the target read as met, not as a fraction', () => {
    const goal = adGoalCopy({ wins: 10, winTarget: 7, pollRank: 19, pollKnown: true, rankTarget: 35 });
    assert.match(goal.detail, /10 wins, past the target of 7/);
    assert.equal(goal.tone, 'ready');
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

describe('recruiting class pace', () => {
  const recruiting = (overrides: Partial<WeeklyDeskInput>) =>
    buildWeeklyDesk(desk({ hoursAssigned: 120, scholarships: 12, weeksTotal: 12, ...overrides })).find((task) => task.id === 'recruiting');

  test('a class far behind is flagged with the numbers and the fixes', () => {
    const task = recruiting({ commits: 1, weeksPlayed: 8 });
    assert.equal(task?.tone, 'watch');
    assert.match(task?.detail ?? '', /1 commit for 12 scholarships with 4 weeks left/);
    assert.match(task?.detail ?? '', /walk-ons/);
    assert.match(task?.detail ?? '', /staff run recruiting/);
  });

  test('a staff-paced class is never flagged', () => {
    // A staff-run board: half the class by week 5, all of it by week 10.
    const staffPace = [0, 0, 0, 1, 6, 6, 6, 8, 11, 12, 12, 12];
    staffPace.forEach((commits, index) => {
      assert.notEqual(recruiting({ commits, weeksPlayed: index + 1 })?.tone, 'watch', `week ${index + 1}`);
    });
  });

  test('no verdict before week 6, and none when the staff runs recruiting', () => {
    assert.notEqual(recruiting({ commits: 0, weeksPlayed: 5 })?.tone, 'watch');
    assert.notEqual(recruiting({ commits: 0, weeksPlayed: 10, autoRecruiting: true })?.tone, 'watch');
  });

  test('no advice once the regular season, and its recruiting, is over', () => {
    assert.notEqual(recruiting({ commits: 0, weeksPlayed: 12 })?.tone, 'watch');
  });

  test('the pace floor is half of a staff-run pace', () => {
    assert.equal(classPaceFloor(12, 3, 12), 0);
    assert.equal(classPaceFloor(12, 6, 12), 2);
    assert.equal(classPaceFloor(12, 12, 12), 6);
  });
});
