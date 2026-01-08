# AI Spec Forge
## Specification v3

**Status**: Draft  
**Last updated**: 2026-01-08  

AI Spec Forge is a tool for iteratively developing application specifications using multiple AI models in a structured feedback loop.

---

## 1. Goals and non-goals

### 1.1 Goals
- Turn a rough, free-text app idea into an implementable software specification.
- Use a repeatable loop: clarify, draft, review, revise.
- Make every step auditable, save all artefacts locally.
- Support multiple AI models, with one designated as the spec writer and 1 to 5 as independent consultants.
- Be resilient to slow models and rate limits, and be recoverable after interruption.

### 1.2 Non-goals
- Generating production code.
- Token, budget, or cost tracking.
- In-app viewing, comparing, or diffing spec versions (users can use external diff tools).
- Replacing human product, security, or legal review.

---

## 2. Key concepts

- **Spec writer model**: The primary model that asks clarification questions, writes the spec, and revises it after feedback.
- **Consultant model**: A model that reviews the current spec and provides independent feedback.
- **Clarification phase**: Interactive Q&A between the spec writer and the user, until the tool decides it has enough information to draft.
- **Requirements snapshot**: A compact, persistent summary of the app idea and clarification outcomes, generated once after clarification, then reused to keep all later steps aligned with user intent without re-sending the full transcript.
- **Feedback round**: One cycle where consultants review the current spec, feedback is aggregated, and the spec writer produces a revised spec.
- **Spec version**: A saved Markdown file `spec-v{N}.md`.
  - `spec-v1.md` is the first full draft produced after clarification.
  - `spec-v{r+1}.md` is produced after feedback round `r`.
  - If the user configures `R` feedback rounds, the final version is `spec-v{R+1}.md`.

---

## 3. End-to-end workflow

1. **Initialization**
   - User enters a free-text app idea.
   - User selects:
     - spec writer model
     - 1 to 5 consultant models
     - number of feedback rounds (1 to 10)
   - User selects an output directory.
   - User may edit default system prompts (spec writer prompts and consultant prompt).

2. **Preflight model reachability**
   - Before starting clarification, the app performs a lightweight test request against:
     - the selected spec writer model
     - each selected consultant model
   - If any selected model cannot be reached after retries, the app must alert the user and abort the run (no partial run).

3. **Clarification phase**
   - The app sends the app idea to the spec writer using the clarification prompt.
   - The spec writer asks clarifying questions.
   - The user answers.
   - Repeat until the spec writer signals it is ready to draft (see FR-15).

4. **Requirements snapshot**
   - The app asks the spec writer to produce a short requirements snapshot based on:
     - original app idea
     - full clarification transcript
   - The app saves `requirements-snapshot.md`.
   - After this point, the full clarification transcript is kept for audit, but is not included in later model contexts.

5. **Drafting (spec-v1)**
   - The app sends the spec writer:
     - requirements snapshot
     - original app idea
     - full clarification transcript
   - The spec writer returns a Markdown specification.
   - The app saves `spec-v1.md`.

6. **Feedback rounds (1 to R)**
   - For each feedback round `r`:
     - Send consultants (in parallel):
       - requirements snapshot
       - current spec (`spec-v{r}.md`)
     - Collect consultant feedback.
     - Aggregate feedback into a single Markdown bundle.
     - Send the spec writer:
       - requirements snapshot
       - current spec
       - aggregated feedback for round `r` only
     - Save revised spec as `spec-v{r+1}.md`.
     - Save the feedback bundle as `feedback/round-{r}.md`.
     - Append events to `session-log.md`.

7. **Output**
   - Copy the last spec version to `spec-final.md`.

---

## 4. Functional requirements

### 4.1 Session configuration
- FR-1: The user can input an app idea (multi-line text).
- FR-2: The user can select one spec writer model.
- FR-3: The user can select 1 to 5 consultant models.
- FR-4: The user can set the number of feedback rounds (1 to 10).
- FR-5: The user can select an output directory.
- FR-6: The user can edit and restore default prompts for:
  - spec writer, clarification
  - spec writer, drafting
  - spec writer, revision
  - consultants
- FR-7: The app validates configuration before start:
  - at least 1 consultant
  - rounds within bounds
  - output directory writable
  - models are non-empty identifiers

### 4.2 Model discovery and selection
- FR-8: The app should attempt to fetch available models from OpenRouter at startup and cache the list for the session.
- FR-9: The app must allow manual entry of a custom model ID (for cases where discovery is incomplete).
- FR-10: If model discovery fails, the UI must clearly indicate discovery is unavailable and manual entry is required.
- FR-11: The UI must show the exact model ID that will be used in API calls.

