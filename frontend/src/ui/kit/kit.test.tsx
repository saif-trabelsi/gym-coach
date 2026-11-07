// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Button } from './Button';
import { ScoreRing } from './ScoreRing';
import { Dialog } from './Dialog';
import { ToastProvider, useToast } from './Toast';

describe('UI Kit Components', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Button loading state and interactions', () => {
    it('blocks clicks and displays spinner when isLoading=true', () => {
      const handleClick = vi.fn();
      render(
        <Button isLoading onClick={handleClick}>
          Save Workout
        </Button>
      );

      const btn = screen.getByRole('button');
      expect(btn.getAttribute('aria-busy')).toBe('true');
      expect(btn.getAttribute('disabled')).not.toBeNull();

      // Attempt click
      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();

      // Check spinner is rendered
      expect(screen.getByRole('status')).toBeTruthy();
    });

    it('executes onClick when not loading and enabled', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Submit</Button>);

      const btn = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('ScoreRing component', () => {
    it('renders with exact accessible aria-label', () => {
      render(<ScoreRing score={87} />);
      const ring = screen.getByRole('img');
      expect(ring.getAttribute('aria-label')).toBe('Score 87 out of 100');
    });

    it('clamps score within 0 and 100', () => {
      const { unmount } = render(<ScoreRing score={120} />);
      expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Score 100 out of 100');
      unmount();

      render(<ScoreRing score={-10} />);
      expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Score 0 out of 100');
    });
  });

  describe('Toast system and aria-live announcements', () => {
    const TestToastConsumer = () => {
      const { showToast } = useToast();
      return (
        <button onClick={() => showToast('Rep 5 completed with good depth', 'success', 0)}>
          Trigger Toast
        </button>
      );
    };

    it('announces messages through aria-live="polite"', () => {
      render(
        <ToastProvider>
          <TestToastConsumer />
        </ToastProvider>
      );

      const container = screen.getByTestId('toast-container');
      expect(container.getAttribute('aria-live')).toBe('polite');

      fireEvent.click(screen.getByRole('button', { name: /trigger toast/i }));

      expect(screen.getByText('Rep 5 completed with good depth')).toBeTruthy();
      expect(container.contains(screen.getByText('Rep 5 completed with good depth'))).toBe(true);
    });
  });

  describe('Dialog accessibility, focus trap, ESC dismissal, and focus restoration', () => {
    const DialogTestApp = () => {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button id="trigger-btn" onClick={() => setOpen(true)}>
            Open Modal
          </button>
          <Dialog
            isOpen={open}
            onClose={() => setOpen(false)}
            title="Confirm Discard"
            description="All reps will be cleared"
          >
            <button id="action-btn-1">Cancel</button>
            <button id="action-btn-2">Confirm</button>
          </Dialog>
        </div>
      );
    };

    it('dismisses dialog on ESC key and restores focus to trigger button', () => {
      render(<DialogTestApp />);

      const triggerBtn = screen.getByRole('button', { name: /open modal/i });
      triggerBtn.focus();
      expect(document.activeElement).toBe(triggerBtn);

      fireEvent.click(triggerBtn);

      // Dialog is open
      expect(screen.getByRole('dialog')).toBeTruthy();

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      // Dialog is closed
      expect(screen.queryByRole('dialog')).toBeNull();

      // Focus should be restored to trigger button
      expect(document.activeElement).toBe(triggerBtn);
    });

    it('dismisses dialog on overlay click', () => {
      render(<DialogTestApp />);

      fireEvent.click(screen.getByRole('button', { name: /open modal/i }));
      expect(screen.getByRole('dialog')).toBeTruthy();

      // Click backdrop/overlay
      const backdrop = screen.getByRole('presentation');
      fireEvent.click(backdrop);

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('traps focus within the dialog on Tab and Shift+Tab', () => {
      render(<DialogTestApp />);

      fireEvent.click(screen.getByRole('button', { name: /open modal/i }));

      const dialog = screen.getByRole('dialog');
      const focusables = dialog.querySelectorAll<HTMLElement>('button');
      const closeBtn = focusables[0];
      const confirmBtn = focusables[2];

      // Tab on last element wraps to first
      confirmBtn.focus();
      expect(document.activeElement).toBe(confirmBtn);

      fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
      expect(document.activeElement).toBe(closeBtn);

      // Shift+Tab on first element wraps to last
      closeBtn.focus();
      expect(document.activeElement).toBe(closeBtn);

      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(confirmBtn);
    });
  });
});
