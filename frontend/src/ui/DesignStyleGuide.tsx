import React, { useState } from 'react';
import {
  Button,
  Card,
  Badge,
  SegmentedControl,
  Tabs,
  StatTile,
  ScoreRing,
  Skeleton,
  EmptyState,
  ErrorState,
  Dialog,
  Spinner,
  useToast,
} from './kit';
import { useTheme } from '../design/theme';
import { Sun, Moon, Laptop, Dumbbell, Sparkles, AlertCircle, Award } from 'lucide-react';

export const DesignStyleGuide: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();

  const [segmentedVal, setSegmentedVal] = useState<'squat' | 'curl'>('squat');
  const [activeTab, setActiveTab] = useState<'all' | 'reps' | 'metrics'>('all');
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [btnLoading, setBtnLoading] = useState<boolean>(false);

  return (
    <div className="w-full max-w-5xl mx-auto py-8 px-4 flex flex-col gap-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-[var(--text-primary)]">
              AI Gym Coach Design System (#design)
            </h1>
            <Badge variant="info" size="sm">
              Dev Only
            </Badge>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Component showcase, tokens, and states across dark and light sports-tech themes.
          </p>
        </div>

        {/* Theme Switcher in Styleguide */}
        <div className="flex items-center gap-2">
          <SegmentedControl
            value={theme}
            onChange={(val) => setTheme(val as any)}
            options={[
              { value: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5" /> },
              { value: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5" /> },
              { value: 'system', label: 'System', icon: <Laptop className="w-3.5 h-3.5" /> },
            ]}
          />
        </div>
      </div>

      {/* Buttons */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Buttons</h2>
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary Emerald</Button>
            <Button variant="secondary">Secondary Surface</Button>
            <Button variant="ghost">Ghost Action</Button>
            <Button variant="danger">Danger Action</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button size="sm" variant="primary">
              Small
            </Button>
            <Button size="md" variant="primary">
              Medium
            </Button>
            <Button size="lg" variant="primary">
              Large Hero
            </Button>
            <Button
              variant="secondary"
              isLoading={btnLoading}
              onClick={() => {
                setBtnLoading(true);
                setTimeout(() => setBtnLoading(false), 2000);
              }}
            >
              Click to Test Loading
            </Button>
          </div>
        </Card>
      </section>

      {/* Badges */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Badges</h2>
        <Card className="flex flex-wrap items-center gap-3">
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="success" dot>
            Good Form
          </Badge>
          <Badge variant="warning" dot>
            Check Depth
          </Badge>
          <Badge variant="danger" dot>
            Knee Cave
          </Badge>
          <Badge variant="info">AI Powered</Badge>
        </Card>
      </section>

      {/* Score Rings & Stat Tiles */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          Score Rings & Semantic Colors
        </h2>
        <Card className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
          <div className="flex flex-col items-center gap-2">
            <ScoreRing score={94} size={84} />
            <span className="text-xs font-semibold text-[var(--score-good)]">Good (≥ 85)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <ScoreRing score={76} size={84} />
            <span className="text-xs font-semibold text-[var(--score-warn)]">Warn (70 - 84)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <ScoreRing score={58} size={84} />
            <span className="text-xs font-semibold text-[var(--score-bad)]">Bad (&lt; 70)</span>
          </div>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="Reps Count" value="12" subValue="/ 12 target" icon={<Dumbbell className="w-4 h-4" />} />
          <StatTile label="Avg Score" value="88" tone="good" icon={<Award className="w-4 h-4" />} />
          <StatTile label="Form Drop" value="8%" tone="warn" subValue="vs rep 1" />
          <StatTile label="Violations" value="3" tone="bad" icon={<AlertCircle className="w-4 h-4" />} />
        </div>
      </section>

      {/* Segmented Controls & Tabs */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Controls & Tabs</h2>
        <Card className="flex flex-col gap-5">
          <div>
            <span className="text-xs font-semibold text-[var(--text-secondary)] block mb-2">
              Segmented Control
            </span>
            <SegmentedControl
              value={segmentedVal}
              onChange={(val) => setSegmentedVal(val as any)}
              options={[
                { value: 'squat', label: 'Squat', icon: <Dumbbell className="w-3.5 h-3.5" /> },
                { value: 'curl', label: 'Bicep Curl' },
              ]}
            />
          </div>

          <div>
            <span className="text-xs font-semibold text-[var(--text-secondary)] block mb-2">
              Tab Navigation
            </span>
            <Tabs
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as any)}
              tabs={[
                { id: 'all', label: 'All Sets' },
                { id: 'reps', label: 'Reps History', badge: <Badge size="sm" variant="neutral">24</Badge> },
                { id: 'metrics', label: 'Analytics' },
              ]}
            />
          </div>
        </Card>
      </section>

      {/* Dialog & Toasts */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Dialog & Toasts</h2>
        <Card className="flex flex-wrap items-center gap-4">
          <Button variant="primary" onClick={() => setIsDialogOpen(true)}>
            Open Accessible Dialog
          </Button>

          <Button
            variant="secondary"
            onClick={() => showToast('Session saved successfully!', 'success')}
          >
            Show Success Toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => showToast('Form warning: Back hyperextended', 'warning')}
          >
            Show Warning Toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => showToast('Backend offline - retrying...', 'danger')}
          >
            Show Danger Toast
          </Button>
        </Card>

        <Dialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          title="Confirm Workout Discard"
          description="Are you sure you want to discard this workout? Recorded sets will be lost."
        >
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setIsDialogOpen(false)}>
              Discard Workout
            </Button>
          </div>
        </Dialog>
      </section>

      {/* Async States: Skeletons, Empty & Error */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Async States</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="flex flex-col gap-3">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Skeleton Shimmer
            </span>
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="90%" />
            <div className="flex items-center gap-3 mt-2">
              <Skeleton variant="circular" width={40} height={40} />
              <div className="flex-1 flex flex-col gap-1.5">
                <Skeleton variant="text" width="70%" />
                <Skeleton variant="text" width="40%" />
              </div>
            </div>
          </Card>

          <Card className="flex items-center justify-center">
            <div className="flex items-center gap-4">
              <Spinner size="lg" />
              <div className="text-xs text-[var(--text-secondary)]">
                <span className="font-bold text-[var(--text-primary)] block">Loading AI Report</span>
                Synthesizing biomechanics with Gemini...
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EmptyState
            icon={<Sparkles className="w-6 h-6" />}
            title="No workout history yet"
            description="Complete your first squat or curl set to review performance logs and coaching reports."
            action={<Button size="sm" variant="primary">Start Workout</Button>}
          />
          <ErrorState
            title="Failed to fetch coaching report"
            message="Server returned 503 Service Unavailable. You can try regenerating."
            retryText="Regenerate Report"
            onRetry={() => showToast('Retrying...', 'info')}
          />
        </div>
      </section>
    </div>
  );
};
