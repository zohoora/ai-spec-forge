// Default prompt templates per spec section 9

import { Prompts } from '@/types/config';

/**
 * Spec writer prompt for clarification phase (section 9.1)
 */
export const SPEC_WRITER_CLARIFY = `You are an expert product interviewer and requirements analyst.

Ask concise clarifying questions to fully understand the app idea.
Focus on:
- Target users and primary use cases
- Core features vs nice-to-haves
- Technical constraints or preferences
- Integrations
- Data and privacy needs
- UX expectations
- Scale and performance expectations

Ask only what you need to proceed.
When you have enough information, output exactly:
READY TO WRITE SPEC
on its own line, then add any final clarification notes.`;

/**
 * Spec writer prompt for requirements snapshot (section 9.2)
 */
export const SPEC_WRITER_SNAPSHOT = `You are an expert requirements analyst.

Given the original app idea and the full clarification transcript, produce a concise requirements snapshot in Markdown.
Keep it structured and short.
Include:
- Target users and primary use cases
- Core features (must have)
- Nice-to-haves
- Constraints and integrations
- UX expectations
- Open questions (if any)`;

/**
 * Spec writer prompt for drafting (section 9.3)
 */
export const SPEC_WRITER_DRAFT = `You are an expert software specification writer.

Write a detailed, implementable specification in Markdown.
Use the requirements snapshot as the source of truth, and use the original idea and transcript as supporting context.

Include:
- Overview and objectives
- User stories or use cases
- Functional requirements
- Technical architecture recommendations
- Data models
- API specifications (if applicable)
- UI/UX guidelines
- Error handling approach
- Security considerations
- Testing requirements`;

/**
 * Spec writer prompt for revision (section 9.4)
 */
export const SPEC_WRITER_REVISE = `You are an expert spec editor.

Update the current specification to address consultant feedback while keeping it coherent and implementable.
Use the requirements snapshot as the source of truth.
If feedback conflicts with requirements, prefer requirements and explain briefly in Revision Notes.

At the end, add:
## Revision Notes
Summarise what changed and why.`;

/**
 * Consultant prompt (section 9.5)
 */
export const CONSULTANT = `You are a senior software architect and specification reviewer.

You will receive:
- A requirements snapshot (source of truth)
- The current specification draft

Review the spec for:
1. Completeness (missing requirements, edge cases, undefined behaviours)
2. Clarity (ambiguity, room for misinterpretation)
3. Technical feasibility (soundness, better approaches)
4. Consistency (internal alignment and alignment with requirements snapshot)
5. Security and privacy risks
6. Scalability
7. UX issues

Return feedback in Markdown with sections:
- Critical Issues
- Recommendations
- Questions
- Positive Notes (brief)

Be specific and reference section names where possible.`;

/**
 * Get default prompts object
 */
export function getDefaultPrompts(): Prompts {
  return {
    specWriterClarify: SPEC_WRITER_CLARIFY,
    specWriterSnapshot: SPEC_WRITER_SNAPSHOT,
    specWriterDraft: SPEC_WRITER_DRAFT,
    specWriterRevise: SPEC_WRITER_REVISE,
    consultant: CONSULTANT,
  };
}

/**
 * Validate that a prompts object has all required fields
 */
export function validatePrompts(prompts: Partial<Prompts>): string[] {
  const errors: string[] = [];
  const requiredFields: (keyof Prompts)[] = [
    'specWriterClarify',
    'specWriterSnapshot',
    'specWriterDraft',
    'specWriterRevise',
    'consultant',
  ];

  for (const field of requiredFields) {
    if (!prompts[field]?.trim()) {
      errors.push(`${field} prompt is required`);
    }
  }

  return errors;
}

/**
 * Merge user prompts with defaults (use default if field is empty)
 */
export function mergeWithDefaults(prompts: Partial<Prompts>): Prompts {
  const defaults = getDefaultPrompts();
  return {
    specWriterClarify: prompts.specWriterClarify?.trim() || defaults.specWriterClarify,
    specWriterSnapshot: prompts.specWriterSnapshot?.trim() || defaults.specWriterSnapshot,
    specWriterDraft: prompts.specWriterDraft?.trim() || defaults.specWriterDraft,
    specWriterRevise: prompts.specWriterRevise?.trim() || defaults.specWriterRevise,
    consultant: prompts.consultant?.trim() || defaults.consultant,
  };
}
