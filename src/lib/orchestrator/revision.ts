// Spec revision logic per spec section 3.6, FR-22, FR-28, FR-29

import { OpenRouterClient } from '@/lib/openrouter/client';
import { ChatMessage } from '@/lib/openrouter/types';

/**
 * Generate revised spec based on consultant feedback
 * Per spec FR-29: context includes only requirements snapshot, current spec, and current round feedback
 * Does NOT include prior feedback rounds
 */
export async function generateRevision(
  client: OpenRouterClient,
  model: string,
  systemPrompt: string,
  requirementsSnapshot: string,
  currentSpec: string,
  aggregatedFeedback: string
): Promise<string> {
  const userMessage = `Requirements Snapshot:

${requirementsSnapshot}

---

Current Specification:

${currentSpec}

---

Consultant Feedback:

${aggregatedFeedback}`;

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
 * Generate revision with streaming
 */
export async function* generateRevisionStream(
  client: OpenRouterClient,
  model: string,
  systemPrompt: string,
  requirementsSnapshot: string,
  currentSpec: string,
  aggregatedFeedback: string
): AsyncGenerator<{ type: 'token' | 'complete'; content: string }, void, unknown> {
  const userMessage = `Requirements Snapshot:

${requirementsSnapshot}

---

Current Specification:

${currentSpec}

---

Consultant Feedback:

${aggregatedFeedback}`;

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
 * Extract revision notes from the spec
 * Per spec FR-22: each revised spec includes a Revision Notes section
 */
export function extractRevisionNotes(spec: string): string | null {
  // Look for ## Revision Notes section
  const patterns = [
    /##\s*revision\s*notes?\s*\n([\s\S]*?)(?=\n##|$)/i,
    /\*\*revision\s*notes?\*\*:?\s*\n([\s\S]*?)(?=\n##|$)/i,
  ];

  for (const pattern of patterns) {
    const match = spec.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Strip the spec content (remove header if present)
 * Used when loading spec for context to avoid duplicate headers
 */
export function stripSpecHeader(spec: string): string {
  // Look for the --- after the metadata header
  const headerEndPattern = /^#[^\n]+\n\n\*\*Generated\*\*:[^\n]+\n\*\*Spec Writer Model\*\*:[^\n]+\n\*\*Spec Version\*\*:[^\n]+\n\n---\n\n/;

  const match = spec.match(headerEndPattern);
  if (match) {
    return spec.slice(match[0].length);
  }

  return spec;
}

/**
 * Format revised spec with updated header
 * Per spec 10.2: includes metadata header and revision notes
 */
export function formatRevisedSpec(
  spec: string,
  version: number,
  model: string,
  appName: string
): string {
  const timestamp = new Date().toISOString();

  // Check if spec already has revision notes
  const hasRevisionNotes = /##\s*revision\s*notes?/i.test(spec);

  let content = `# ${appName}, Specification v${version}

**Generated**: ${timestamp}
**Spec Writer Model**: ${model}
**Spec Version**: v${version}

---

${spec}`;

  // Add placeholder revision notes section if missing
  if (!hasRevisionNotes) {
    content += `

---

## Revision Notes

*Revision notes were not generated for this version.*
`;
  }

  return content;
}

/**
 * Validate that revision addresses feedback
 * This is a best-effort check
 */
export function validateRevision(
  originalSpec: string,
  revisedSpec: string,
  feedback: string
): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check that the spec actually changed
  if (originalSpec.trim() === revisedSpec.trim()) {
    warnings.push('Revised spec appears identical to original');
  }

  // Check for revision notes section
  if (!extractRevisionNotes(revisedSpec)) {
    warnings.push('Revised spec missing Revision Notes section');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Compare two specs and return diff summary
 */
export function getSpecDiffSummary(
  oldSpec: string,
  newSpec: string
): {
  linesAdded: number;
  linesRemoved: number;
  linesUnchanged: number;
} {
  const oldLines = oldSpec.split('\n');
  const newLines = newSpec.split('\n');
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let linesAdded = 0;
  let linesRemoved = 0;
  let linesUnchanged = 0;

  for (const line of newLines) {
    if (oldSet.has(line)) {
      linesUnchanged++;
    } else {
      linesAdded++;
    }
  }

  for (const line of oldLines) {
    if (!newSet.has(line)) {
      linesRemoved++;
    }
  }

  return { linesAdded, linesRemoved, linesUnchanged };
}
