// API route for testing model reachability

import { NextRequest, NextResponse } from 'next/server';
import { createOpenRouterClient } from '@/lib/openrouter/client';
import { withRetry } from '@/lib/utils/retry';

interface PreflightRequest {
  models: string[];
}

interface ModelResult {
  model: string;
  reachable: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 401 }
      );
    }

    const body: PreflightRequest = await request.json();

    if (!body.models || !Array.isArray(body.models) || body.models.length === 0) {
      return NextResponse.json(
        { error: 'At least one model is required' },
        { status: 400 }
      );
    }

    const client = createOpenRouterClient({ apiKey });

    // Get unique models
    const uniqueModels = [...new Set(body.models)];
    const results: ModelResult[] = [];

    // Test each model (sequentially to avoid overwhelming the API)
    for (const model of uniqueModels) {
      try {
        await withRetry(
          () => client.testReachability(model),
          { maxRetries: 2, maxDuration: 30000 }
        );
        results.push({ model, reachable: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({ model, reachable: false, error: message });
      }
    }

    const allReachable = results.every((r) => r.reachable);

    return NextResponse.json({
      success: allReachable,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preflight check failed';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
