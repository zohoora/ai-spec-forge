// Main orchestrator that coordinates the spec generation workflow

import { SessionConfig } from '@/types/config';
import { SessionState, createInitialState, initializeRoundState, SessionStatus } from '@/types/state';
import { ClarificationTranscript, ActivityEvent, PreflightResult } from '@/types/session';
import { OpenRouterClient, createOpenRouterClient } from '@/lib/openrouter/client';
import {
  createSessionDirectory,
  initializeSession,
  saveState,
  loadState,
  loadConfig,
  saveTranscript,
  loadTranscript,
  saveRequirementsSnapshot,
  loadRequirementsSnapshot,
  saveSpecVersion,
  loadSpecVersion,
  saveConsultantResponse,
  saveFeedbackBundle,
  copyFinalSpec,
  appendSessionLogEvent,
  cleanPartialFiles,
  getRequirementsSnapshotPath,
  getTranscriptPath,
  getSpecVersionPath,
  getFeedbackRoundPath,
} from '@/lib/storage';
import { StateMachine } from './state-machine';
import {
  startClarification,
  startClarificationStream,
  continueClarification,
  continueClarificationStream,
  formatTranscriptForPrompt,
} from './clarification';
import { generateSnapshot, generateSnapshotStream, formatSnapshotWithHeader } from './snapshot';
import { generateDraft, generateDraftStream, extractAppNameForSpec } from './drafting';
import { runFeedbackRound, formatFeedbackBundle, ConsultantFeedback } from './feedback';
import { generateRevision, generateRevisionStream, formatRevisedSpec, stripSpecHeader } from './revision';
import { withRetry } from '@/lib/utils/retry';
import { generateId } from '@/lib/utils/format';

export type OrchestratorEventType =
  | 'state_change'
  | 'preflight_start'
  | 'preflight_model'
  | 'preflight_complete'
  | 'clarification_start'
  | 'clarification_response'
  | 'clarification_ready'
  | 'snapshot_start'
  | 'snapshot_complete'
  | 'draft_start'
  | 'draft_complete'
  | 'feedback_round_start'
  | 'consultant_start'
  | 'consultant_complete'
  | 'feedback_round_complete'
  | 'revision_start'
  | 'revision_complete'
  | 'session_complete'
  | 'error'
  | 'token';

export interface OrchestratorEvent {
  id: string;
  type: OrchestratorEventType;
  timestamp: string;
  message?: string;
  data?: Record<string, unknown>;
}

type EventCallback = (event: OrchestratorEvent) => void;

export class Orchestrator {
  private config: SessionConfig | null = null;
  private state: SessionState;
  private stateMachine: StateMachine;
  private sessionDir: string = '';
  private client: OpenRouterClient | null = null;
  private transcript: ClarificationTranscript | null = null;
  private eventListeners: EventCallback[] = [];
  private aborted: boolean = false;

  constructor() {
    this.state = createInitialState();
    this.stateMachine = new StateMachine();

    // Wire up state machine events
    this.stateMachine.onStateChange((from, to) => {
      this.state.status = to;
      this.emit({
        type: 'state_change',
        message: `State changed from ${from} to ${to}`,
        data: { from, to },
      });
    });
  }

  // Event handling
  onEvent(callback: EventCallback): () => void {
    this.eventListeners.push(callback);
    return () => {
      const index = this.eventListeners.indexOf(callback);
      if (index !== -1) this.eventListeners.splice(index, 1);
    };
  }

