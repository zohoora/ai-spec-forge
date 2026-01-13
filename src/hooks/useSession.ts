'use client';

import { useState, useCallback, useRef } from 'react';
import { SessionConfig } from '@/types/config';
import { SessionState, SessionStatus, createInitialState } from '@/types/state';
import { ClarificationTranscript, ActivityEvent, createInitialTranscript, addUserMessage, addAssistantMessage } from '@/types/session';
import { generateId } from '@/lib/utils/format';
import { parseClarificationResponse, ClarificationResponse } from '@/lib/orchestrator/clarification';

interface UseSessionResult {
  // State
  config: SessionConfig | null;
  state: SessionState;
  sessionDir: string | null;
  transcript: ClarificationTranscript | null;
  streamingContent: string;
  isStreaming: boolean;
  isReady: boolean;
  activities: ActivityEvent[];
  startTime: number | null;

  // Actions
  createSession: (config: SessionConfig, apiKey: string) => Promise<void>;
  resumeSession: (sessionDir: string, apiKey: string) => Promise<void>;
  runPreflight: () => Promise<boolean>;
  startClarification: () => Promise<void>;
  sendClarificationResponse: (message: string) => Promise<void>;
  forceProgressToDrafting: () => Promise<void>;
  generateSnapshot: () => Promise<void>;
  generateDraft: () => Promise<void>;
  runFeedbackRound: (roundNumber: number) => Promise<void>;
  abort: () => void;
  reset: () => void;

  // Error
  error: string | null;
}

