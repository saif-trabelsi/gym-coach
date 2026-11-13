// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDeviceId,
  resetDeviceId,
  isValidUuidV4,
  DEVICE_ID_STORAGE_KEY,
  _resetMemoryDeviceId,
} from './device';

describe('device token manager (getDeviceId, resetDeviceId)', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetMemoryDeviceId();
    vi.restoreAllMocks();
  });

  it('generates a valid UUID v4 when storage is empty', () => {
    const id = getDeviceId();
    expect(isValidUuidV4(id)).toBe(true);
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(id);
  });

  it('reuses the stored device ID across calls', () => {
    const testId = '12345678-1234-4234-8234-123456789abc';
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, testId);

    const id1 = getDeviceId();
    const id2 = getDeviceId();
    expect(id1).toBe(testId);
    expect(id2).toBe(testId);
  });

  it('regenerates a valid UUID v4 if stored value is invalid', () => {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, 'not-a-valid-uuid');

    const id = getDeviceId();
    expect(isValidUuidV4(id)).toBe(true);
    expect(id).not.toBe('not-a-valid-uuid');
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(id);
  });

  it('falls back to memory if localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: Access is denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: Access is denied');
    });

    const id1 = getDeviceId();
    expect(isValidUuidV4(id1)).toBe(true);

    const id2 = getDeviceId();
    expect(id2).toBe(id1);
  });

  it('resetDeviceId generates a new ID and updates storage', () => {
    const id1 = getDeviceId();
    const id2 = resetDeviceId();

    expect(isValidUuidV4(id2)).toBe(true);
    expect(id2).not.toBe(id1);
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(id2);
  });
});
