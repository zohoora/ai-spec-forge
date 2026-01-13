# AI Spec Forge – App Review Suggestions

Review scope: repository code review + `npm run lint` output (no external network calls).

## Highest Priority (Correctness + Security)

1. **Lock down filesystem access in `/api/files`**
   - Current behavior accepts arbitrary absolute paths for read/write and only blocks `..` (e.g. `GET /api/files?path=/etc/hosts` would be allowed if deployed).
   - `src/app/api/files/route.ts`:
     - Restrict all file operations to a server-controlled base directory (e.g. a configured `OUTPUT_ROOT`), or to the active session directory only.
     - Use `path.resolve(base, userPath)` and verify the resolved path starts with the base directory.
     - Consider switching the API to accept **session-relative paths** only (e.g. `requirements-snapshot.md`), and keep `sessionDir` server-side.

2. **Fix output directory expansion (`~`)**
   - `src/components/ConfigurationPanel.tsx` tries to expand `~` using `process.env.HOME` in a client component; this is `undefined` in the browser and can produce broken paths like `/Documents/...`.
   - Expand `~` server-side using `os.homedir()` (or disallow `~` and require explicit paths).

3. **Fix `useSession` closures that use stale `sessionDir`**
   - `src/hooks/useSession.ts` builds file paths with `${sessionDir}/...` in `generateSnapshot` and `generateDraft`, but `sessionDir` is missing from the `useCallback` dependency arrays (lint warns on this).
   - Result: snapshot/spec saves can target `null/...` or an old directory.

4. **Fix consultant prompt field mismatch**
   - `src/types/config.ts` defines `prompts.consultant`, but `src/hooks/useSession.ts` uses `config.prompts.consultantReview` in `runFeedbackRound`.
   - This should be a TypeScript error; change usages to `config.prompts.consultant`.

5. **Remove/rotate exposed API key**
   - `.env.local` contains an OpenRouter API key. Even if `.env*` is gitignored, treat this as compromised and rotate it.

## Streaming + Abort Reliability

1. **Make SSE parsing robust on the client**
   - `src/hooks/useSession.ts` parses streaming by splitting each decoded chunk on `\n`, which can break when JSON lines are split across chunks.
   - Reuse the buffered SSE parsing approach you already have in `src/lib/openrouter/streaming.ts` (`parseSSEStream`) or implement a shared, buffered parser.

2. **Ensure timeouts apply to the whole streaming request**
   - `src/lib/openrouter/client.ts` clears the timeout immediately after the HTTP response is received in `chatStream()`, so a stalled stream can hang indefinitely.
   - Keep the timeout active until the stream completes/cancels, and cancel the reader on abort.

3. **Make “Abort” cancel every phase**
   - `abortControllerRef` is used for clarification calls, but snapshot/draft/revision streams don’t consistently attach an abort signal.
   - Standardize: every fetch that can take time should accept a shared abort signal.

## Workflow Consistency (Spec Quality)

1. **Include the requirements snapshot as “source of truth” everywhere**
   - `src/hooks/useSession.ts` generates and saves `requirements-snapshot.md`, but:
     - Drafting doesn’t read/use the saved snapshot.
     - Consultant review doesn’t include snapshot at all.
     - Revision prompt doesn’t include snapshot either.
   - The more complete orchestrator flow already exists in `src/lib/orchestrator/*`; consider using it end-to-end (server-side or client-side) instead of duplicating prompts/formatting.

2. **Consider persisting transcript + state files via API**
   - The storage layer (`src/lib/storage/*`) supports `config.json`, `state.json`, `clarification-transcript.json`, etc., but the UI flow currently persists only a subset of artifacts.
   - Persisting state enables true resume/retry and makes debugging easier.

## Lint/Code Health Quick Wins

1. **Fix the two lint errors in `src/app/page.tsx`**
   - `react-hooks/set-state-in-effect` errors are triggered by `setApiKey(...)` and `setIsReadyForDraft(...)` inside effects.
   - Suggested approach:
     - Initialize `apiKey` via a lazy `useState(() => ...)` read from `localStorage`.
     - Derive `isReadyForDraft` from `transcript` via `useMemo` instead of storing it separately.

2. **Address obvious unused code and mismatches**
   - `src/app/api/files/route.ts`: `fileExists` import unused; `normalizedPath` computed but not used for writes.
   - `src/components/ModelSelector.tsx`: unused imports (`useEffect`, `Input`).
   - `src/hooks/useSession.ts`: unused `SessionStatus` import.
   - `src/lib/orchestrator/index.ts`: many unused imports/exports per lint (either wire it in or move behind a feature flag).

3. **Remove unused dependencies**
   - `zustand` and `uuid` are in `package.json` but not referenced in `src/` (based on `rg`).

## Missing/Incomplete Features

1. **Resume API route doesn’t exist**
   - `src/hooks/useSession.ts` calls `/api/session/${sessionId}?include=...`, but only `src/app/api/session/route.ts` exists.
   - Additionally, it uses `Buffer` in a client component (not available in the browser unless polyfilled).

2. **Retry UX is stubbed**
   - `src/app/page.tsx` renders `ErrorDisplay` but the retry logic is a placeholder.
   - If you keep per-step error metadata, implement a retry router that restarts the correct step with the correct inputs.

## Deployment/Threat Model Clarification

This app currently behaves like a “local desktop-like” tool (server writes to user-selected filesystem paths). If you plan to deploy it as a hosted web app:
- Browsers cannot safely write to arbitrary user paths; you’ll need a different persistence strategy (downloads, cloud storage, or per-user server storage).
- The current `/api/files` design is not safe in a multi-user or internet-exposed environment and should be redesigned before deployment.

