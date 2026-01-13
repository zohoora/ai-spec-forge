'use client';

import React, { useState, useEffect } from 'react';
import { Button, Input, Textarea, Card, CardHeader, CardTitle, CardContent } from './ui';
import { ModelSelector } from './ModelSelector';
import { PromptEditor } from './PromptEditor';
import { SessionConfig, validateConfig, ValidationError } from '@/types/config';
import { Prompts } from '@/types/config';
import { ModelInfo } from '@/types/session';
import { getDefaultPrompts } from '@/lib/prompts/defaults';

interface ConfigurationPanelProps {
  onStart: (config: SessionConfig) => void;
  onResume?: (sessionDir: string) => void;
  resumableSessions?: Array<{ path: string; name: string; status: string }>;
  disabled?: boolean;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
}

export function ConfigurationPanel({
  onStart,
  onResume,
  resumableSessions = [],
  disabled = false,
  apiKey,
  onApiKeyChange,
}: ConfigurationPanelProps) {
  const [appIdea, setAppIdea] = useState('');
  const [specWriterModel, setSpecWriterModel] = useState('');
  const [consultantModels, setConsultantModels] = useState<string[]>([]);
  const [numberOfRounds, setNumberOfRounds] = useState(3);
  const [outputDirectory, setOutputDirectory] = useState('');
  const [prompts, setPrompts] = useState<Prompts>(getDefaultPrompts());

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const [errors, setErrors] = useState<ValidationError[]>([]);

  // Fetch models when API key changes
  useEffect(() => {
    if (!apiKey) {
      setModels([]);
      setModelsError(null);
      return;
    }

    const fetchModels = async () => {
      setModelsLoading(true);
      setModelsError(null);

      try {
        const response = await fetch('/api/models', {
          headers: { 'x-api-key': apiKey },
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch models');
        }

        const data = await response.json();
        setModels(data.models);
      } catch (error) {
        setModelsError(error instanceof Error ? error.message : 'Failed to fetch models');
        setModels([]);
      } finally {
        setModelsLoading(false);
      }
    };

    fetchModels();
  }, [apiKey]);

  // Set default output directory
  useEffect(() => {
    if (!outputDirectory && typeof window !== 'undefined') {
      // Use a sensible default - this will be validated server-side
      setOutputDirectory('~/Documents/AI-Spec-Forge');
    }
  }, [outputDirectory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const config: SessionConfig = {
      appIdea,
      specWriterModel,
      consultantModels,
      numberOfRounds,
      prompts,
      outputDirectory, // Server will expand tilde
      createdAt: new Date().toISOString(),
    };

    const validationErrors = validateConfig(config);

    if (!apiKey) {
      validationErrors.push({ field: 'apiKey', message: 'API key is required' });
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors([]);
    onStart(config);
  };

  const getFieldError = (field: string): string | undefined => {
    return errors.find((e) => e.field === field)?.message;
  };

  return (
    <Card className="h-full overflow-y-auto">
      <CardHeader>
        <CardTitle>Session Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* API Key */}
          <Input
            label="OpenRouter API Key"
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="sk-or-..."
            error={getFieldError('apiKey')}
            helperText="Your API key is stored locally and never logged"
            disabled={disabled}
          />

          {/* App Idea */}
          <Textarea
            label="App Idea"
            value={appIdea}
            onChange={(e) => setAppIdea(e.target.value)}
            placeholder="Describe your app idea in detail. What problem does it solve? Who is it for? What are the key features?"
            rows={6}
            error={getFieldError('appIdea')}
            disabled={disabled}
            autoResize
            maxHeight={300}
          />

          {/* Spec Writer Model */}
          <ModelSelector
            label="Spec Writer Model"
            value={specWriterModel}
            onChange={(v) => setSpecWriterModel(v as string)}
            models={models}
            loading={modelsLoading}
            error={modelsError || getFieldError('specWriterModel')}
            placeholder="Select the model that will write the spec"
          />

          {/* Consultant Models */}
          <ModelSelector
            label="Consultant Models"
            value={consultantModels}
            onChange={(v) => setConsultantModels(v as string[])}
            models={models}
            loading={modelsLoading}
            error={modelsError || getFieldError('consultantModels')}
            multiple
            maxSelections={5}
            placeholder="Select 1-5 models to review the spec"
          />

          {/* Number of Rounds */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Feedback Rounds
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={10}
                value={numberOfRounds}
                onChange={(e) => setNumberOfRounds(parseInt(e.target.value))}
                className="flex-1"
                disabled={disabled}
              />
              <span className="text-lg font-medium text-gray-900 w-8">
                {numberOfRounds}
              </span>
            </div>
            {getFieldError('numberOfRounds') && (
              <p className="mt-1 text-sm text-red-600">{getFieldError('numberOfRounds')}</p>
            )}
          </div>

          {/* Output Directory */}
          <Input
            label="Output Directory"
            value={outputDirectory}
            onChange={(e) => setOutputDirectory(e.target.value)}
            placeholder="/path/to/output"
            error={getFieldError('outputDirectory')}
            helperText="All session files will be saved here"
            disabled={disabled}
          />

          {/* Prompt Editor */}
          <PromptEditor
            prompts={prompts}
            onChange={setPrompts}
            disabled={disabled}
          />

          {/* Resumable Sessions */}
          {resumableSessions.length > 0 && onResume && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Resume Previous Session
              </h4>
              <div className="space-y-2">
                {resumableSessions.map((session) => (
                  <button
                    key={session.path}
                    type="button"
                    onClick={() => onResume(session.path)}
                    className="w-full text-left px-3 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                    disabled={disabled}
                  >
                    <div className="font-medium text-gray-900">{session.name}</div>
                    <div className="text-sm text-gray-500">Status: {session.status}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="submit"
              disabled={disabled || !apiKey}
              className="flex-1"
            >
              Start Session
            </Button>
          </div>

          {/* Validation Errors Summary */}
          {errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="text-sm font-medium text-red-800 mb-1">
                Please fix the following errors:
              </h4>
              <ul className="text-sm text-red-600 list-disc list-inside">
                {errors.map((error, index) => (
                  <li key={index}>{error.message}</li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
