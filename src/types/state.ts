// Session state types matching spec 8.2

export type SessionStatus =
  | 'idle'
  | 'preflight'
  | 'clarifying'
  | 'snapshotting'
  | 'drafting'
  | 'reviewing'
  | 'revising'
  | 'completed'
  | 'error';

export type ConsultantCallStatus = 'pending' | 'complete' | 'error';

export interface ConsultantCallState {
  status: ConsultantCallStatus;
  path: string | null;
  error?: string;
  duration?: number;
}

export interface RoundState {
  consultants: Record<string, ConsultantCallState>;
  feedbackBundlePath: string | null;
  revisedSpecPath: string | null;
}

export interface SessionState {
  status: SessionStatus;
  currentRound: number;
  latestSpecVersion: number;
  requirementsSnapshotPath: string | null;
  clarificationTranscriptPath: string | null;
  rounds: Record<number, RoundState>;
  error?: {
    message: string;
    step: string;
    model?: string;
    timestamp: string;
  };
}

export function createInitialState(): SessionState {
  return {
    status: 'idle',
    currentRound: 0,
    latestSpecVersion: 0,
    requirementsSnapshotPath: null,
    clarificationTranscriptPath: null,
    rounds: {},
  };
}

export function initializeRoundState(consultantModels: string[]): RoundState {
  const consultants: Record<string, ConsultantCallState> = {};
  for (const model of consultantModels) {
    consultants[model] = { status: 'pending', path: null };
  }
  return {
    consultants,
    feedbackBundlePath: null,
    revisedSpecPath: null,
  };
}

export function getPendingConsultants(roundState: RoundState): string[] {
  return Object.entries(roundState.consultants)
    .filter(([, state]) => state.status === 'pending')
    .map(([model]) => model);
}

export function isRoundComplete(roundState: RoundState): boolean {
  return Object.values(roundState.consultants).every(
    (state) => state.status === 'complete'
  );
}

export function hasRoundError(roundState: RoundState): boolean {
  return Object.values(roundState.consultants).some(
    (state) => state.status === 'error'
  );
}
