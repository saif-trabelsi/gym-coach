export type AppView = 'coach' | 'history' | 'progress' | 'not-found';

export interface ParsedRoute {
  view: AppView;
  id?: number;
  rawPath?: string;
}

/**
 * Returns document title for the current view.
 */
export function getTitleForRoute(route: ParsedRoute): string {
  switch (route.view) {
    case 'coach':
      return 'AI Gym Coach — Real-Time Form Coaching';
    case 'history':
      return route.id
        ? `Session #${route.id} Details | AI Gym Coach`
        : 'Workout History | AI Gym Coach';
    case 'progress':
      return 'Progress Analytics | AI Gym Coach';
    case 'not-found':
      return 'Page Not Found | AI Gym Coach';
    default:
      return 'AI Gym Coach';
  }
}

/**
 * Pure function to parse a URL hash (#coach, #history, #history/12, #progress).
 * Empty hash or '#coach' defaults to 'coach'.
 * #history/abc or invalid id falls back to the history list without an id.
 */
export function parseHash(hash: string): ParsedRoute {
  if (!hash || hash === '#') {
    return { view: 'coach' };
  }

  const clean = hash.startsWith('#') ? hash.slice(1) : hash;
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) {
    return { view: 'coach' };
  }

  const root = parts[0]?.toLowerCase();

  if (root === 'coach') {
    return { view: 'coach' };
  }

  if (root === 'progress') {
    return { view: 'progress' };
  }

  if (root === 'history') {
    if (parts.length >= 2) {
      const rawId = parts[1];
      const parsedId = Number.parseInt(rawId, 10);
      if (!isNaN(parsedId) && String(parsedId) === rawId) {
        return { view: 'history', id: parsedId };
      }
      // Invalid id e.g. #history/abc falls back to the history list
      return { view: 'history' };
    }
    return { view: 'history' };
  }

  if (root === 'not-found' || root === '404') {
    return { view: 'not-found', rawPath: clean };
  }

  // Unknown route falls back to coach (preserves existing contract)
  return { view: 'coach' };
}
