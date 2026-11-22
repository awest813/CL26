import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BIG_STAGE_SCALE, buildPressConference, resultStreak, type PressContext } from './pressConference.ts';

const base: PressContext = { gameKey: '2026-w3-t010', won: true, userScore: 12, oppScore: 9, opponentName: 'Rivergate A&M', opponentRank: null, streak: 1 };

describe('press conference', () => {
  test('the same game always gets the same question and quotes', () => {
    assert.deepEqual(buildPressConference(base), buildPressConference(base));
  });

  test('the question is about the game that was played', () => {
    assert.match(buildPressConference({ ...base, rivalryTrophy: 'Old Crosse' }).question, /Old Crosse/);
    assert.match(buildPressConference({ ...base, opponentRank: 7 }).question, /No\. 7 Rivergate/);
    assert.match(buildPressConference({ ...base, streak: 4 }).question, /4/);
    assert.match(buildPressConference({ ...base, won: false, userScore: 4, oppScore: 14, streak: -1 }).question, /14-4/);
    assert.match(buildPressConference({ ...base, overtime: true }).question, /overtime|sudden-death/i);
  });

  test('three answers, each trading something different', () => {
    const { answers } = buildPressConference(base);
    const [humble, bold, focus] = answers;
    assert.deepEqual(answers.map((answer) => answer.tone), ['humble', 'bold', 'focus']);
    assert.ok(humble.effect.adPressure < 0 && humble.effect.recruitingBuzz === 1);
    assert.ok(bold.effect.recruitingBuzz > 1 && bold.effect.adPressure > 0, 'a bold answer lifts recruiting but raises expectations');
    assert.ok(focus.effect.fatigue < 0 && focus.effect.adPressure === 0);
    for (const answer of answers) assert.ok(answer.effectLine.length > 0);
  });

  test('talking big after a loss costs more, and taking the blame helps more', () => {
    const win = buildPressConference(base).answers;
    const loss = buildPressConference({ ...base, won: false, userScore: 8, oppScore: 10 }).answers;
    assert.ok(loss[1].effect.adPressure > win[1].effect.adPressure);
    assert.ok(loss[0].effect.adPressure < win[0].effect.adPressure);
    assert.equal(loss[0].label, 'Take the blame');
  });

  test('a rivalry or a ranked opponent is a bigger stage', () => {
    const plain = buildPressConference(base);
    const ranked = buildPressConference({ ...base, opponentRank: 3 });
    assert.equal(plain.bigStage, false);
    assert.equal(ranked.bigStage, true);
    assert.ok(Math.abs(ranked.answers[0].effect.adPressure - plain.answers[0].effect.adPressure * BIG_STAGE_SCALE) < 0.011);
  });

  test('effects stay small next to a season of AD drift (about 3 points)', () => {
    const worst = buildPressConference({ ...base, won: false, opponentRank: 1 }).answers;
    for (const answer of worst) assert.ok(Math.abs(answer.effect.adPressure) <= 0.6 && answer.effect.recruitingBuzz <= 1.1);
  });

  test('streaks count the run ending with the latest game', () => {
    assert.equal(resultStreak([true, false, true, true, true]), 3);
    assert.equal(resultStreak([true, false, false]), -2);
    assert.equal(resultStreak([]), 0);
  });
});
