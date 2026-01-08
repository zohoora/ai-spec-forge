// API route for fetching available models from OpenRouter

import { NextRequest, NextResponse } from 'next/server';
import { createOpenRouterClient } from '@/lib/openrouter/client';

// Cache models in memory for the session
let cachedModels: unknown[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 401 }
      );
    }

    // Check cache
    const now = Date.now();
    if (cachedModels && now - cacheTimestamp < CACHE_DURATION) {
      return NextResponse.json({ models: cachedModels, cached: true });
    }

    // Fetch from OpenRouter
    const client = createOpenRouterClient({ apiKey });
    const models = await client.fetchModels();

    // Sort by name for better UX
    models.sort((a, b) => a.id.localeCompare(b.id));

    // Cache the result
    cachedModels = models;
    cacheTimestamp = now;

    return NextResponse.json({ models, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch models';

    // Clear cache on error
    cachedModels = null;

    return NextResponse.json(
      { error: message, discoveryAvailable: false },
      { status: 500 }
    );
  }
}
