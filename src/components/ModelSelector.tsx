'use client';

import React, { useState, useEffect } from 'react';
import { Input, Badge } from './ui';
import { ModelInfo } from '@/types/session';

interface ModelSelectorProps {
  label: string;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  models: ModelInfo[];
  loading?: boolean;
  error?: string;
  multiple?: boolean;
  maxSelections?: number;
  placeholder?: string;
}

export function ModelSelector({
  label,
  value,
  onChange,
  models,
  loading = false,
  error,
  multiple = false,
  maxSelections = 5,
  placeholder = 'Select a model or enter custom ID',
}: ModelSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const selectedModels = multiple
    ? (value as string[])
    : value ? [value as string] : [];

  const filteredModels = models.filter(
    (model) =>
      model.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      model.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (modelId: string) => {
    if (multiple) {
      const currentSelection = value as string[];
      if (currentSelection.includes(modelId)) {
        onChange(currentSelection.filter((id) => id !== modelId));
      } else if (currentSelection.length < maxSelections) {
        onChange([...currentSelection, modelId]);
      }
    } else {
      onChange(modelId);
      setIsOpen(false);
    }
  };

  const handleAddCustom = () => {
    if (!customInput.trim()) return;

    const modelId = customInput.trim();
    if (multiple) {
      const currentSelection = value as string[];
      if (!currentSelection.includes(modelId) && currentSelection.length < maxSelections) {
        onChange([...currentSelection, modelId]);
      }
    } else {
      onChange(modelId);
    }
    setCustomInput('');
  };

  const handleRemove = (modelId: string) => {
    if (multiple) {
      onChange((value as string[]).filter((id) => id !== modelId));
    } else {
      onChange('');
    }
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>

      {/* Selected models display */}
      {selectedModels.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedModels.map((modelId) => (
            <Badge key={modelId} variant="blue" size="md">
              <span className="font-mono text-xs">{modelId}</span>
              <button
                type="button"
                onClick={() => handleRemove(modelId)}
                className="ml-1 hover:text-blue-900"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`
            w-full px-3 py-2 text-left
            border rounded-lg bg-white
            text-gray-900
            focus:outline-none focus:ring-2 focus:ring-blue-500
            ${error ? 'border-red-500' : 'border-gray-300'}
          `}
        >
          <span className="text-gray-500">
            {loading ? 'Loading models...' : placeholder}
          </span>
          <svg
            className={`absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search models..."
                className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Custom input */}
            <div className="p-2 border-b flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Enter custom model ID"
                className="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddCustom}
                className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add
              </button>
            </div>

            {/* Model list */}
            <div className="max-h-48 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-gray-500">Loading...</div>
              ) : filteredModels.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  {models.length === 0
                    ? 'No models available. Enter a custom model ID.'
                    : 'No matches found'}
                </div>
              ) : (
                filteredModels.slice(0, 50).map((model) => {
                  const isSelected = selectedModels.includes(model.id);
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => handleSelect(model.id)}
                      className={`
                        w-full px-3 py-2 text-left text-sm
                        hover:bg-gray-100
                        ${isSelected ? 'bg-blue-50' : ''}
                      `}
                    >
                      <div className="font-mono text-xs text-gray-600">
                        {model.id}
                      </div>
                      {model.name && (
                        <div className="text-gray-900">{model.name}</div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}

      {multiple && (
        <p className="mt-1 text-xs text-gray-500">
          {selectedModels.length}/{maxSelections} selected
        </p>
      )}
    </div>
  );
}
