// Streaming utilities for OpenRouter responses

import { ChatMessage } from './types';

/**
 * Stream event types for UI consumption
 */
export type StreamEventType =
  | 'start'
  | 'token'
  | 'complete'
  | 'error';

export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  fullContent?: string;
  error?: string;
  timestamp: string;
}

/**
 * Create a ReadableStream from an async generator
 * Useful for API routes that need to stream to the client
 */
export function createStreamFromGenerator(
  generator: AsyncGenerator<string, void, unknown>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        let fullContent = '';

        // Send start event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'start',
              timestamp: new Date().toISOString(),
            })}\n\n`
          )
        );

        for await (const chunk of generator) {
          fullContent += chunk;

          // Send token event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'token',
                content: chunk,
                timestamp: new Date().toISOString(),
              })}\n\n`
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
        // Send error event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString(),
            })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}

/**
 * Accumulator class for collecting streamed tokens
 */
export class TokenAccumulator {
  private content: string = '';
  private onToken?: (token: string, accumulated: string) => void;
  private onComplete?: (fullContent: string) => void;

  constructor(options?: {
    onToken?: (token: string, accumulated: string) => void;
    onComplete?: (fullContent: string) => void;
  }) {
    this.onToken = options?.onToken;
    this.onComplete = options?.onComplete;
  }

  add(token: string): void {
    this.content += token;
    this.onToken?.(token, this.content);
  }

  complete(): string {
    this.onComplete?.(this.content);
    return this.content;
  }

  get accumulated(): string {
    return this.content;
  }

  reset(): void {
    this.content = '';
  }
}

/**
 * Parse SSE events from a response body
 */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<StreamEvent, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || !trimmed.startsWith('data: ')) {
        continue;
      }

      const data = trimmed.slice(6);

      try {
        const parsed = JSON.parse(data) as StreamEvent;
        yield parsed;
      } catch {
        // Ignore malformed JSON
      }
    }
  }
}

/**
 * Build messages array for API request
 */
export function buildMessages(
  systemPrompt: string,
  conversationHistory: ChatMessage[]
): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
  ];
}

/**
 * Create a message for the spec writer
 */
export function createSpecWriterMessage(
  type: 'clarify' | 'snapshot' | 'draft' | 'revise',
  context: {
    appIdea?: string;
    transcript?: string;
    requirementsSnapshot?: string;
    currentSpec?: string;
    feedback?: string;
  }
): string {
  switch (type) {
    case 'clarify':
      return `App Idea:\n\n${context.appIdea}`;

    case 'snapshot':
      return `Original App Idea:\n\n${context.appIdea}\n\n---\n\nClarification Transcript:\n\n${context.transcript}`;

    case 'draft':
      return `Requirements Snapshot:\n\n${context.requirementsSnapshot}\n\n---\n\nOriginal App Idea:\n\n${context.appIdea}\n\n---\n\nClarification Transcript:\n\n${context.transcript}`;

    case 'revise':
      return `Requirements Snapshot:\n\n${context.requirementsSnapshot}\n\n---\n\nCurrent Specification:\n\n${context.currentSpec}\n\n---\n\nConsultant Feedback:\n\n${context.feedback}`;
  }
}

/**
 * Create a message for consultants
 */
export function createConsultantMessage(
  requirementsSnapshot: string,
  currentSpec: string
): string {
  return `Requirements Snapshot (Source of Truth):\n\n${requirementsSnapshot}\n\n---\n\nCurrent Specification:\n\n${currentSpec}`;
}