### 4.3 Model reachability rules
- FR-12: The app must run a preflight reachability check for each selected model before starting clarification.
- FR-13: If any selected model cannot be reached after the configured retries, the app must:
  - show an error that names the model
  - write the failure to `session-log.md`
  - abort the run (no skip option)

### 4.4 Clarification phase
- FR-14: The app maintains a clarification transcript as a list of timestamped messages.
- FR-15: The app detects readiness to draft when the spec writer outputs a line that matches `READY TO WRITE SPEC`, using a tolerant match:
  - case-insensitive
  - ignores surrounding whitespace
  - ignores simple Markdown emphasis (for example `**READY TO WRITE SPEC**`)
- FR-16: The user can force progression to drafting even if the readiness signal has not been produced.
  - In this case, the full clarification transcript collected so far must still be included in the drafting context.
- FR-17: The user can abort the session at any time.

### 4.5 Requirements snapshot
- FR-18: After clarification completes, the app must create and save `requirements-snapshot.md`.
- FR-19: The requirements snapshot must be concise and structured, and must include at minimum:
  - target users and primary use cases
  - core features, explicitly separated from nice-to-haves
  - key constraints (tech, integrations, platforms)
  - key UX expectations
  - open questions or unresolved ambiguities (if any)

### 4.6 Spec drafting and revision
- FR-20: The spec writer produces Markdown output.
- FR-21: Each spec version file includes a metadata header (generated timestamp, model ID, version number).
- FR-22: Each revised spec includes a `Revision Notes` section summarising changes made in that version.

### 4.7 Consultant feedback
- FR-23: Consultant requests run concurrently, with a configurable concurrency limit (default: 5).
- FR-24: All consultant models must use the same consultant prompt by default.
- FR-25: Consultant context must include:
  - requirements snapshot
  - current spec
- FR-26: One consultant failure is a failure of the round (no skipping).
- FR-27: Each consultant response is saved verbatim (plus metadata like duration and status).

### 4.8 Context management
- FR-28: After `requirements-snapshot.md` exists, the app must not include the full clarification transcript in consultant calls.
- FR-29: For spec writer revision calls (after `spec-v1.md`), the app must only include:
  - requirements snapshot
  - current spec
  - aggregated feedback for the current round
  - It must not append prior feedback rounds.

### 4.9 Persistence and resumability
- FR-30: On each major step (clarification message, snapshot saved, spec saved, consultant response saved), flush to disk.
- FR-31: The app must maintain a `state.json` file describing:
  - current state (clarifying, drafting, reviewing_round_r, revising_round_r, completed, error)
  - current round number
  - per-model call completion flags for the active round
  - paths to the latest committed artefacts
- FR-32: The app must persist the exact chat message history required to resume the clarification phase without losing context (for example, by saving the raw messages array that was sent to the API).
- FR-33: The app must decide whether to resume or start fresh using on-disk session state:
  - If the user selects an existing session directory that contains `state.json` with a non-completed status, the app resumes that session.
  - Otherwise, the app starts a new session in a new timestamped directory.
- FR-34: If the process is interrupted mid-feedback round, resuming must run only the missing consultant calls for that round, then continue.
- FR-35: If the process is interrupted mid-stream for any model call, the app must discard any partial response and re-run that call on resume.

### 4.10 Streaming and atomic writes
- FR-36: Where streaming is supported, the UI should render partial tokens in real time.
- FR-37: The app must only commit model outputs when a response is complete.
  - Implementation detail: write to `*.partial` files and rename to the final filename on completion (atomic rename).
  - On startup or resume, any `*.partial` files are treated as incomplete and must be deleted or ignored.

---

## 5. User interface requirements

The product may be implemented as a web app, desktop app, or CLI with a rich TUI (text UI). The UI must provide the following capabilities.

### 5.1 Configuration view
- Inputs for:
  - app idea
  - spec writer model
  - consultant models
  - rounds
  - output directory
- Ability to edit prompts in an expandable section.
- “Start” action to begin the run.
- If the user selects an existing session directory containing `state.json` with a non-completed status, the UI must offer “Resume” in addition to “Start new”.
- Clear indication when model discovery is unavailable.

### 5.2 Activity stream
- A real-time, append-only stream of events with timestamps.
- Clear visual distinction between:
  - user inputs
  - spec writer outputs
  - consultant outputs
  - system messages
  - errors
- Long outputs should be collapsible.
- Auto-scroll enabled by default, with a pause option.

