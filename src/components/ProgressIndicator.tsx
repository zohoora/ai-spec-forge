'use client';

import React, { useEffect, useState } from 'react';
import { StatusBadge } from './ui';
import { SessionStatus } from '@/types/state';
import { formatDuration } from '@/lib/utils/format';

interface ProgressIndicatorProps {
  status: SessionStatus;
  currentRound: number;
  totalRounds: number;
  startTime?: number;
}

export function ProgressIndicator({
  status,
  currentRound,
  totalRounds,
  startTime,
}: ProgressIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  // Update elapsed time
  useEffect(() => {
    if (!startTime || status === 'idle' || status === 'completed' || status === 'error') {
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, status]);

  const getProgressPercentage = (): number => {
    switch (status) {
      case 'idle':
        return 0;
      case 'preflight':
        return 5;
      case 'clarifying':
        return 15;
      case 'snapshotting':
        return 25;
      case 'drafting':
        return 35;
      case 'reviewing':
      case 'revising': {
        // Progress through rounds
        const baseProgress = 35;
        const roundProgress = 60 / totalRounds;
        return baseProgress + currentRound * roundProgress;
      }
      case 'completed':
        return 100;
      case 'error':
        return 0;
      default:
        return 0;
    }
  };

  const getPhaseDescription = (): string => {
    switch (status) {
      case 'idle':
        return 'Ready to start';
      case 'preflight':
        return 'Checking model availability';
      case 'clarifying':
        return 'Gathering requirements';
      case 'snapshotting':
        return 'Creating requirements snapshot';
      case 'drafting':
        return 'Writing initial specification';
      case 'reviewing':
        return `Getting consultant feedback (Round ${currentRound}/${totalRounds})`;
      case 'revising':
        return `Revising specification (Round ${currentRound}/${totalRounds})`;
      case 'completed':
        return 'Specification complete!';
      case 'error':
        return 'An error occurred';
      default:
        return '';
    }
  };

  const progress = getProgressPercentage();

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <span className="text-sm text-gray-600">{getPhaseDescription()}</span>
        </div>
        {startTime && status !== 'idle' && status !== 'completed' && (
          <span className="text-sm text-gray-500 font-mono">
            {formatDuration(elapsed)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            status === 'error' ? 'bg-red-500' : 'bg-blue-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Phase indicators */}
      <div className="flex justify-between mt-2 text-xs text-gray-400">
        <span className={status !== 'idle' ? 'text-blue-600' : ''}>Start</span>
        <span className={['clarifying', 'snapshotting', 'drafting', 'reviewing', 'revising', 'completed'].includes(status) ? 'text-blue-600' : ''}>
          Clarify
        </span>
        <span className={['drafting', 'reviewing', 'revising', 'completed'].includes(status) ? 'text-blue-600' : ''}>
          Draft
        </span>
        <span className={['reviewing', 'revising', 'completed'].includes(status) ? 'text-blue-600' : ''}>
          Review
        </span>
        <span className={status === 'completed' ? 'text-green-600' : ''}>
          Done
        </span>
      </div>

      {/* Round indicator */}
      {totalRounds > 0 && (status === 'reviewing' || status === 'revising' || status === 'completed') && (
        <div className="mt-3 flex gap-1">
          {Array.from({ length: totalRounds }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full ${
                i < currentRound
                  ? 'bg-green-500'
                  : i === currentRound && status !== 'completed'
                  ? 'bg-blue-500'
                  : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