  private emit(event: Omit<OrchestratorEvent, 'id' | 'timestamp'>): void {
    const fullEvent: OrchestratorEvent = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      ...event,
    };
    for (const listener of this.eventListeners) {
      listener(fullEvent);
    }
  }

  // Getters
  get currentState(): SessionState {
    return { ...this.state };
  }

  get currentConfig(): SessionConfig | null {
    return this.config ? { ...this.config } : null;
  }

  get currentSessionDir(): string {
    return this.sessionDir;
  }

  get currentTranscript(): ClarificationTranscript | null {
    return this.transcript;
  }

  /**
   * Initialize a new session
   */
  async initialize(
    config: SessionConfig,
    apiKey: string
  ): Promise<string> {
    this.config = config;
    this.client = createOpenRouterClient({ apiKey });
    this.aborted = false;

    // Create session directory
    this.sessionDir = await createSessionDirectory(config.outputDirectory, config.appIdea);

    // Initialize session files
    await initializeSession(this.sessionDir, config);

    // Set up state machine
    this.stateMachine.setTotalRounds(config.numberOfRounds);

    // Load fresh state
    this.state = createInitialState();

    await appendSessionLogEvent(this.sessionDir, 'Session Initialized',
      `Ready to start specification generation with ${config.consultantModels.length} consultant(s) and ${config.numberOfRounds} feedback round(s).`);

    return this.sessionDir;
  }

  /**
   * Resume an existing session
   */
  async resume(sessionDir: string, apiKey: string): Promise<void> {
    this.sessionDir = sessionDir;

    // Clean partial files
    const cleaned = await cleanPartialFiles(sessionDir);
    if (cleaned.length > 0) {
      await appendSessionLogEvent(sessionDir, 'Cleaned Partial Files',
        `Removed ${cleaned.length} incomplete file(s).`);
    }

    // Load config and state
    const config = await loadConfig(sessionDir);
    if (!config) {
      throw new Error('Could not load session configuration');
    }
    this.config = config;

    const state = await loadState(sessionDir);
    if (!state) {
      throw new Error('Could not load session state');
    }
    this.state = state;

    // Load transcript if exists
    const transcript = await loadTranscript(sessionDir);
    if (transcript) {
      this.transcript = transcript;
    }

    // Set up client and state machine
    this.client = createOpenRouterClient({ apiKey });
    this.stateMachine = new StateMachine(state.status, state.currentRound, config.numberOfRounds);
    this.aborted = false;

    await appendSessionLogEvent(sessionDir, 'Session Resumed',
      `Resuming from state: ${state.status}, round: ${state.currentRound}`);
  }

  /**
   * Abort the current session
   */
  abort(): void {
    this.aborted = true;
    this.emit({
      type: 'error',
      message: 'Session aborted by user',
    });
  }

  /**
   * Check if session was aborted
   */
  private checkAborted(): void {
    if (this.aborted) {
      throw new Error('Session aborted');
    }
  }

  /**
   * Run preflight model reachability checks
   */
  async runPreflight(): Promise<PreflightResult> {
    if (!this.config || !this.client) {
      throw new Error('Session not initialized');
    }

    this.stateMachine.transition('preflight');
    await this.persistState();

    this.emit({ type: 'preflight_start', message: 'Starting model reachability checks' });

    const allModels = [this.config.specWriterModel, ...this.config.consultantModels];
    const uniqueModels = [...new Set(allModels)];

    const results: PreflightResult['results'] = [];

    for (const model of uniqueModels) {
      this.checkAborted();
      this.emit({
        type: 'preflight_model',
        message: `Testing ${model}...`,
        data: { model },
      });

      try {
        await withRetry(
          () => this.client!.testReachability(model),
          { maxRetries: 3, maxDuration: 60000 }
        );
        results.push({ model, reachable: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({ model, reachable: false, error: errorMessage });

        await appendSessionLogEvent(this.sessionDir, 'Preflight Failed',
          `Model ${model} is not reachable: ${errorMessage}`);

        this.stateMachine.transition('error');
        this.state.error = {
          message: `Model ${model} is not reachable: ${errorMessage}`,
          step: 'preflight',
          model,
          timestamp: new Date().toISOString(),
        };
        await this.persistState();

        this.emit({
          type: 'preflight_complete',
          message: 'Preflight failed',
          data: { success: false, results },
        });

        return { success: false, results };
      }
    }

    this.emit({
      type: 'preflight_complete',
      message: 'All models reachable',
      data: { success: true, results },
    });

    await appendSessionLogEvent(this.sessionDir, 'Preflight Complete',
      'All models are reachable.');

    return { success: true, results };
  }

  /**
   * Start the clarification phase
   */
  async *startClarification(): AsyncGenerator<{ type: string; content?: string; isReady?: boolean }> {
    if (!this.config || !this.client) {
      throw new Error('Session not initialized');
    }

    this.stateMachine.transition('clarifying');
    await this.persistState();

    this.emit({ type: 'clarification_start', message: 'Starting clarification phase' });
    await appendSessionLogEvent(this.sessionDir, 'Clarification Started');

    let fullResponse = '';

    for await (const chunk of startClarificationStream(
      this.client,
      this.config.specWriterModel,
      this.config.prompts.specWriterClarify,
      this.config.appIdea
    )) {
      this.checkAborted();

      if (chunk.type === 'token') {
        fullResponse += chunk.content;
        this.emit({ type: 'token', data: { content: chunk.content } });
        yield { type: 'token', content: chunk.content };
      } else if (chunk.type === 'complete' && chunk.transcript) {
        this.transcript = chunk.transcript;
        await saveTranscript(this.sessionDir, this.transcript);
        this.state.clarificationTranscriptPath = getTranscriptPath(this.sessionDir);
        await this.persistState();

        const ready = chunk.parsedResponse?.ready || false;

        this.emit({
          type: 'clarification_response',
          message: 'Received initial response',
          data: { isReady: ready },
        });

        yield { type: 'complete', content: chunk.content, isReady: ready };
      }
    }
  }

  /**
   * Send user response during clarification
   */
  async *sendClarificationResponse(
    userResponse: string
  ): AsyncGenerator<{ type: string; content?: string; isReady?: boolean }> {
    if (!this.config || !this.client || !this.transcript) {
      throw new Error('Not in clarification phase');
    }

    let fullResponse = '';

    for await (const chunk of continueClarificationStream(
      this.client,
      this.config.specWriterModel,
      this.transcript,
      userResponse
    )) {
      this.checkAborted();

      if (chunk.type === 'token') {
        fullResponse += chunk.content;
        this.emit({ type: 'token', data: { content: chunk.content } });
        yield { type: 'token', content: chunk.content };
      } else if (chunk.type === 'complete' && chunk.transcript) {
        this.transcript = chunk.transcript;
        await saveTranscript(this.sessionDir, this.transcript);

        const ready = chunk.isReady || false;

        if (ready) {
          this.emit({ type: 'clarification_ready', message: 'Ready to write spec' });
          await appendSessionLogEvent(this.sessionDir, 'Clarification Complete',
            'Ready signal detected.');
        }

        yield { type: 'complete', content: fullResponse, isReady: ready };
      }
    }
  }

  /**
   * Force progression to drafting (FR-16)
   */
  async forceProgressToDrafting(): Promise<void> {
    await appendSessionLogEvent(this.sessionDir, 'Force Progress',
      'User forced progression to drafting phase.');
  }

  /**
   * Generate requirements snapshot
   */
  async *generateSnapshot(): AsyncGenerator<{ type: string; content?: string }> {
    if (!this.config || !this.client || !this.transcript) {
      throw new Error('Cannot generate snapshot without clarification');
    }

    this.stateMachine.transition('snapshotting');
    await this.persistState();

    this.emit({ type: 'snapshot_start', message: 'Generating requirements snapshot' });
    await appendSessionLogEvent(this.sessionDir, 'Snapshot Generation Started');

    let fullContent = '';

    for await (const chunk of generateSnapshotStream(
      this.client,
      this.config.specWriterModel,
      this.config.prompts.specWriterSnapshot,
      this.config.appIdea,
      this.transcript
    )) {
      this.checkAborted();

      if (chunk.type === 'token') {
        fullContent += chunk.content;
        this.emit({ type: 'token', data: { content: chunk.content } });
        yield { type: 'token', content: chunk.content };
      } else if (chunk.type === 'complete') {
        const formatted = formatSnapshotWithHeader(
          fullContent,
          this.config.specWriterModel,
          this.config.appIdea
        );

        await saveRequirementsSnapshot(this.sessionDir, formatted);
        this.state.requirementsSnapshotPath = getRequirementsSnapshotPath(this.sessionDir);
        await this.persistState();

        this.emit({ type: 'snapshot_complete', message: 'Requirements snapshot saved' });
        await appendSessionLogEvent(this.sessionDir, 'Snapshot Complete',
          `Saved to ${this.state.requirementsSnapshotPath}`);

        yield { type: 'complete', content: fullContent };
      }
    }
  }

  /**
   * Generate initial spec draft
   */
  async *generateDraft(): AsyncGenerator<{ type: string; content?: string }> {
    if (!this.config || !this.client || !this.transcript) {
      throw new Error('Cannot generate draft without clarification');
    }

    const snapshot = await loadRequirementsSnapshot(this.sessionDir);
    if (!snapshot) {
      throw new Error('Requirements snapshot not found');
    }

    this.stateMachine.transition('drafting');
    await this.persistState();

    this.emit({ type: 'draft_start', message: 'Generating initial specification' });
    await appendSessionLogEvent(this.sessionDir, 'Draft Generation Started');

    let fullContent = '';

    for await (const chunk of generateDraftStream(
      this.client,
      this.config.specWriterModel,
      this.config.prompts.specWriterDraft,
      snapshot,
      this.config.appIdea,
      this.transcript
    )) {
      this.checkAborted();

      if (chunk.type === 'token') {
        fullContent += chunk.content;
        this.emit({ type: 'token', data: { content: chunk.content } });
        yield { type: 'token', content: chunk.content };
      } else if (chunk.type === 'complete') {
        const appName = extractAppNameForSpec(this.config.appIdea);
        await saveSpecVersion(
          this.sessionDir,
          1,
          fullContent,
          this.config.specWriterModel,
          appName
        );
        this.state.latestSpecVersion = 1;
        await this.persistState();

        this.emit({ type: 'draft_complete', message: 'Initial specification saved' });
        await appendSessionLogEvent(this.sessionDir, 'Draft Complete',
          `Saved spec-v1.md`);

        yield { type: 'complete', content: fullContent };
      }
    }
  }

  /**
   * Run a feedback round
   */
  async runFeedbackRound(): Promise<void> {
    if (!this.config || !this.client) {
      throw new Error('Session not initialized');
    }

    const roundNumber = this.state.currentRound + 1;

    // Load required data
    const snapshot = await loadRequirementsSnapshot(this.sessionDir);
    if (!snapshot) throw new Error('Requirements snapshot not found');

    const currentSpec = await loadSpecVersion(this.sessionDir, this.state.latestSpecVersion);
    if (!currentSpec) throw new Error('Current spec not found');

    // Initialize round state if needed
    if (!this.state.rounds[roundNumber]) {
      this.state.rounds[roundNumber] = initializeRoundState(this.config.consultantModels);
    }

    this.state.currentRound = roundNumber;
    this.stateMachine.setCurrentRound(roundNumber);
    this.stateMachine.transition('reviewing');
    await this.persistState();

    this.emit({
      type: 'feedback_round_start',
      message: `Starting feedback round ${roundNumber}`,
      data: { round: roundNumber },
    });
    await appendSessionLogEvent(this.sessionDir, `Feedback Round ${roundNumber} Started`);

    // Get pending consultants (for resume support)
    const pendingModels = this.config.consultantModels.filter(
      (model) => this.state.rounds[roundNumber].consultants[model]?.status === 'pending'
    );

    // Run consultant calls
    const result = await runFeedbackRound(
      this.client,
      pendingModels,
      this.config.prompts.consultant,
      snapshot,
      stripSpecHeader(currentSpec),
      roundNumber,
      {
        onConsultantStart: (model) => {
          this.emit({
            type: 'consultant_start',
            message: `Getting feedback from ${model}`,
            data: { model, round: roundNumber },
          });
        },
        onConsultantComplete: async (model, feedback) => {
          // Update state
          this.state.rounds[roundNumber].consultants[model] = {
            status: feedback.status === 'success' ? 'complete' : 'error',
            path: null,
            duration: feedback.duration,
            error: feedback.error,
          };

          // Save individual response
          if (feedback.status === 'success') {
            const path = await saveConsultantResponse(
              this.sessionDir,
              roundNumber,
              model,
              feedback.content,
              feedback.duration,
              'success'
            );
            this.state.rounds[roundNumber].consultants[model].path = path;
          }

          await this.persistState();

          this.emit({
            type: 'consultant_complete',
            message: `${model}: ${feedback.status}`,
            data: { model, round: roundNumber, status: feedback.status },
          });
        },
      }
    );

    this.checkAborted();

    // Check for errors (FR-26: one failure = round failure)
    if (result.hasErrors) {
      const failedConsultants = result.feedbacks.filter(f => f.status === 'error');
      const errorMessage = `Feedback round failed: ${failedConsultants.map(f => f.modelId).join(', ')} failed`;

      this.stateMachine.transition('error');
      this.state.error = {
        message: errorMessage,
        step: 'reviewing',
        timestamp: new Date().toISOString(),
      };
      await this.persistState();

      await appendSessionLogEvent(this.sessionDir, 'Feedback Round Failed', errorMessage);
      throw new Error(errorMessage);
    }

    // Save feedback bundle
    const bundlePath = await saveFeedbackBundle(
      this.sessionDir,
      roundNumber,
      this.state.latestSpecVersion,
      result.feedbacks
    );
    this.state.rounds[roundNumber].feedbackBundlePath = bundlePath;
    await this.persistState();

    this.emit({
      type: 'feedback_round_complete',
      message: `Feedback round ${roundNumber} complete`,
      data: { round: roundNumber },
    });
    await appendSessionLogEvent(this.sessionDir, `Feedback Round ${roundNumber} Complete`,
      `Received ${result.feedbacks.length} consultant responses.`);

    // Generate revision
    await this.generateRevision(roundNumber, snapshot, currentSpec, result.aggregatedFeedback);
  }

  /**
   * Generate revised specification
   */
  private async generateRevision(
    roundNumber: number,
    snapshot: string,
    currentSpec: string,
    aggregatedFeedback: string
  ): Promise<void> {
    if (!this.config || !this.client) {
      throw new Error('Session not initialized');
    }

    this.stateMachine.transition('revising');
    await this.persistState();

    const newVersion = this.state.latestSpecVersion + 1;

    this.emit({
      type: 'revision_start',
      message: `Generating revision (v${newVersion})`,
      data: { round: roundNumber, version: newVersion },
    });
    await appendSessionLogEvent(this.sessionDir, 'Revision Started',
      `Generating spec v${newVersion} based on round ${roundNumber} feedback.`);

    const revisedSpec = await withRetry(
      () => generateRevision(
        this.client!,
        this.config!.specWriterModel,
        this.config!.prompts.specWriterRevise,
        snapshot,
        stripSpecHeader(currentSpec),
        aggregatedFeedback
      ),
      { maxRetries: 3 }
    );

    this.checkAborted();

    // Save revised spec
    const appName = extractAppNameForSpec(this.config.appIdea);
    await saveSpecVersion(
      this.sessionDir,
      newVersion,
      revisedSpec,
      this.config.specWriterModel,
      appName
    );

    this.state.latestSpecVersion = newVersion;
    this.state.rounds[roundNumber].revisedSpecPath = getSpecVersionPath(this.sessionDir, newVersion);
    await this.persistState();

    this.emit({
      type: 'revision_complete',
      message: `Revision v${newVersion} saved`,
      data: { round: roundNumber, version: newVersion },
    });
    await appendSessionLogEvent(this.sessionDir, 'Revision Complete',
      `Saved spec-v${newVersion}.md`);

    // Check if we should continue to next round or complete
    if (roundNumber >= this.config.numberOfRounds) {
      await this.completeSession();
    }
  }

  /**
   * Complete the session
   */
  private async completeSession(): Promise<void> {
    // Copy final spec
    await copyFinalSpec(this.sessionDir, this.state.latestSpecVersion);

    this.stateMachine.transition('completed');
    await this.persistState();

    this.emit({
      type: 'session_complete',
      message: 'Specification generation complete',
      data: { finalVersion: this.state.latestSpecVersion },
    });
    await appendSessionLogEvent(this.sessionDir, 'Session Complete',
      `Final specification saved as spec-final.md (v${this.state.latestSpecVersion}).`);
  }

  /**
   * Run the full workflow (for automated execution)
   */
  async *runFullWorkflow(): AsyncGenerator<OrchestratorEvent> {
    // Preflight
    const preflight = await this.runPreflight();
    if (!preflight.success) {
      return;
    }

    // Clarification (auto-advance when ready)
    let isReady = false;
    for await (const event of this.startClarification()) {
      if (event.type === 'complete') {
        isReady = event.isReady || false;
      }
    }

    // Note: In automated mode, we'd need to handle the clarification Q&A
    // This would typically be interactive, so we stop here for automated runs
    if (!isReady) {
      this.emit({
        type: 'error',
        message: 'Clarification phase requires user interaction',
      });
      return;
    }

    // Generate snapshot
    for await (const event of this.generateSnapshot()) {
      // Just consume the generator
    }

    // Generate draft
    for await (const event of this.generateDraft()) {
      // Just consume the generator
    }

    // Run feedback rounds
    for (let i = 0; i < this.config!.numberOfRounds; i++) {
      await this.runFeedbackRound();
    }
  }

  /**
   * Persist current state to disk
   */
  private async persistState(): Promise<void> {
    if (this.sessionDir) {
      await saveState(this.sessionDir, this.state);
    }
  }
}

// Export a factory function
export function createOrchestrator(): Orchestrator {
  return new Orchestrator();
}
