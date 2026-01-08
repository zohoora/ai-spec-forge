'use client';

import { useState, useEffect, useCallback } from 'react';
import { ModelInfo } from '@/types/session';

interface UseModelsResult {
  models: ModelInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useModels(apiKey: string): UseModelsResult {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    if (!apiKey) {
      setModels([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/models', {
        headers: { 'x-api-key': apiKey },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch models');
      }

      const data = await response.json();
      setModels(data.models || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  return {
    models,
    loading,
    error,
    refresh: fetchModels,
  };
}
