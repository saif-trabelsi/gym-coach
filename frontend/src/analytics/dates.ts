/**
 * Pure date formatting and relative grouping helpers for Workout History.
 * Accepts a fixed `now` clock parameter for deterministic unit testing.
 */

export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Returns a relative date string:
 * - "Today" if same calendar day
 * - "Yesterday" if 1 calendar day before
 * - "X days ago" for 2 to 6 days before
 * - Absolute date formatted (e.g. "Oct 24, 2026") for older dates
 */
export function formatRelativeDate(dateInput: string | Date, now: Date = new Date()): string {
  const target = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(target.getTime())) {
    return typeof dateInput === 'string' ? dateInput : '';
  }

  // Normalize both dates to midnight local time to count calendar days difference
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((nowMidnight.getTime() - targetMidnight.getTime()) / msPerDay);

  if (diffDays === 0) {
    return 'Today';
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays >= 2 && diffDays <= 6) {
    return `${diffDays} days ago`;
  }

  // Format absolute date (e.g., "Oct 24, 2026")
  return target.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats duration between two UTC ISO strings (e.g. "12m 45s", "30s", "1h 15m")
 */
export function formatDuration(startStr: string, endStr: string): string {
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return '-';

  const totalSec = Math.max(0, Math.round((end - start) / 1000));
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

/**
 * Formats local clock time (e.g. "14:05" or "2:05 PM")
 */
export function formatLocalTime(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formats full local date and time (e.g. "Oct 24, 2026, 2:05 PM")
 */
export function formatLocalDateTime(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return typeof dateInput === 'string' ? dateInput : '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface DayGroup<T> {
  label: string;
  dateKey: string;
  items: T[];
}

/**
 * Groups an array of items with a `started_at` ISO string into groups by day.
 * Preserves descending order.
 */
export function groupSessionsByDay<T extends { started_at: string }>(
  items: T[],
  now: Date = new Date()
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  const map = new Map<string, DayGroup<T>>();

  for (const item of items) {
    const d = new Date(item.started_at);
    if (isNaN(d.getTime())) continue;

    // Use YYYY-MM-DD as unique key
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    let group = map.get(dateKey);
    if (!group) {
      group = {
        label: formatRelativeDate(d, now),
        dateKey,
        items: [],
      };
      map.set(dateKey, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}
