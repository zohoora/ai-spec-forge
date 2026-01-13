// API route for streaming chat completions

import { NextRequest } from 'next/server';
import { createOpenRouterClient } from '@/lib/openrouter/client';
import { ChatMessage } from '@/lib/openrouter/types';

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  response_format?: {
    type: 'json_object' | 'text';
  };
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key is required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body: ChatRequest = await request.json();

    if (!body.model) {
      return new Response(
        JSON.stringify({ error: 'Model is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!body.messages || body.messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const client = createOpenRouterClient({ apiKey });

    // Non-streaming response
    if (body.stream === false) {
      const response = await client.chat({
        model: body.model,
        messages: body.messages,
        response_format: body.response_format,
      });

      return new Response(
        JSON.stringify({ content: response }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Streaming response
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send start event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'start', timestamp: new Date().toISOString() })}\n\n`
            )
          );

          let fullContent = '';

          // Stream tokens
          for await (const chunk of client.chatStream({
            model: body.model,
            messages: body.messages,
            response_format: body.response_format,
          })) {
            fullContent += chunk;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`
              )
            );
          }

          // Send complete event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'complete',
                fullContent,
                timestamp: new Date().toISOString(),
              })}\n\n`
            )
          );

          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Streaming failed';

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: message,
                timestamp: new Date().toISOString(),
              })}\n\n`
            )
          );

          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chat request failed';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
