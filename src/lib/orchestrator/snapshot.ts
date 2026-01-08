// Requirements snapshot generation per spec section 3.4, FR-18, FR-19

import { OpenRouterClient } from '@/lib/openrouter/client';
import { ChatMessage } from '@/lib/openrouter/types';
import { formatTranscriptForPrompt } from './clarification';
import { ClarificationTranscript } from '@/types/session';

/**
 * Generate requirements snapshot from app idea and clarification transcript
 * Per spec FR-18, FR-19
 */
export async function generateSnapshot(
  client: OpenRouterClient,
  model: string,
  systemPrompt: string,
  appIdea: string,
  transcript: ClarificationTranscript
): Promise<string> {
  const transcriptText = formatTranscriptForPrompt(transcript);

  const userMessage = `Original App Idea:

${appIdea}

---

Clarification Transcript:

${transcriptText}`;

  const response = await client.chat({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ] as ChatMessage[],
  });

  return response;
}

/**
 * Generate requirements snapshot with streaming
 */
export async function* generateSnapshotStream(
  client: OpenRouterClient,
  model: string,
  systemPrompt: string,
  appIdea: string,
  transcript: ClarificationTranscript
): AsyncGenerator<{ type: 'token' | 'complete'; content: string }, void, unknown> {
  const transcriptText = formatTranscriptForPrompt(transcript);

  const userMessage = `Original App Idea:

${appIdea}

---

Clarification Transcript:

${transcriptText}`;

  let fullResponse = '';

  for await (const chunk of client.chatStream({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ] as ChatMessage[],
  })) {
    fullResponse += chunk;
    yield { type: 'token', content: chunk };
  }

  yield { type: 'complete', content: fullResponse };
}

/**
 * Validate snapshot has required sections per FR-19
 * This is a best-effort check - the model may format things differently
 */
export function validateSnapshot(snapshot: string): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  const lowerContent = snapshot.toLowerCase();

  // Check for key sections (FR-19 requirements)
  const requiredConcepts = [
    { term: 'user', alt: ['target', 'audience'] },
    { term: 'feature', alt: ['functionality', 'capabilities'] },
    { term: 'constraint', alt: ['requirement', 'limitation'] },
  ];

  for (const concept of requiredConcepts) {
    const found =
      lowerContent.includes(concept.term) ||
      concept.alt.some((alt) => lowerContent.includes(alt));

    if (!found) {
      warnings.push(`Snapshot may be missing information about: ${concept.term}`);
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Format snapshot with metadata header
 */
export function formatSnapshotWithHeader(
  snapshot: string,
  model: string,
  appIdea: string
): string {
  const timestamp = new Date().toISOString();
  const shortIdea = appIdea.length > 100 ? appIdea.slice(0, 100) + '...' : appIdea;

  return `# Requirements Snapshot

**Generated**: ${timestamp}
**Model**: ${model}
**App Idea**: ${shortIdea}

---

${snapshot}
`;
}
