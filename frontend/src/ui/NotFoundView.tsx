import React from 'react';
import { EmptyState } from './kit/EmptyState';
import { Button } from './kit/Button';
import { Compass, ArrowRight } from 'lucide-react';

interface NotFoundViewProps {
  rawPath?: string;
  onGoToCoach: () => void;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({
  rawPath,
  onGoToCoach,
}) => {
  return (
    <div className="w-full max-w-xl mx-auto py-16 px-4 flex flex-col items-center">
      <EmptyState
        icon={<Compass className="w-10 h-10 text-[var(--accent)]" />}
        title="Page Not Found (404)"
        description={
          rawPath
            ? `We couldn't find the page for "#${rawPath}". It may have been moved or removed.`
            : "The page you're looking for does not exist."
        }
        action={
          <Button
            variant="primary"
            size="md"
            onClick={onGoToCoach}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Back to Coach
          </Button>
        }
      />
    </div>
  );
};
