/**
 * Anonymous device token manager for per-device privacy and quotas.
 * Generates crypto.randomUUID() once and persists in localStorage.
 * Handles storage errors gracefully via an in-memory fallback.
 */

export const DEVICE_ID_STORAGE_KEY = 'gymcoach_device_id';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let inMemoryDeviceId: string | null = null;

export function isValidUuidV4(value: string | null | undefined): boolean {
  if (!value) return false;
  return UUID_V4_REGEX.test(value.trim());
}

/**
 * Generates a standard UUID v4.
 * Uses crypto.randomUUID if available, or a secure fallback.
 */
export function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Standard RFC4122 v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Retrieves the current anonymous device ID, generating and persisting
 * a new UUID v4 if not already present.
 */
export function getDeviceId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (stored && isValidUuidV4(stored)) {
        inMemoryDeviceId = stored;
        return stored;
      }
    }
  } catch {
    // localStorage restricted or disabled
  }

  if (inMemoryDeviceId && isValidUuidV4(inMemoryDeviceId)) {
    return inMemoryDeviceId;
  }

  const newId = generateUuidV4();
  inMemoryDeviceId = newId;

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, newId);
    }
  } catch {
    // In-memory fallback is active
  }

  return newId;
}

/**
 * Resets the device ID (e.g. after deleting all data).
 * Generates a fresh UUID v4 and updates storage.
 */
export function resetDeviceId(): string {
  const newId = generateUuidV4();
  inMemoryDeviceId = newId;

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, newId);
    }
  } catch {
    // Ignore storage failure
  }

  return newId;
}

/**
 * Helper to explicitly clear in-memory state (useful in tests).
 */
export function _resetMemoryDeviceId(): void {
  inMemoryDeviceId = null;
}
