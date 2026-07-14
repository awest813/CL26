import { describe, expect, test } from 'bun:test';
import { clockForPossession } from './timeUtils.ts';

describe('clockForPossession calculates correct quarter and time', () => {
  test('start of the game', () => {
    const result = clockForPossession(0, 100);
    expect(result).toEqual({ quarter: 1, time: '15:00', label: 'Q1' });
  });

  test('end of first quarter', () => {
    const result = clockForPossession(25, 100);
    expect(result).toEqual({ quarter: 2, time: '15:00', label: 'Q2' });
  });

  test('middle of the game', () => {
    const result = clockForPossession(50, 100);
    expect(result).toEqual({ quarter: 3, time: '15:00', label: 'Q3' });
  });

  test('middle of a quarter', () => {
    const result = clockForPossession(12, 100);
    expect(result).toEqual({ quarter: 1, time: '7:48', label: 'Q1' });
  });

  test('handles total being 0 safely', () => {
    const result = clockForPossession(0, 0);
    expect(result).toEqual({ quarter: 1, time: '15:00', label: 'Q1' });
  });

  test('overtime periods use OT labels', () => {
    const result = clockForPossession(2, 10, { overtimePeriod: 1 });
    expect(result.label).toBe('OT');
    expect(result.quarter).toBe(5);
  });
});