### 5.3 Clarification interaction
- The UI must clearly indicate when the tool is in the clarification phase.
- The current question must be prominent.
- Provide a response input and submit action.

### 5.4 Error interaction
When an error occurs, the UI must:
- Display the error details and which step failed.
- Offer context-appropriate actions:
  - Retry the failed call
  - Abort the run
- Preserve partial results already committed to disk.

---

## 6. Technical architecture

### 6.1 Components
- **UI layer**: web, desktop, or CLI/TUI.
- **Orchestrator**: state machine that drives the workflow and persists artefacts.
- **LLM provider client**: OpenRouter API client, supports streaming and non-streaming.
- **Storage layer**: writes Markdown and JSON, with safe, ordered writes.

### 6.2 Orchestrator state machine (conceptual)
States:
- `idle`
- `preflight`
- `clarifying`
- `snapshotting`
- `drafting`
- `reviewing_round_r`
- `revising_round_r`
- `completed`
- `error`

Rules:
- Any state can transition to `error` on failure.
- `error` offers retry or abort.
- `abort` ends the run and still writes whatever artefacts have already been committed.

### 6.3 Parallelism, file safety, and rate limits
- Consultant calls run concurrently, subject to a concurrency limiter.
- The storage layer must prevent concurrent writes corrupting files:
  - use a single-writer queue, or file locking, for `session-log.md` and `state.json`
- On HTTP 429 (rate limit), use exponential backoff with jitter, bounded by a maximum retry window (default: 5 minutes per call) before surfacing to the user.

### 6.4 Timeouts
- Default HTTP request timeout: 90 minutes.
- Display elapsed time during requests.
- The user can abort at any time.

---

## 7. OpenRouter integration

### 7.1 Base URL
All model access is via OpenRouter API: `https://openrouter.ai/api/v1`.

### 7.2 Authentication
- User provides an OpenRouter API key.
- The API key is stored locally and must never be written into logs.

### 7.3 Request shape (chat style)
The implementation should use chat-style requests, with:
- `model`: selected model ID
- `messages`: array of `{ role, content }`
- `stream`: true or false
- other parameters as needed (temperature, max_tokens)

### 7.4 Identification headers (recommended)
If supported by OpenRouter, set appropriate identification headers (for example, app name and URL). These values should be configurable, and safe defaults should be provided.

---

## 8. Data models

### 8.1 Session configuration (config.json)
```json
{
  "appIdea": "string",
  "specWriterModel": "string",
  "consultantModels": ["string"],
  "numberOfRounds": 3,
  "prompts": {
    "specWriterClarify": "string",
    "specWriterDraft": "string",
    "specWriterRevise": "string",
    "consultant": "string"
  },
  "outputDirectory": "string",
  "createdAt": "ISO8601"
}
```

### 8.2 State (state.json)
```json
{
  "status": "idle | preflight | clarifying | snapshotting | drafting | reviewing | revising | completed | error",
  "currentRound": 0,
  "latestSpecVersion": 0,
  "requirementsSnapshotPath": "string | null",
  "clarificationTranscriptPath": "string | null",
  "rounds": {
    "1": {
      "consultants": {
        "model-id-1": { "status": "pending | complete | error", "path": "string | null" },
        "model-id-2": { "status": "pending | complete | error", "path": "string | null" }
      },
      "feedbackBundlePath": "string | null",
      "revisedSpecPath": "string | null"
    }
  }
}
```

### 8.3 Clarification transcript (clarification-transcript.json)
```json
{
  "displayMessages": [
    { "role": "user", "content": "string", "timestamp": "ISO8601" },
    { "role": "assistant", "content": "string", "timestamp": "ISO8601" }
  ],
  "apiMessages": [
    { "role": "system", "content": "string" },
    { "role": "user", "content": "string" },
    { "role": "assistant", "content": "string" }
  ]
}
```


---

## 9. Prompt templates

Prompts are editable, but defaults must ship with the app.

### 9.1 Spec writer prompt, clarification (default)
```
You are an expert product interviewer and requirements analyst.

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
on its own line, then add any final clarification notes.
```

### 9.2 Spec writer prompt, requirements snapshot (default)
```
You are an expert requirements analyst.

Given the original app idea and the full clarification transcript, produce a concise requirements snapshot in Markdown.
Keep it structured and short.
Include:
- Target users and primary use cases
- Core features (must have)
- Nice-to-haves
- Constraints and integrations
- UX expectations
- Open questions (if any)
```

### 9.3 Spec writer prompt, drafting (default)
```
You are an expert software specification writer.

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
- Testing requirements
```

