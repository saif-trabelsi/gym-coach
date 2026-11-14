// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

    expect(screen.getByText('GhostCoach')).toBeTruthy();
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

  it('ensures unknown hashes fall back to coach', () => {
    const route = parseHash('#unknown-page');
    expect(route.view).toBe('coach');
  });

  it('opens privacy & device data modal with export and delete actions', () => {
    render(
      <AppShell currentView="coach" backendOnline={true}>
        <div>Content</div>
      </AppShell>
    );

    const privacyBtn = screen.getByRole('button', { name: /privacy and device data settings/i });
    expect(privacyBtn).toBeTruthy();
    fireEvent.click(privacyBtn);

    expect(screen.getByRole('heading', { name: /privacy & device data/i })).toBeTruthy();
    expect(screen.getByText('Anonymous Device Token')).toBeTruthy();
    expect(screen.getByRole('button', { name: /export json/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /delete all/i })).toBeTruthy();
  });
});
