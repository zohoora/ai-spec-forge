// Spec drafting logic per spec section 3.5, FR-20, FR-21

import { OpenRouterClient } from '@/lib/openrouter/client';
import { ChatMessage } from '@/lib/openrouter/types';
import { formatTranscriptForPrompt } from './clarification';
import { ClarificationTranscript } from '@/types/session';

/**
 * Generate initial spec draft (spec-v1)
 * Per spec FR-20: produces Markdown output
 * Context includes: requirements snapshot, original idea, full transcript
 */
export async function generateDraft(
  client: OpenRouterClient,
  model: string,
  systemPrompt: string,
  requirementsSnapshot: string,
  appIdea: string,
  transcript: ClarificationTranscript
): Promise<string> {
  const transcriptText = formatTranscriptForPrompt(transcript);

  const userMessage = `Requirements Snapshot:

${requirementsSnapshot}

---

Original App Idea:

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
 * Generate draft with streaming
 */
export async function* generateDraftStream(
  client: OpenRouterClient,
  model: string,
  systemPrompt: string,
  requirementsSnapshot: string,
  appIdea: string,
  transcript: ClarificationTranscript
): AsyncGenerator<{ type: 'token' | 'complete'; content: string }, void, unknown> {
  const transcriptText = formatTranscriptForPrompt(transcript);

  const userMessage = `Requirements Snapshot:

${requirementsSnapshot}

---

Original App Idea:

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
 * Format spec with metadata header per spec 10.2
 */
export function formatSpecWithHeader(
  spec: string,
  version: number,
  model: string,
  appName: string,
  revisionNotes?: string
): string {
  const timestamp = new Date().toISOString();

  let content = `# ${appName}, Specification v${version}

**Generated**: ${timestamp}
**Spec Writer Model**: ${model}
**Spec Version**: v${version}

---

${spec}`;

  if (revisionNotes) {
    content += `

---

## Revision Notes

${revisionNotes}
`;
  }

  return content;
}

/**
 * Extract app name from idea for spec header
 */
export function extractAppNameForSpec(appIdea: string): string {
  // Get first line or first 50 characters
  const firstLine = appIdea.split('\n')[0].trim();

  if (firstLine.length <= 50) {
    return firstLine;
  }

  // Find a good break point
  const truncated = firstLine.slice(0, 50);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > 30) {
    return truncated.slice(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Validate spec has expected sections
 */
export function validateSpec(spec: string): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  const lowerContent = spec.toLowerCase();

  // Check for common spec sections from prompt 9.3
  const expectedSections = [
    'overview',
    'user stor',
    'functional requirement',
    'architecture',
    'data model',
    'error handling',
    'security',
  ];

  for (const section of expectedSections) {
    if (!lowerContent.includes(section)) {
      warnings.push(`Spec may be missing section: ${section}`);
    }
  }

  return {
    valid: warnings.length < 3, // Allow some missing sections
    warnings,
  };
}
