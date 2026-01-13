// Clarification phase logic per spec section 3.3, FR-14 to FR-17

import { ClarificationTranscript, createInitialTranscript, addUserMessage, addAssistantMessage } from '@/types/session';
import { OpenRouterClient } from '@/lib/openrouter/client';
import { ChatMessage } from '@/lib/openrouter/types';

/**
 * Structured response from the clarification LLM
 */
export interface ClarificationResponse {
  ready: boolean;
  message: string;
  notes?: string;
}

/**
 * Strip markdown code blocks from LLM response
 */
function stripMarkdownCodeBlocks(content: string): string {
  let cleaned = content.trim();

  // Remove ```json or ``` at the start
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');

  // Remove ``` at the end
  cleaned = cleaned.replace(/\n?```\s*$/i, '');

  return cleaned.trim();
}

/**
 * Parse the JSON response from the LLM
 * Returns the parsed response or throws if invalid
 */
export function parseClarificationResponse(content: string): ClarificationResponse {
  try {
    // Strip markdown code blocks if present
    const cleanedContent = stripMarkdownCodeBlocks(content);
    const parsed = JSON.parse(cleanedContent);

    // Validate required fields
    if (typeof parsed.ready !== 'boolean') {
      throw new Error('Missing or invalid "ready" field (must be boolean)');
    }
    if (typeof parsed.message !== 'string' || !parsed.message.trim()) {
      throw new Error('Missing or invalid "message" field (must be non-empty string)');
    }

    return {
      ready: parsed.ready,
      message: parsed.message.trim(),
      notes: typeof parsed.notes === 'string' ? parsed.notes.trim() || undefined : undefined,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON response from LLM: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Check if the parsed response indicates readiness to draft
 */
export function isReadyToDraft(response: ClarificationResponse): boolean {
  return response.ready === true;
}

/**
 * Extract notes from the parsed response
 */
export function extractPostReadyNotes(response: ClarificationResponse): string | null {
  return response.notes || null;
}

export interface ClarificationResult {
  transcript: ClarificationTranscript;
  isReady: boolean;
  lastResponse: string;
  parsedResponse: ClarificationResponse;
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
): Promise<{ transcript: ClarificationTranscript; response: string; parsedResponse: ClarificationResponse }> {
  // Create initial transcript with system prompt and app idea
  const transcript = createInitialTranscript(systemPrompt, appIdea);

  // Get initial response from spec writer with JSON format
  const rawResponse = await client.chat({
    model,
    messages: transcript.apiMessages as ChatMessage[],
    response_format: { type: 'json_object' },
  });

  // Parse the JSON response
  const parsedResponse = parseClarificationResponse(rawResponse);

  // Add the message (not raw JSON) to transcript for display
  const updatedTranscript = addAssistantMessage(transcript, parsedResponse.message);

  return {
    transcript: updatedTranscript,
    response: parsedResponse.message,
    parsedResponse,
  };
}

/**
 * Start clarification with streaming
 * Note: We stream the raw JSON, then parse at the end to extract the message
 */
export async function* startClarificationStream(
  client: OpenRouterClient,
  model: string,
  systemPrompt: string,
  appIdea: string
): AsyncGenerator<{ type: 'token' | 'complete'; content: string; transcript?: ClarificationTranscript; parsedResponse?: ClarificationResponse }, void, unknown> {
  // Create initial transcript
  const transcript = createInitialTranscript(systemPrompt, appIdea);

  let fullResponse = '';

  // Stream response with JSON format
  for await (const chunk of client.chatStream({
    model,
    messages: transcript.apiMessages as ChatMessage[],
    response_format: { type: 'json_object' },
  })) {
    fullResponse += chunk;
    yield { type: 'token', content: chunk };
  }

  // Parse the complete JSON response
  const parsedResponse = parseClarificationResponse(fullResponse);

  // Add the message (not raw JSON) to transcript for display
  const updatedTranscript = addAssistantMessage(transcript, parsedResponse.message);

  yield {
    type: 'complete',
    content: parsedResponse.message,
    transcript: updatedTranscript,
    parsedResponse,
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

  // Get next response from spec writer with JSON format
  const rawResponse = await client.chat({
    model,
    messages: withUser.apiMessages as ChatMessage[],
    response_format: { type: 'json_object' },
  });

  // Parse the JSON response
  const parsedResponse = parseClarificationResponse(rawResponse);

  // Add the message (not raw JSON) to transcript
  const updatedTranscript = addAssistantMessage(withUser, parsedResponse.message);

  return {
    transcript: updatedTranscript,
    isReady: isReadyToDraft(parsedResponse),
    lastResponse: parsedResponse.message,
    parsedResponse,
  };
}

/**
 * Continue clarification with streaming
 * Note: We stream the raw JSON, then parse at the end to extract the message
 */
export async function* continueClarificationStream(
  client: OpenRouterClient,
  model: string,
  transcript: ClarificationTranscript,
  userResponse: string
): AsyncGenerator<{ type: 'token' | 'complete'; content: string; transcript?: ClarificationTranscript; isReady?: boolean; parsedResponse?: ClarificationResponse }, void, unknown> {
  // Add user response to transcript
  const withUser = addUserMessage(transcript, userResponse);

  let fullResponse = '';

  // Stream response with JSON format
  for await (const chunk of client.chatStream({
    model,
    messages: withUser.apiMessages as ChatMessage[],
    response_format: { type: 'json_object' },
  })) {
    fullResponse += chunk;
    yield { type: 'token', content: chunk };
  }

  // Parse the complete JSON response
  const parsedResponse = parseClarificationResponse(fullResponse);

  // Add the message (not raw JSON) to transcript
  const updatedTranscript = addAssistantMessage(withUser, parsedResponse.message);

  yield {
    type: 'complete',
    content: parsedResponse.message,
    transcript: updatedTranscript,
    isReady: isReadyToDraft(parsedResponse),
    parsedResponse,
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
