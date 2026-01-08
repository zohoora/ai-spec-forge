'use client';

import React, { useState } from 'react';
import { Textarea, Button, Collapsible } from './ui';
import { Prompts } from '@/types/config';
import { getDefaultPrompts } from '@/lib/prompts/defaults';

interface PromptEditorProps {
  prompts: Prompts;
  onChange: (prompts: Prompts) => void;
  disabled?: boolean;
}

const promptLabels: Record<keyof Prompts, { label: string; description: string }> = {
  specWriterClarify: {
    label: 'Clarification Prompt',
    description: 'Used during the clarification phase to ask questions about the app idea',
  },
  specWriterSnapshot: {
    label: 'Snapshot Prompt',
    description: 'Used to generate the requirements snapshot',
  },
  specWriterDraft: {
    label: 'Drafting Prompt',
    description: 'Used to generate the initial specification',
  },
  specWriterRevise: {
    label: 'Revision Prompt',
    description: 'Used to revise the specification based on feedback',
  },
  consultant: {
    label: 'Consultant Prompt',
    description: 'Used by consultant models to review the specification',
  },
};

export function PromptEditor({ prompts, onChange, disabled = false }: PromptEditorProps) {
  const [activeTab, setActiveTab] = useState<keyof Prompts>('specWriterClarify');
  const defaults = getDefaultPrompts();

  const handleChange = (key: keyof Prompts, value: string) => {
    onChange({ ...prompts, [key]: value });
  };

  const handleReset = (key: keyof Prompts) => {
    onChange({ ...prompts, [key]: defaults[key] });
  };

  const handleResetAll = () => {
    onChange(defaults);
  };

  const tabs = Object.keys(promptLabels) as (keyof Prompts)[];

  return (
    <Collapsible title="Edit Prompts" defaultOpen={false}>
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b pb-2">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`
                px-3 py-1 text-sm rounded-lg transition-colors
                ${activeTab === key
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
                }
              `}
            >
              {promptLabels[key].label}
            </button>
          ))}
        </div>

        {/* Active prompt editor */}
        <div>
          <div className="mb-2">
            <h4 className="font-medium text-gray-900">
              {promptLabels[activeTab].label}
            </h4>
            <p className="text-sm text-gray-500">
              {promptLabels[activeTab].description}
            </p>
          </div>

          <Textarea
            value={prompts[activeTab]}
            onChange={(e) => handleChange(activeTab, e.target.value)}
            rows={10}
            disabled={disabled}
            className="font-mono text-sm"
          />

          <div className="mt-2 flex justify-between items-center">
            <span className="text-xs text-gray-500">
              {prompts[activeTab].length} characters
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleReset(activeTab)}
                disabled={disabled || prompts[activeTab] === defaults[activeTab]}
              >
                Reset to Default
              </Button>
            </div>
          </div>
        </div>

        {/* Reset all button */}
        <div className="pt-2 border-t">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleResetAll}
            disabled={disabled}
          >
            Reset All Prompts to Defaults
          </Button>
        </div>
      </div>
    </Collapsible>
  );
}