### 9.4 Spec writer prompt, revision (default)
```
You are an expert spec editor.

Update the current specification to address consultant feedback while keeping it coherent and implementable.
Use the requirements snapshot as the source of truth.
If feedback conflicts with requirements, prefer requirements and explain briefly in Revision Notes.

At the end, add:
## Revision Notes
Summarise what changed and why.
```

### 9.5 Consultant prompt (default)
```
You are a senior software architect and specification reviewer.

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

Be specific and reference section names where possible.
```

---

## 10. File output structure

All outputs are saved to the selected output directory:

```
{output_directory}/
  {timestamp}-{sanitized-app-name}/
    config.json
    state.json
    clarification-transcript.json
    requirements-snapshot.md
    spec-v1.md
    spec-v2.md
    ...
    spec-final.md
    feedback/
      round-1.md
      round-2.md
      ...
    session-log.md
```

### 10.1 Sanitised naming rules
**Sanitised app name**
- Lowercase
- Replace spaces with hyphens
- Remove characters outside `a-z`, `0-9`, hyphen
- Collapse repeated hyphens
- Trim to 64 characters
- If the result is empty, use `untitled`

**Timestamp**
- Use a Windows-safe format, for example `YYYY-MM-DD-HHmmss` (no colons).

### 10.2 Version file format (spec-vN.md)
```markdown
# {App Name}, Specification v{N}

**Generated**: {timestamp}
**Spec Writer Model**: {model}
**Spec Version**: v{N}

---

{specification content}

---

## Revision Notes

{notes about changes made in this version, if applicable}
```

### 10.3 Feedback file format (feedback/round-N.md)
```markdown
# Feedback Round {N}

**Timestamp**: {timestamp}
**Spec Version Reviewed**: v{inputSpecVersion}

---

## Feedback from {Model Name}

**Status**: {success | error}
**Duration**: {X minutes Y seconds}

{feedback content or error details}
```

### 10.4 Session log format (session-log.md)
The session log is a chronological append-only log. It must include:
- configuration summary
- original app idea
- key workflow events with timestamps, duration, status
- errors encountered and how they were handled
- paths to output artefacts

---

## 11. Error handling

### 11.1 Error types
- Invalid API key
- Model unavailable or access denied
- Rate limit (HTTP 429)
- Timeout (request exceeds configured HTTP timeout)
- Network errors
- Malformed or empty responses
- File system errors (cannot write output)

### 11.2 Required behaviours
- Transient failures may be retried automatically (rate limit and network).
- If a selected model cannot be reached after retries, the run must abort (no skipping models).
- Errors must be written to `session-log.md` with:
  - timestamp
  - step
  - model (if any)
  - error code and message
  - user action taken (retry or abort)

---

## 12. Security and privacy
- The API key must not be logged.
- Outputs may contain sensitive user-provided information, store everything locally in the chosen directory.
- Optional “redact before saving” mode:
  - Always removes the API key if it appears in any text
  - Optionally masks email addresses and obvious secrets in user text (best-effort)
  - Must display a warning that redaction is not guaranteed and should not be relied on for compliance.

---

## 13. Acceptance criteria

The application is complete when:

1. A user can configure models and rounds, start a session, and select an output directory.
2. The app performs a preflight reachability check and aborts on unreachable selected models.
3. The spec writer runs an interactive clarification phase and persists the transcript.
4. The app produces `requirements-snapshot.md`.
5. The tool produces `spec-v1.md` after clarification.
6. The tool runs `R` feedback rounds with consultant calls in parallel.
7. The tool produces the final revised spec and writes `spec-final.md`.
8. All intermediate artefacts (spec versions, feedback logs, session log, config, transcript, state) are saved to disk.
9. If interrupted mid-round, resuming runs only missing consultant calls for that round.
10. If interrupted mid-stream, partial responses are discarded and re-run.

---

## 14. Out of scope (explicit)
- Token usage, budget, or cost tracking.
- Side-by-side version comparison or diff UI.
- Team collaboration and multi-user concurrency.
- Deep analytics dashboards beyond the local artefacts.
- Automatic export to proprietary document formats (Notion, Confluence).

---

## Revision notes (v3)
Changes from v2:
- Removed token and cost tracking requirements and removed `run-summary.json`.
- Clarified that version diffing and comparison UI is out of scope.
- Added strict model reachability rules: if a selected model cannot be reached, abort (no skipping).
- Added requirements snapshot to reduce context bloat and keep consultants aligned with user intent.
- Defined resumability semantics for mid-round interruption and mid-stream interruption.
- Added `state.json`, atomic writes for streamed output, and Windows-safe filename rules.
