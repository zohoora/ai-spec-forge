// State machine for orchestrator per spec 6.2

import { SessionStatus } from '@/types/state';

export type StateChangeCallback = (
  from: SessionStatus,
  to: SessionStatus,
  context?: Record<string, unknown>
) => void;

interface Transition {
  from: SessionStatus | SessionStatus[];
  to: SessionStatus;
}

// Valid state transitions per spec 6.2
const VALID_TRANSITIONS: Transition[] = [
  // Normal flow
  { from: 'idle', to: 'preflight' },
  { from: 'preflight', to: 'clarifying' },
  { from: 'clarifying', to: 'snapshotting' },
  { from: 'snapshotting', to: 'drafting' },
  { from: 'drafting', to: 'reviewing' },
  { from: 'reviewing', to: 'revising' },
  { from: 'revising', to: 'reviewing' }, // Next round
  { from: 'revising', to: 'completed' }, // Final round complete

  // Resume transitions
  { from: 'idle', to: 'clarifying' }, // Resume from clarification
  { from: 'idle', to: 'snapshotting' },
  { from: 'idle', to: 'drafting' },
  { from: 'idle', to: 'reviewing' },
  { from: 'idle', to: 'revising' },

  // Error transitions (any state can go to error)
  { from: ['idle', 'preflight', 'clarifying', 'snapshotting', 'drafting', 'reviewing', 'revising'], to: 'error' },

  // Recovery from error
  { from: 'error', to: 'idle' }, // Reset
  { from: 'error', to: 'preflight' }, // Retry from preflight
  { from: 'error', to: 'clarifying' }, // Retry from clarification
  { from: 'error', to: 'snapshotting' },
  { from: 'error', to: 'drafting' },
  { from: 'error', to: 'reviewing' },
  { from: 'error', to: 'revising' },
];

export class StateMachine {
  private _state: SessionStatus = 'idle';
  private _currentRound: number = 0;
  private _totalRounds: number = 0;
  private listeners: StateChangeCallback[] = [];

  constructor(initialState: SessionStatus = 'idle', currentRound: number = 0, totalRounds: number = 0) {
    this._state = initialState;
    this._currentRound = currentRound;
    this._totalRounds = totalRounds;
  }

  get state(): SessionStatus {
    return this._state;
  }

  get currentRound(): number {
    return this._currentRound;
  }

  get totalRounds(): number {
    return this._totalRounds;
  }

  setTotalRounds(rounds: number): void {
    this._totalRounds = rounds;
  }

  /**
   * Check if a transition is valid
   */
  canTransition(to: SessionStatus): boolean {
    return VALID_TRANSITIONS.some((t) => {
      const fromMatch = Array.isArray(t.from)
        ? t.from.includes(this._state)
        : t.from === this._state;
      return fromMatch && t.to === to;
    });
  }

  /**
   * Transition to a new state
   */
  transition(to: SessionStatus, context?: Record<string, unknown>): void {
    if (!this.canTransition(to)) {
      throw new Error(`Invalid transition from ${this._state} to ${to}`);
    }

    const from = this._state;
    this._state = to;

    // Notify listeners
    for (const listener of this.listeners) {
      listener(from, to, context);
    }
  }

  /**
   * Increment the current round
   */
  incrementRound(): number {
    this._currentRound++;
    return this._currentRound;
  }

  /**
   * Set the current round (for resume)
   */
  setCurrentRound(round: number): void {
    this._currentRound = round;
  }

  /**
   * Check if this is the final round
   */
  isFinalRound(): boolean {
    return this._currentRound >= this._totalRounds;
  }

  /**
   * Register a state change listener
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    const from = this._state;
    this._state = 'idle';
    this._currentRound = 0;

    for (const listener of this.listeners) {
      listener(from, 'idle');
    }
  }

  /**
   * Get human-readable status description
   */
  getStatusDescription(): string {
    switch (this._state) {
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
        return `Getting consultant feedback (Round ${this._currentRound}/${this._totalRounds})`;
      case 'revising':
        return `Revising specification (Round ${this._currentRound}/${this._totalRounds})`;
      case 'completed':
        return 'Specification complete';
      case 'error':
        return 'Error occurred';
      default:
        return this._state;
    }
  }
}
