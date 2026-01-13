'use client';

import React, { useState, useEffect } from 'react';
import {
  ConfigurationPanel,
  ActivityStream,
  ClarificationChat,
  ProgressIndicator,
  ErrorDisplay,
  ErrorBoundary,
  StatusBadge,
  Card,
  Button,
} from '@/components';
import { useSession } from '@/hooks';
import { SessionConfig } from '@/types/config';

type AppPhase = 'config' | 'running' | 'clarifying';

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [phase, setPhase] = useState<AppPhase>('config');

  const {
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
    runPreflight,
    startClarification,
    sendClarificationResponse,
    forceProgressToDrafting,
    generateSnapshot,
    generateDraft,
    runFeedbackRound,
    abort,
    reset,
  } = useSession();

  // Load API key from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem('openrouter_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  // Save API key to localStorage
  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    if (key) {
      localStorage.setItem('openrouter_api_key', key);
    } else {
      localStorage.removeItem('openrouter_api_key');
    }
  };

  // Handle session start
  const handleStart = async (sessionConfig: SessionConfig) => {
    try {
      await createSession(sessionConfig, apiKey);
      setPhase('running');

      // Run preflight
      const preflightPassed = await runPreflight();
      if (!preflightPassed) {
        return;
      }

      // Start clarification
      setPhase('clarifying');
      await startClarification();
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  };

  // Handle clarification response
  const handleSendMessage = async (message: string) => {
    await sendClarificationResponse(message);
  };

  // Handle force progress to drafting
  const handleForceProgress = async () => {
    await forceProgressToDrafting();
    await runDraftingPhase();
  };

  // Run drafting and feedback phases
  const runDraftingPhase = async () => {
    setPhase('running');

    // Generate snapshot
    await generateSnapshot();

    // Generate draft
    await generateDraft();

    // Run feedback rounds
    if (config) {
      for (let i = 1; i <= config.numberOfRounds; i++) {
        await runFeedbackRound(i);
      }
    }
  };

  // Handle abort
  const handleAbort = () => {
    abort();
    setPhase('config');
  };

  // Handle reset
  const handleReset = () => {
    reset();
    setPhase('config');
  };

  // Determine what to show based on phase
  const renderContent = () => {
    if (phase === 'config') {
      return (
        <div className="max-w-2xl mx-auto">
          <ConfigurationPanel
            onStart={handleStart}
            apiKey={apiKey}
            onApiKeyChange={handleApiKeyChange}
            disabled={isStreaming}
          />
        </div>
      );
    }

    if (phase === 'clarifying') {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-200px)]">
          {/* Clarification Chat */}
          <Card padding="none" className="overflow-hidden">
            <ClarificationChat
              transcript={transcript}
              streamingContent={streamingContent}
              isStreaming={isStreaming}
              isReady={isReady}
              onSendMessage={handleSendMessage}
              onForceProgress={handleForceProgress}
              onAbort={handleAbort}
              disabled={state.status === 'error'}
            />
          </Card>

          {/* Activity Stream */}
          <Card>
            <h2 className="font-semibold text-gray-900 mb-4">Activity Log</h2>
            <ActivityStream events={activities} maxHeight="calc(100vh - 320px)" />
          </Card>
        </div>
      );
    }

    // Running phase
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content - Activity Stream */}
        <Card className="lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">Activity Log</h2>
          <ActivityStream events={activities} maxHeight="calc(100vh - 350px)" />
        </Card>

        {/* Sidebar - Status and Actions */}
        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Session Info</h3>
            {sessionDir && (
              <div className="text-sm text-gray-600 mb-2 break-all">
                <span className="font-medium">Directory:</span>
                <br />
                {sessionDir}
              </div>
            )}
            {config && (
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Spec Writer:</span>
                  <span className="ml-2 font-mono text-xs">{config.specWriterModel}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Consultants:</span>
                  <span className="ml-2">{config.consultantModels.length}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Rounds:</span>
                  <span className="ml-2">{config.numberOfRounds}</span>
                </div>
              </div>
            )}
          </Card>

          {/* Error display */}
          {state.error && (
            <ErrorDisplay
              error={state.error}
              onRetry={() => {
                // Retry logic based on current step
              }}
              onAbort={handleAbort}
            />
          )}

          {/* Actions */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Actions</h3>
            <div className="space-y-2">
              {isStreaming && (
                <Button variant="danger" onClick={abort} className="w-full">
                  Cancel Current Operation
                </Button>
              )}
              <Button variant="secondary" onClick={handleReset} className="w-full">
                Start New Session
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-gray-900">AI Spec Forge</h1>
                {phase !== 'config' && (
                  <StatusBadge status={state.status} />
                )}
              </div>

              {phase !== 'config' && config && (
                <div className="text-sm text-gray-500">
                  Round {state.currentRound}/{config.numberOfRounds}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Progress indicator */}
        {phase !== 'config' && (
          <div className="bg-white border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <ProgressIndicator
                status={state.status}
                currentRound={state.currentRound}
                totalRounds={config?.numberOfRounds || 0}
                startTime={startTime || undefined}
              />
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {renderContent()}
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <p className="text-sm text-gray-500 text-center">
              AI Spec Forge - Iteratively develop application specifications using multiple AI models
            </p>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
