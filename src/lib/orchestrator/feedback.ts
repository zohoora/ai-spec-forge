// Consultant feedback logic per spec section 3.6, FR-23 to FR-27

import { OpenRouterClient } from '@/lib/openrouter/client';
import { ChatMessage } from '@/lib/openrouter/types';
import { runParallelWithErrors } from '@/lib/utils/concurrency';
import { withRetry } from '@/lib/utils/retry';

export interface ConsultantFeedback {
  modelId: string;
  content: string;
  duration: number;
  status: 'success' | 'error';
  error?: string;
}

export interface FeedbackRoundResult {
  round: number;
  feedbacks: ConsultantFeedback[];
  hasErrors: boolean;
  aggregatedFeedback: string;
}

/**
 * Get feedback from a single consultant
 */
export async function getConsultantFeedback(
  client: OpenRouterClient,
  model: string,
  systemPrompt: string,
  requirementsSnapshot: string,
  currentSpec: string
): Promise<string> {
  const userMessage = `Requirements Snapshot (Source of Truth):

${requirementsSnapshot}

---

Current Specification:

${currentSpec}`;

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
 * Get feedback from a single consultant with streaming
 */
export async function* getConsultantFeedbackStream(
  client: OpenRouterClient,
  model: string,
  systemPrompt: string,
  requirementsSnapshot: string,
  currentSpec: string
): AsyncGenerator<{ type: 'token' | 'complete'; content: string }, void, unknown> {
  const userMessage = `Requirements Snapshot (Source of Truth):

${requirementsSnapshot}

---

Current Specification:

${currentSpec}`;

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
 * Run feedback round with all consultants in parallel
 * Per spec FR-23: concurrent with configurable limit (default 5)
 * Per spec FR-26: one failure = round failure
 */
export async function runFeedbackRound(
  client: OpenRouterClient,
  consultantModels: string[],
  systemPrompt: string,
  requirementsSnapshot: string,
  currentSpec: string,
  round: number,
  options?: {
    concurrencyLimit?: number;
    onConsultantStart?: (model: string) => void;
    onConsultantComplete?: (model: string, feedback: ConsultantFeedback) => void;
  }
): Promise<FeedbackRoundResult> {
  const concurrencyLimit = options?.concurrencyLimit || 5;

  const results = await runParallelWithErrors(
    consultantModels,
    concurrencyLimit,
    async (model) => {
      options?.onConsultantStart?.(model);
      const startTime = Date.now();

      try {
        // Use retry for transient errors
        const content = await withRetry(
          () => getConsultantFeedback(
            client,
            model,
            systemPrompt,
            requirementsSnapshot,
            currentSpec
          ),
          {
            maxRetries: 3,
            maxDuration: 5 * 60 * 1000, // 5 minutes
          }
        );

        const duration = Date.now() - startTime;
        const feedback: ConsultantFeedback = {
          modelId: model,
          content,
          duration,
          status: 'success',
        };

        options?.onConsultantComplete?.(model, feedback);
        return feedback;
      } catch (error) {
        const duration = Date.now() - startTime;
        const feedback: ConsultantFeedback = {
          modelId: model,
          content: '',
          duration,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        };

        options?.onConsultantComplete?.(model, feedback);
        throw error; // Re-throw so it's captured as failure
      }
    }
  );

  // Convert results to feedback array
  const feedbacks: ConsultantFeedback[] = results.map((result, index) => {
    if (result.success) {
      return result.result;
    } else {
      return {
        modelId: consultantModels[index],
        content: '',
        duration: 0,
        status: 'error' as const,
        error: result.error.message,
      };
    }
  });

  const hasErrors = feedbacks.some((f) => f.status === 'error');

  // Aggregate feedback from successful consultants
  const aggregatedFeedback = aggregateFeedback(feedbacks, round);

  return {
    round,
    feedbacks,
    hasErrors,
    aggregatedFeedback,
  };
}

/**
 * Aggregate feedback from multiple consultants into a single document
 */
export function aggregateFeedback(
  feedbacks: ConsultantFeedback[],
  round: number
): string {
  const successfulFeedbacks = feedbacks.filter((f) => f.status === 'success');

  if (successfulFeedbacks.length === 0) {
    return 'No feedback available - all consultants failed.';
  }

  let aggregated = `# Aggregated Feedback from Round ${round}\n\n`;
  aggregated += `Total consultants: ${feedbacks.length}\n`;
  aggregated += `Successful responses: ${successfulFeedbacks.length}\n\n`;
  aggregated += '---\n\n';

  for (const feedback of successfulFeedbacks) {
    const durationSec = (feedback.duration / 1000).toFixed(1);
    aggregated += `## Feedback from ${feedback.modelId}\n`;
    aggregated += `*Response time: ${durationSec}s*\n\n`;
    aggregated += feedback.content;
    aggregated += '\n\n---\n\n';
  }

  // Note any failures
  const failedFeedbacks = feedbacks.filter((f) => f.status === 'error');
  if (failedFeedbacks.length > 0) {
    aggregated += '## Failed Consultants\n\n';
    for (const feedback of failedFeedbacks) {
      aggregated += `- **${feedback.modelId}**: ${feedback.error}\n`;
    }
    aggregated += '\n';
  }

  return aggregated;
}

/**
 * Format feedback bundle for saving per spec 10.3
 */
export function formatFeedbackBundle(
  feedbacks: ConsultantFeedback[],
  round: number,
  inputSpecVersion: number
): string {
  const timestamp = new Date().toISOString();

  let bundle = `# Feedback Round ${round}

**Timestamp**: ${timestamp}
**Spec Version Reviewed**: v${inputSpecVersion}

---

`;

  for (const feedback of feedbacks) {
    const durationMin = Math.floor(feedback.duration / 60000);
    const durationSec = Math.floor((feedback.duration % 60000) / 1000);
    const durationStr = durationMin > 0
      ? `${durationMin} minute${durationMin !== 1 ? 's' : ''} ${durationSec} second${durationSec !== 1 ? 's' : ''}`
      : `${durationSec} second${durationSec !== 1 ? 's' : ''}`;

    bundle += `## Feedback from ${feedback.modelId}

**Status**: ${feedback.status}
**Duration**: ${durationStr}

`;

    if (feedback.status === 'success') {
      bundle += feedback.content;
    } else {
      bundle += `*Error: ${feedback.error}*`;
    }

    bundle += '\n\n---\n\n';
  }

  return bundle;
}

/**
 * Get pending consultants for resume (consultants that haven't completed)
 */
export function getPendingConsultants(
  allModels: string[],
  completedModels: string[]
): string[] {
  return allModels.filter((model) => !completedModels.includes(model));
}
