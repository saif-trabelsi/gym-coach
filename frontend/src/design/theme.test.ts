// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getStoredTheme,
  setStoredTheme,
  resolveTheme,
  applyTheme,
  THEME_STORAGE_KEY,
} from './theme';

describe('theme management and persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.className = '';
    vi.restoreAllMocks();
  });

  it('defaults to dark theme when localStorage is empty', () => {
    expect(getStoredTheme()).toBe('dark');
  });

  it('persists and retrieves chosen theme', () => {
    setStoredTheme('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(getStoredTheme()).toBe('light');

    setStoredTheme('system');
    expect(getStoredTheme()).toBe('system');
  });

  it('handles throwing localStorage gracefully without crashing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access denied in private browsing');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded or security error');
    });

    // Should not throw, defaults safely to 'dark'
    expect(getStoredTheme()).toBe('dark');
    expect(() => setStoredTheme('light')).not.toThrow();
  });

  it('resolves system theme based on matchMedia preference', () => {
    // Mock matchMedia returning prefers-color-scheme: dark
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(resolveTheme('system')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('applies theme attributes to document.documentElement', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});
