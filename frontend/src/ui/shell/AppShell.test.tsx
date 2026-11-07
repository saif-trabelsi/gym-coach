// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AppShell } from './AppShell';
import { parseHash } from '../../analytics/navigation';

describe('AppShell layout and navigation', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders skip link targeting #main-content', () => {
    render(
      <AppShell currentView="coach" backendOnline={true}>
        <div>Content</div>
      </AppShell>
    );

    const skipLink = screen.getByRole('link', { name: /skip to content/i });
    expect(skipLink).toBeTruthy();
    expect(skipLink.getAttribute('href')).toBe('#main-content');
  });

  it('renders wordmark and navigation landmarks', () => {
    render(
      <AppShell currentView="coach" backendOnline={true} inProgressReps={5}>
        <div>Content</div>
      </AppShell>
    );

    expect(screen.getByText('AI Gym Coach')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: /mobile navigation/i })).toBeTruthy();
  });

  it('renders styled offline banner when backendOnline is false', () => {
    render(
      <AppShell currentView="coach" backendOnline={false}>
        <div>Content</div>
      </AppShell>
    );

    const banner = screen.getByTestId('backend-offline-banner');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('The backend is not reachable');
  });

  it('ensures #design style guide view is absent from production builds', () => {
    // In dev mode (default in vitest), parseHash('#design') yields { view: 'design' }
    const devRoute = parseHash('#design');
    expect(devRoute.view).toBe('design');

    // Simulate production environment where import.meta.env.DEV is false
    const originalDev = import.meta.env.DEV;
    try {
      (import.meta.env as any).DEV = false;
      const prodRoute = parseHash('#design');
      // When DEV is false, '#design' must fall back to 'coach'
      expect(prodRoute.view).toBe('coach');
    } finally {
      (import.meta.env as any).DEV = originalDev;
    }
  });
});