export function useSession(): UseSessionResult {
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [state, setState] = useState<SessionState>(createInitialState());
  const [sessionDir, setSessionDir] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<ClarificationTranscript | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiKeyRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  // Use a ref to store config immediately for use in callbacks before state updates
  const configRef = useRef<SessionConfig | null>(null);

  const addActivity = useCallback((type: ActivityEvent['type'], content: string, metadata?: ActivityEvent['metadata']) => {
    const event: ActivityEvent = {
      id: generateId(),
      type,
      timestamp: new Date().toISOString(),
      content,
      metadata,
    };
    setActivities((prev) => [...prev, event]);
  }, []);

  const updateState = useCallback((updates: Partial<SessionState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Create a new session
  const createSession = useCallback(async (sessionConfig: SessionConfig, apiKey: string) => {
    setError(null);
    apiKeyRef.current = apiKey;

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionConfig),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create session');
      }

      const data = await response.json();
      configRef.current = sessionConfig;  // Set ref immediately for callbacks
      setConfig(sessionConfig);
      setSessionDir(data.sessionDir);
      setState(createInitialState());
      setTranscript(null);
      setActivities([]);
      setStartTime(Date.now());

      addActivity('system', `Session created: ${data.sessionDir}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      setError(message);
      throw err;
    }
  }, [addActivity]);

  // Resume an existing session
  const resumeSession = useCallback(async (dir: string, apiKey: string) => {
    setError(null);
    apiKeyRef.current = apiKey;

    try {
      const sessionId = Buffer.from(dir).toString('base64');
      const response = await fetch(`/api/session/${sessionId}?include=config,state,transcript`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load session');
      }

      const data = await response.json();
      setConfig(data.config);
      setState(data.state);
      setSessionDir(dir);
      setTranscript(data.transcript || null);
      setStartTime(Date.now());

      addActivity('system', `Session resumed from ${data.state.status}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume session';
      setError(message);
      throw err;
    }
  }, [addActivity]);

  // Run preflight checks
  const runPreflight = useCallback(async (): Promise<boolean> => {
    const currentConfig = configRef.current || config;
    if (!currentConfig) throw new Error('No session configured');

    setError(null);
    updateState({ status: 'preflight' });
    addActivity('system', 'Running preflight checks...');

    try {
      const models = [currentConfig.specWriterModel, ...currentConfig.consultantModels];
      const response = await fetch('/api/preflight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKeyRef.current,
        },
        body: JSON.stringify({ models }),
      });

      const data = await response.json();

      if (!data.success) {
        const failedModels = data.results
          .filter((r: { reachable: boolean }) => !r.reachable)
          .map((r: { model: string; error?: string }) => `${r.model}: ${r.error || 'unreachable'}`);

        const errorMsg = `Preflight failed: ${failedModels.join(', ')}`;
        updateState({ status: 'error', error: { message: errorMsg, step: 'preflight', timestamp: new Date().toISOString() } });
        addActivity('error', errorMsg);
        setError(errorMsg);
        return false;
      }

      addActivity('system', 'All models reachable');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Preflight failed';
      updateState({ status: 'error', error: { message, step: 'preflight', timestamp: new Date().toISOString() } });
      addActivity('error', message);
      setError(message);
      return false;
    }
  }, [config, updateState, addActivity]);

  // Start clarification
  const startClarification = useCallback(async () => {
    const currentConfig = configRef.current || config;
    if (!currentConfig) throw new Error('No session configured');

    setError(null);
    setIsReady(false);
    updateState({ status: 'clarifying' });
    addActivity('system', 'Starting clarification phase');

    const initialTranscript = createInitialTranscript(
      currentConfig.prompts.specWriterClarify,
      currentConfig.appIdea
    );

    abortControllerRef.current = new AbortController();

    try {
      setIsStreaming(true);
      setStreamingContent('');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKeyRef.current,
        },
        body: JSON.stringify({
          model: currentConfig.specWriterModel,
          messages: initialTranscript.apiMessages,
          stream: true,
          response_format: { type: 'json_object' },
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to start clarification');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'token' && data.content) {
                fullContent += data.content;
                // Don't show raw JSON during streaming - just show thinking indicator
                setStreamingContent('...');
              } else if (data.type === 'complete') {
                const rawJson = data.fullContent || fullContent;
                // Parse the JSON response
                const parsed = parseClarificationResponse(rawJson);
                // Store the message (not raw JSON) in transcript
                const updatedTranscript = addAssistantMessage(initialTranscript, parsed.message);
                setTranscript(updatedTranscript);
                setIsReady(parsed.ready);
                addActivity('spec_writer', parsed.message, { model: currentConfig.specWriterModel });
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (parseErr) {
              // Only throw if it's from the error event, not JSON parsing during streaming
              if (parseErr instanceof Error && parseErr.message.startsWith('Invalid JSON')) {
                throw parseErr;
              }
              // Ignore other parse errors during streaming
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        addActivity('system', 'Clarification aborted');
        return;
      }
      const message = err instanceof Error ? err.message : 'Clarification failed';
      setError(message);
      addActivity('error', message);
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
    }
  }, [config, updateState, addActivity]);

  // Send clarification response
  const sendClarificationResponse = useCallback(async (message: string) => {
    if (!config || !transcript) throw new Error('Not in clarification phase');

    setError(null);
    addActivity('user_input', message);

    const withUser = addUserMessage(transcript, message);
    setTranscript(withUser);

    abortControllerRef.current = new AbortController();

    try {
      setIsStreaming(true);
      setStreamingContent('');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKeyRef.current,
        },
        body: JSON.stringify({
          model: config.specWriterModel,
          messages: withUser.apiMessages,
          stream: true,
          response_format: { type: 'json_object' },
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'token' && data.content) {
                fullContent += data.content;
                // Don't show raw JSON during streaming - just show thinking indicator
                setStreamingContent('...');
              } else if (data.type === 'complete') {
                const rawJson = data.fullContent || fullContent;
                // Parse the JSON response
                const parsed = parseClarificationResponse(rawJson);
                // Store the message (not raw JSON) in transcript
                const updatedTranscript = addAssistantMessage(withUser, parsed.message);
                setTranscript(updatedTranscript);
                setIsReady(parsed.ready);
                addActivity('spec_writer', parsed.message, { model: config.specWriterModel });
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (parseErr) {
              // Only throw if it's from the error event, not JSON parsing during streaming
              if (parseErr instanceof Error && parseErr.message.startsWith('Invalid JSON')) {
                throw parseErr;
              }
              // Ignore other parse errors during streaming
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        addActivity('system', 'Response aborted');
        return;
      }
      const errMessage = err instanceof Error ? err.message : 'Failed to get response';
      setError(errMessage);
      addActivity('error', errMessage);
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
    }
  }, [config, transcript, addActivity]);

  // Force progress to drafting
  const forceProgressToDrafting = useCallback(async () => {
    addActivity('system', 'User forced progression to drafting');
    updateState({ status: 'snapshotting' });
  }, [updateState, addActivity]);

  // Generate snapshot
  const generateSnapshot = useCallback(async () => {
    if (!config || !transcript) throw new Error('Cannot generate snapshot');

    setError(null);
    updateState({ status: 'snapshotting' });
    addActivity('system', 'Generating requirements snapshot...');

    // Build the snapshot prompt message
    const transcriptText = transcript.displayMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const messages = [
      { role: 'system' as const, content: config.prompts.specWriterSnapshot },
      {
        role: 'user' as const,
        content: `Original App Idea:\n\n${config.appIdea}\n\n---\n\nClarification Transcript:\n\n${transcriptText}`,
      },
    ];

    try {
      setIsStreaming(true);
      setStreamingContent('');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKeyRef.current,
        },
        body: JSON.stringify({
          model: config.specWriterModel,
          messages,
          stream: true,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate snapshot');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'token' && data.content) {
                fullContent += data.content;
                setStreamingContent(fullContent);
              } else if (data.type === 'complete') {
                // Save the snapshot file
                const snapshotPath = `${sessionDir}/requirements-snapshot.md`;
                await fetch('/api/files', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    filePath: snapshotPath,
                    content: data.fullContent || fullContent,
                  }),
                });
                addActivity('spec_writer', 'Requirements snapshot generated', { model: config.specWriterModel });
                addActivity('file_saved', 'Saved requirements-snapshot.md');
              }
            } catch {
              // Ignore
            }
          }
        }
      }

      updateState({ status: 'drafting', requirementsSnapshotPath: 'requirements-snapshot.md' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate snapshot';
      setError(message);
      addActivity('error', message);
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
    }
  }, [config, transcript, updateState, addActivity]);

  // Generate draft
  const generateDraft = useCallback(async () => {
    if (!config || !transcript) throw new Error('Cannot generate draft');

    setError(null);
    updateState({ status: 'drafting' });
    addActivity('system', 'Generating initial specification...');

    try {
      setIsStreaming(true);
      setStreamingContent('');

      // Similar pattern to snapshot...
      const transcriptText = transcript.displayMessages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKeyRef.current,
        },
        body: JSON.stringify({
          model: config.specWriterModel,
          messages: [
            { role: 'system', content: config.prompts.specWriterDraft },
            { role: 'user', content: `App Idea:\n\n${config.appIdea}\n\n---\n\nClarification:\n\n${transcriptText}` },
          ],
          stream: true,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate draft');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'token' && data.content) {
                fullContent += data.content;
                setStreamingContent(fullContent);
              } else if (data.type === 'complete') {
                // Save the spec file
                const specPath = `${sessionDir}/spec-v1.md`;
                await fetch('/api/files', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    filePath: specPath,
                    content: data.fullContent || fullContent,
                  }),
                });
                addActivity('spec_writer', 'Initial specification drafted', { model: config.specWriterModel });
                addActivity('file_saved', 'Saved spec-v1.md');
              }
            } catch {
              // Ignore
            }
          }
        }
      }

      updateState({ status: 'reviewing', latestSpecVersion: 1 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate draft';
      setError(message);
      addActivity('error', message);
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
    }
  }, [config, transcript, updateState, addActivity]);

  // Run feedback round
  const runFeedbackRound = useCallback(async (roundNumber: number) => {
    if (!config || !sessionDir) throw new Error('No session configured');

    updateState({ status: 'reviewing', currentRound: roundNumber });
    addActivity('system', `Starting feedback round ${roundNumber}/${config.numberOfRounds}`);

    try {
      // Read current spec
      const specPath = `${sessionDir}/spec-v${roundNumber}.md`;
      const specResponse = await fetch(`/api/files?path=${encodeURIComponent(specPath)}`);
      if (!specResponse.ok) {
        throw new Error('Failed to read current spec');
      }
      const { content: currentSpec } = await specResponse.json();

      // Call consultant models in parallel
      const consultantPromises = config.consultantModels.map(async (model) => {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKeyRef.current,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: config.prompts.consultant },
              { role: 'user', content: `Please review this specification:\n\n${currentSpec}` },
            ],
            stream: false,
          }),
        });

        if (!response.ok) {
          throw new Error(`Consultant ${model} failed`);
        }

        const data = await response.json();
        return { model, feedback: data.content || data.message?.content || '' };
      });

      const feedbackResults = await Promise.all(consultantPromises);

      // Log consultant feedback
      for (const result of feedbackResults) {
        addActivity('consultant', `Feedback from ${result.model}`, { model: result.model });

        // Save feedback file
        const feedbackPath = `${sessionDir}/feedback/round-${roundNumber}-${result.model.replace(/\//g, '-')}.md`;
        await fetch('/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: feedbackPath,
            content: result.feedback,
          }),
        });
      }

      // Aggregate feedback and revise spec
      const aggregatedFeedback = feedbackResults
        .map((r) => `## Feedback from ${r.model}\n\n${r.feedback}`)
        .join('\n\n---\n\n');

      updateState({ status: 'revising' });
      addActivity('system', 'Revising specification based on feedback...');

      // Call spec writer to revise
      setIsStreaming(true);
      const reviseResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKeyRef.current,
        },
        body: JSON.stringify({
          model: config.specWriterModel,
          messages: [
            { role: 'system', content: config.prompts.specWriterRevise },
            {
              role: 'user',
              content: `Current Specification:\n\n${currentSpec}\n\n---\n\nConsultant Feedback:\n\n${aggregatedFeedback}`,
            },
          ],
          stream: true,
        }),
      });

      if (!reviseResponse.ok) {
        throw new Error('Failed to revise spec');
      }

      const reader = reviseResponse.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let revisedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'token' && data.content) {
                revisedContent += data.content;
                setStreamingContent(revisedContent);
              } else if (data.type === 'complete') {
                revisedContent = data.fullContent || revisedContent;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Save revised spec
      const newSpecPath = `${sessionDir}/spec-v${roundNumber + 1}.md`;
      await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: newSpecPath,
          content: revisedContent,
        }),
      });

      addActivity('spec_writer', `Revised specification (v${roundNumber + 1})`, { model: config.specWriterModel });
      addActivity('file_saved', `Saved spec-v${roundNumber + 1}.md`);
      addActivity('system', `Feedback round ${roundNumber} complete`);

      updateState({ latestSpecVersion: roundNumber + 1 });

      // Check if all rounds complete
      if (roundNumber >= config.numberOfRounds) {
        updateState({ status: 'completed' });
        addActivity('system', 'All feedback rounds complete! Specification is ready.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Feedback round failed';
      setError(message);
      addActivity('error', message);
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
    }
  }, [config, sessionDir, updateState, addActivity, setIsStreaming, setStreamingContent, setError]);

  // Abort current operation
  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setStreamingContent('');
    addActivity('system', 'Operation aborted');
  }, [addActivity]);

  // Reset session
  const reset = useCallback(() => {
    setConfig(null);
    setState(createInitialState());
    setSessionDir(null);
    setTranscript(null);
    setStreamingContent('');
    setIsStreaming(false);
    setIsReady(false);
    setActivities([]);
    setStartTime(null);
    setError(null);
  }, []);

  return {
    config,
    state,
    sessionDir,
    transcript,
    streamingContent,
    isStreaming,
    isReady,
    activities,
    startTime,
    createSession,
    resumeSession,
    runPreflight,
    startClarification,
    sendClarificationResponse,
    forceProgressToDrafting,
    generateSnapshot,
    generateDraft,
    runFeedbackRound,
    abort,
    reset,
    error,
  };
}
