// Clarification phase logic per spec section 3.3, FR-14 to FR-17

import { ClarificationTranscript, createInitialTranscript, addUserMessage, addAssistantMessage } from '@/types/session';
import { OpenRouterClient } from '@/lib/openrouter/client';
import { ChatMessage } from '@/lib/openrouter/types';

/**
 * Detect if the spec writer has signaled readiness to draft
 * Per spec FR-15: tolerant match (case-insensitive, whitespace, markdown)
 */
export function isReadyToDraft(content: string): boolean {
  // Remove markdown emphasis (* and _)
  const cleaned = content.replace(/\*+/g, '').replace(/_+/g, '');

  // Check for the signal on its own line
  // Case-insensitive, ignoring surrounding whitespace
  const lines = cleaned.split('\n');

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (trimmed === 'ready to write spec') {
      return true;
    }
  }

  return false;
}

/**
 * Extract any notes after the ready signal
 */
export function extractPostReadyNotes(content: string): string | null {
  const cleaned = content.replace(/\*+/g, '').replace(/_+/g, '');
  const lines = cleaned.split('\n');

  let foundSignal = false;
  const notes: string[] = [];

  for (const line of lines) {
    if (foundSignal) {
      notes.push(line);
    } else {
      const trimmed = line.trim().toLowerCase();
      if (trimmed === 'ready to write spec') {
        foundSignal = true;
      }
    }
  }

  const result = notes.join('\n').trim();
  return result || null;
}

export interface ClarificationResult {
  transcript: ClarificationTranscript;
  isReady: boolean;
  lastResponse: string;
}

/**
 * Start the clarification phase
 * Returns the initial question from the spec writer
 */
export async function startClarification(
  client: OpenRouterClient,
  model: string,
  systemPrompt: string,
  appIdea: string
): Promise<{ transcript: ClarificationTranscript; response: string }> {
  // Create initial transcript with system prompt and app idea
  const transcript = createInitialTranscript(systemPrompt, appIdea);

  // Get initial response from spec writer
  const response = await client.chat({
    model,
    messages: transcript.apiMessages as ChatMessage[],
  });

  // Add assistant response to transcript
  const updatedTranscript = addAssistantMessage(transcript, response);

  return {
    transcript: updatedTranscript,
    response,
  };
}

/**
 * Start clarification with streaming
 */
export async function* startClarificationStream(
  client: OpenRouterClient,
  model: string,
  systemPrompt: string,
  appIdea: string
): AsyncGenerator<{ type: 'token' | 'complete'; content: string; transcript?: ClarificationTranscript }, void, unknown> {
  // Create initial transcript
  const transcript = createInitialTranscript(systemPrompt, appIdea);

  let fullResponse = '';

  // Stream response
  for await (const chunk of client.chatStream({
    model,
    messages: transcript.apiMessages as ChatMessage[],
  })) {
    fullResponse += chunk;
    yield { type: 'token', content: chunk };
  }

  // Add complete response to transcript
  const updatedTranscript = addAssistantMessage(transcript, fullResponse);

  yield {
    type: 'complete',
    content: fullResponse,
    transcript: updatedTranscript,
  };
}

/**
 * Continue clarification with user's response
 */
export async function continueClarification(
  client: OpenRouterClient,
  model: string,
  transcript: ClarificationTranscript,
  userResponse: string
): Promise<ClarificationResult> {
  // Add user response to transcript
  const withUser = addUserMessage(transcript, userResponse);

  // Get next response from spec writer
  const response = await client.chat({
    model,
    messages: withUser.apiMessages as ChatMessage[],
  });

  // Add assistant response
  const updatedTranscript = addAssistantMessage(withUser, response);

  return {
    transcript: updatedTranscript,
    isReady: isReadyToDraft(response),
    lastResponse: response,
  };
}

/**
 * Continue clarification with streaming
 */
export async function* continueClarificationStream(
  client: OpenRouterClient,
  model: string,
  transcript: ClarificationTranscript,
  userResponse: string
): AsyncGenerator<{ type: 'token' | 'complete'; content: string; transcript?: ClarificationTranscript; isReady?: boolean }, void, unknown> {
  // Add user response to transcript
  const withUser = addUserMessage(transcript, userResponse);

  let fullResponse = '';

  // Stream response
  for await (const chunk of client.chatStream({
    model,
    messages: withUser.apiMessages as ChatMessage[],
  })) {
    fullResponse += chunk;
    yield { type: 'token', content: chunk };
  }

  // Add complete response to transcript
  const updatedTranscript = addAssistantMessage(withUser, fullResponse);

  yield {
    type: 'complete',
    content: fullResponse,
    transcript: updatedTranscript,
    isReady: isReadyToDraft(fullResponse),
  };
}

/**
 * Format transcript for display purposes
 */
export function formatTranscriptForDisplay(transcript: ClarificationTranscript): string {
  return transcript.displayMessages
    .map((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Spec Writer';
      return `**${role}** (${msg.timestamp}):\n${msg.content}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Format transcript for inclusion in prompts
 */
export function formatTranscriptForPrompt(transcript: ClarificationTranscript): string {
  return transcript.displayMessages
    .map((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${msg.content}`;
    })
    .join('\n\n');
}

/**
 * Get message count from transcript
 */
export function getMessageCount(transcript: ClarificationTranscript): number {
  return transcript.displayMessages.length;
}

/**
 * Get last message from transcript
 */
export function getLastMessage(transcript: ClarificationTranscript): { role: string; content: string } | null {
  const messages = transcript.displayMessages;
  if (messages.length === 0) return null;
  return messages[messages.length - 1];
}
