import { describe, it, expect } from 'vitest';
import {
  formatRelativeDate,
  formatDuration,
  groupSessionsByDay,
} from './dates';

describe('Date formatting and relative grouping (dates.ts)', () => {
  // Fixed clock: November 12, 2026, 14:00:00 local time
  const fixedNow = new Date(2026, 10, 12, 14, 0, 0);

  it('identifies Today correctly', () => {
    // Same day at 09:30
    const todayMorning = new Date(2026, 10, 12, 9, 30, 0);
    expect(formatRelativeDate(todayMorning, fixedNow)).toBe('Today');
  });

  it('identifies Yesterday correctly', () => {
    // 1 calendar day before
    const yesterday = new Date(2026, 10, 11, 18, 0, 0);
    expect(formatRelativeDate(yesterday, fixedNow)).toBe('Yesterday');
  });

  it('identifies 3 days ago correctly', () => {
    // 3 calendar days before (Nov 9)
    const threeDaysAgo = new Date(2026, 10, 9, 10, 0, 0);
    expect(formatRelativeDate(threeDaysAgo, fixedNow)).toBe('3 days ago');
  });

  it('identifies 6 days ago correctly', () => {
    // 6 calendar days before (Nov 6)
    const sixDaysAgo = new Date(2026, 10, 6, 8, 0, 0);
    expect(formatRelativeDate(sixDaysAgo, fixedNow)).toBe('6 days ago');
  });

  it('formats older dates as absolute date strings', () => {
    // 15 days before (Oct 28, 2026)
    const older = new Date(2026, 9, 28, 12, 0, 0);
    const result = formatRelativeDate(older, fixedNow);
    expect(result).toBe('Oct 28, 2026');
  });

  it('formats duration between start and end strings', () => {
    expect(formatDuration('2026-11-12T10:00:00Z', '2026-11-12T10:00:45Z')).toBe('45s');
    expect(formatDuration('2026-11-12T10:00:00Z', '2026-11-12T10:03:15Z')).toBe('3m 15s');
    expect(formatDuration('2026-11-12T10:00:00Z', '2026-11-12T11:15:30Z')).toBe('1h 15m');
    expect(formatDuration('2026-11-12T10:00:00Z', '2026-11-12T09:59:00Z')).toBe('-');
  });

  it('groups sessions by day in descending order with relative headers', () => {
    const mockSessions = [
      { id: 1, started_at: '2026-11-12T12:00:00Z' },
      { id: 2, started_at: '2026-11-12T08:00:00Z' },
      { id: 3, started_at: '2026-11-11T16:00:00Z' },
      { id: 4, started_at: '2026-11-09T14:00:00Z' },
      { id: 5, started_at: '2026-10-25T11:00:00Z' },
    ];

    const groups = groupSessionsByDay(mockSessions, fixedNow);

    expect(groups).toHaveLength(4);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].items).toHaveLength(2);

    expect(groups[1].label).toBe('Yesterday');
    expect(groups[1].items).toHaveLength(1);

    expect(groups[2].label).toBe('3 days ago');
    expect(groups[2].items).toHaveLength(1);

    expect(groups[3].label).toBe('Oct 25, 2026');
    expect(groups[3].items).toHaveLength(1);
  });
});
