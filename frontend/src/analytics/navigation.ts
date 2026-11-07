export type AppView = 'coach' | 'history' | 'progress' | 'design';

export interface ParsedRoute {
  view: AppView;
  id?: number;
}

/**
 * Pure function to parse a URL hash (#coach, #history, #history/12, #progress, #design).
 * Unknown hashes fall back to 'coach'.
 * #design is only recognized in development mode (import.meta.env.DEV). In production, it falls back to coach.
 * #history/abc or invalid id falls back to the history list without an id.
 */
export function parseHash(hash: string): ParsedRoute {
  if (!hash) {
    return { view: 'coach' };
  }

  const clean = hash.startsWith('#') ? hash.slice(1) : hash;
  const parts = clean.split('/').filter(Boolean);
  const root = parts[0]?.toLowerCase();

  // Style guide is only accessible in development builds
  if (import.meta.env?.DEV && root === 'design') {
    return { view: 'design' };
  }

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

  // Unknown hash falls back to coach
  return { view: 'coach' };
}
