import { describe, expect, test } from 'bun:test';
import { clockAtElapsed } from './timeUtils.ts';

describe('clockAtElapsed reads the game clock from elapsed seconds', () => {
  test('opening draw', () => {
    expect(clockAtElapsed(0)).toEqual({ quarter: 1, time: '15:00', label: 'Q1' });
  });

  test('mid first quarter', () => {
    expect(clockAtElapsed(452)).toEqual({ quarter: 1, time: '7:28', label: 'Q1' });
  });

  test('start of the second half', () => {
    expect(clockAtElapsed(1800)).toEqual({ quarter: 3, time: '15:00', label: 'Q3' });
  });

  test('final horn stays in the fourth quarter', () => {
    expect(clockAtElapsed(3600)).toEqual({ quarter: 4, time: '0:00', label: 'Q4' });
    expect(clockAtElapsed(3700)).toEqual({ quarter: 4, time: '0:00', label: 'Q4' });
  });

  test('overtime counts down a four-minute period', () => {
    expect(clockAtElapsed(30, { overtimePeriod: 2 })).toEqual({ quarter: 6, time: '3:30', label: 'OT2' });
  });
});
