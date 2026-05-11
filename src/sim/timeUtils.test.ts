import { describe, expect, test } from 'bun:test';
import { clockForPossession } from './timeUtils.ts';

describe('clockForPossession calculates correct quarter and time', () => {
  test('start of the game', () => {
    const result = clockForPossession(0, 100);
    expect(result).toEqual({ quarter: 1, time: '15:00' });
  });

  test('end of first quarter', () => {
    const result = clockForPossession(25, 100);
    expect(result).toEqual({ quarter: 2, time: '15:00' });
  });

  test('middle of the game', () => {
    const result = clockForPossession(50, 100);
    expect(result).toEqual({ quarter: 3, time: '15:00' });
  });

  test('middle of a quarter', () => {
    const result = clockForPossession(12, 100);
    // 12/100 * 3600 = 432 seconds elapsed
    // 900 - 432 = 468 seconds remaining
    // 468 / 60 = 7 mins, 48 secs
    expect(result).toEqual({ quarter: 1, time: '7:48' });
  });

  test('handles total being 0 safely', () => {
    const result = clockForPossession(0, 0);
    expect(result).toEqual({ quarter: 1, time: '15:00' });
  });

  test('handles possession exceeding total (overtime logic not explicitly handled, capping at Q4)', () => {
    const result = clockForPossession(101, 100);
    // 101/100 * 3600 = 3636 seconds elapsed
    // quarter = Math.min(4, Math.floor(3636 / 900) + 1) = Math.min(4, 5) = 4
    // quarterElapsed = 3636 % 900 = 36
    // remain = 900 - 36 = 864
    // mins = 864 / 60 = 14
    // secs = 864 % 60 = 24
    expect(result).toEqual({ quarter: 4, time: '14:24' });
  });
});
