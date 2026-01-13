'use client';

import React, { useState, useRef, ChangeEvent } from 'react';
import { Textarea, Button, Collapsible, CollapsibleContent } from './ui';

interface SpecImporterProps {
  value: string | null;
  onChange: (spec: string | null) => void;
  disabled?: boolean;
  error?: string;
}

type InputMode = 'file' | 'paste';

export function SpecImporter({ value, onChange, disabled, error }: SpecImporterProps) {
  const [inputMode, setInputMode] = useState<InputMode>('file');
  const [pasteContent, setPasteContent] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);

    if (!file) {
      return;
    }

    // Validate file extension
    if (!file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
      setFileError('Please select a .md or .txt file');
      return;
    }

    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
      setFileError('File is too large (max 1MB)');
      return;
    }

    try {
      const content = await file.text();
      setFileName(file.name);
      onChange(content);
    } catch {
      setFileError('Failed to read file');
    }
  };

  const handlePasteChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const content = e.target.value;
    setPasteContent(content);
    onChange(content || null);
  };

  const handleClear = () => {
    onChange(null);
    setPasteContent('');
    setFileName(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleModeSwitch = (mode: InputMode) => {
    setInputMode(mode);
    // Clear when switching modes
    if (value) {
      handleClear();
    }
  };

  const charCount = value?.length || 0;
  const hasContent = charCount > 0;

  return (
    <Collapsible title="Import Existing Spec (Optional)" defaultOpen={false}>
      <div className="space-y-4">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleModeSwitch('file')}
            disabled={disabled}
            className={`
              px-3 py-1.5 text-sm rounded-md transition-colors
              ${inputMode === 'file'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            Upload File
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('paste')}
            disabled={disabled}
            className={`
              px-3 py-1.5 text-sm rounded-md transition-colors
              ${inputMode === 'paste'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            Paste Content
          </button>
        </div>

        {/* File picker */}
        {inputMode === 'file' && (
          <div>
            <input
              type="file"
              accept=".md,.txt"
              onChange={handleFileSelect}
              ref={fileInputRef}
              disabled={disabled}
              className="
                block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-medium
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            />
            {fileError && (
              <p className="mt-1 text-sm text-red-600">{fileError}</p>
            )}
            {fileName && !fileError && (
              <p className="mt-1 text-sm text-green-600">
                Loaded: {fileName}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Supports .md and .txt files (max 1MB)
            </p>
          </div>
        )}

        {/* Paste textarea */}
        {inputMode === 'paste' && (
          <Textarea
            label=""
            value={pasteContent}
            onChange={handlePasteChange}
            rows={8}
            placeholder="Paste your existing specification here..."
            disabled={disabled}
            autoResize
            maxHeight={300}
          />
        )}

        {/* Preview and stats */}
        {hasContent && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-green-600">
                Spec imported ({charCount.toLocaleString()} characters)
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={disabled}
              >
                Clear
              </Button>
            </div>
            <CollapsibleContent content={value!} maxLength={300} />
          </div>
        )}

        {/* Error display */}
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {/* Helper text */}
        {!hasContent && (
          <p className="text-xs text-gray-500">
            Import an existing spec to refine it. The AI will ask about changes you want to make.
          </p>
        )}
      </div>
    </Collapsible>
  );
}
