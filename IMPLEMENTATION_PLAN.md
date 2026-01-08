# AI Spec Forge - Implementation Plan

## Technology Stack Decision

Based on the spec requirements (web/desktop/CLI with rich UI, streaming support, local file storage), I recommend:

**Next.js 14 (App Router) + TypeScript + Tailwind CSS**

Rationale:
- App Router provides excellent streaming support via Server-Sent Events
- API routes handle OpenRouter integration server-side (keeps API key secure)
- TypeScript ensures type safety across the codebase
- Tailwind enables rapid UI development
- Can run locally (`npm run dev`) or be built as a static export
- File system access via API routes for local storage

---

## Project Structure

```
/Users/arash/Developer/specMaker/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
├── .env.local                    # API key storage (gitignored)
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Main app page
│   │   ├── globals.css           # Global styles
│   │   └── api/
│   │       ├── models/
│   │       │   └── route.ts      # GET: fetch models from OpenRouter
│   │       ├── preflight/
│   │       │   └── route.ts      # POST: test model reachability
│   │       ├── chat/
│   │       │   └── route.ts      # POST: streaming chat endpoint
│   │       ├── session/
│   │       │   ├── route.ts      # POST: create session, GET: list sessions
│   │       │   └── [id]/
│   │       │       └── route.ts  # GET: session state, PATCH: update
│   │       └── files/
│   │           └── route.ts      # File operations (read/write)
│   ├── components/
│   │   ├── ConfigurationPanel.tsx
│   │   ├── ModelSelector.tsx
│   │   ├── PromptEditor.tsx
│   │   ├── ActivityStream.tsx
│   │   ├── ClarificationChat.tsx
│   │   ├── ProgressIndicator.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── ui/                   # Reusable UI components
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Textarea.tsx
│   │       ├── Select.tsx
│   │       ├── Card.tsx
│   │       ├── Collapsible.tsx
│   │       └── Badge.tsx
│   ├── lib/
│   │   ├── openrouter/
│   │   │   ├── client.ts         # OpenRouter API client
│   │   │   ├── types.ts          # API types
│   │   │   └── streaming.ts      # Streaming utilities
│   │   ├── orchestrator/
│   │   │   ├── index.ts          # Main orchestrator
│   │   │   ├── state-machine.ts  # State machine implementation
│   │   │   ├── clarification.ts  # Clarification phase logic
│   │   │   ├── snapshot.ts       # Requirements snapshot logic
│   │   │   ├── drafting.ts       # Spec drafting logic
│   │   │   ├── feedback.ts       # Feedback round logic
│   │   │   └── revision.ts       # Revision logic
│   │   ├── storage/
│   │   │   ├── index.ts          # Storage layer
│   │   │   ├── session.ts        # Session management
│   │   │   ├── atomic-write.ts   # Atomic file writes
│   │   │   └── sanitize.ts       # Filename sanitization
│   │   ├── prompts/
│   │   │   └── defaults.ts       # Default prompt templates
│   │   └── utils/
│   │       ├── retry.ts          # Retry with backoff
│   │       ├── concurrency.ts    # Concurrency limiter
│   │       └── format.ts         # Formatting utilities
│   ├── types/
│   │   ├── session.ts            # Session types
│   │   ├── state.ts              # State types
│   │   └── config.ts             # Config types
│   └── hooks/
│       ├── useSession.ts         # Session state hook
│       ├── useActivityStream.ts  # Activity stream hook
│       └── useModels.ts          # Model fetching hook
└── public/
    └── ... (static assets)
```

---

## Implementation Phases

### Phase 1: Project Setup & Core Infrastructure (Foundation)

#### 1.1 Initialize Next.js Project
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir
```

#### 1.2 Install Dependencies
```bash
npm install zustand eventsource-parser uuid date-fns
npm install -D @types/uuid
```

#### 1.3 Create Type Definitions

**`src/types/config.ts`**
- `SessionConfig` interface matching spec 8.1
- `Prompts` interface for all prompt types
- Validation schemas

**`src/types/state.ts`**
- `SessionState` interface matching spec 8.2
- `SessionStatus` union type
- `ConsultantStatus` interface
- `RoundState` interface

**`src/types/session.ts`**
- `ClarificationTranscript` interface matching spec 8.3
- `DisplayMessage` and `ApiMessage` interfaces

#### 1.4 Create Storage Layer

**`src/lib/storage/sanitize.ts`**
- `sanitizeAppName(name: string): string` - implements spec 10.1 rules
- `generateTimestamp(): string` - Windows-safe format YYYY-MM-DD-HHmmss
- `createSessionDirectory(basePath: string, appIdea: string): string`

**`src/lib/storage/atomic-write.ts`**
- `atomicWrite(path: string, content: string): Promise<void>` - write to .partial, rename
- `cleanPartialFiles(directory: string): Promise<void>` - remove *.partial on startup

**`src/lib/storage/session.ts`**
- `saveConfig(dir: string, config: SessionConfig): Promise<void>`
- `loadConfig(dir: string): Promise<SessionConfig>`
- `saveState(dir: string, state: SessionState): Promise<void>`
- `loadState(dir: string): Promise<SessionState>`
- `saveTranscript(dir: string, transcript: ClarificationTranscript): Promise<void>`
- `loadTranscript(dir: string): Promise<ClarificationTranscript>`
- `appendSessionLog(dir: string, entry: string): Promise<void>`

---

### Phase 2: OpenRouter Integration

#### 2.1 OpenRouter Client

**`src/lib/openrouter/types.ts`**
```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

interface ModelInfo {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: number; completion: number };
}
```

**`src/lib/openrouter/client.ts`**
- `fetchModels(apiKey: string): Promise<ModelInfo[]>` - GET /models
- `testReachability(apiKey: string, model: string): Promise<boolean>` - lightweight test
- `chat(apiKey: string, request: ChatRequest): Promise<string>` - non-streaming
- `chatStream(apiKey: string, request: ChatRequest): AsyncGenerator<string>` - streaming

**`src/lib/openrouter/streaming.ts`**
- SSE parsing utilities
- Token accumulator
- Stream-to-text conversion

#### 2.2 Retry & Rate Limiting

**`src/lib/utils/retry.ts`**
- `withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>`
- Exponential backoff with jitter
- Max 5 minute retry window per call
- Handle HTTP 429 specifically

**`src/lib/utils/concurrency.ts`**
- `ConcurrencyLimiter` class
- Default limit: 5 concurrent calls
- Queue management for consultant calls

---

### Phase 3: Orchestrator & State Machine

#### 3.1 State Machine

**`src/lib/orchestrator/state-machine.ts`**
```typescript
type OrchestratorState =
  | 'idle'
  | 'preflight'
  | 'clarifying'
  | 'snapshotting'
  | 'drafting'
  | 'reviewing'
  | 'revising'
  | 'completed'
  | 'error';

interface StateTransition {
  from: OrchestratorState;
  to: OrchestratorState;
  condition?: () => boolean;
}

class StateMachine {
  private state: OrchestratorState = 'idle';
  private currentRound: number = 0;

  transition(to: OrchestratorState): void;
  canTransition(to: OrchestratorState): boolean;
  onStateChange(callback: (state: OrchestratorState) => void): void;
}
```

#### 3.2 Main Orchestrator

**`src/lib/orchestrator/index.ts`**
```typescript
class Orchestrator {
  private config: SessionConfig;
  private state: SessionState;
  private stateMachine: StateMachine;
  private sessionDir: string;

  // Lifecycle
  async initialize(config: SessionConfig, outputDir: string): Promise<void>;
  async resume(sessionDir: string): Promise<void>;
  async abort(): Promise<void>;

  // Phases
  async runPreflight(): Promise<PreflightResult>;
  async startClarification(): AsyncGenerator<StreamEvent>;
  async sendClarificationResponse(response: string): AsyncGenerator<StreamEvent>;
  async forceProgressToDrafting(): Promise<void>;
  async generateSnapshot(): Promise<void>;
  async generateDraft(): AsyncGenerator<StreamEvent>;
  async runFeedbackRound(round: number): AsyncGenerator<StreamEvent>;
  async generateRevision(round: number): AsyncGenerator<StreamEvent>;

  // Events
  onEvent(callback: (event: OrchestratorEvent) => void): void;
}
```

#### 3.3 Phase-Specific Logic

**`src/lib/orchestrator/clarification.ts`**
- Build clarification prompt with app idea
- Detect "READY TO WRITE SPEC" signal (case-insensitive, markdown-tolerant)
- Maintain transcript (display + API formats)

**`src/lib/orchestrator/snapshot.ts`**
- Build snapshot prompt
- Generate requirements-snapshot.md
- Parse and validate snapshot structure

**`src/lib/orchestrator/drafting.ts`**
- Build drafting prompt with snapshot + idea + transcript
- Generate spec-v1.md with metadata header

**`src/lib/orchestrator/feedback.ts`**
- Run consultant calls concurrently (respect limit)
- Aggregate feedback into single bundle
- Save individual responses + bundle
- Handle partial failures (fail round on any error)

**`src/lib/orchestrator/revision.ts`**
- Build revision prompt with snapshot + spec + feedback
- Generate spec-v{N}.md with revision notes
- Copy final to spec-final.md

---

### Phase 4: Default Prompts

**`src/lib/prompts/defaults.ts`**

Implement all 5 default prompts from spec section 9:
1. `SPEC_WRITER_CLARIFY` - section 9.1
2. `SPEC_WRITER_SNAPSHOT` - section 9.2
3. `SPEC_WRITER_DRAFT` - section 9.3
4. `SPEC_WRITER_REVISE` - section 9.4
5. `CONSULTANT` - section 9.5

Each as a constant string, exported for use and editing.

---

### Phase 5: API Routes

#### 5.1 Models API

**`src/app/api/models/route.ts`**
- GET: Fetch available models from OpenRouter
- Cache results for session (in-memory or short TTL)
- Return error status if discovery fails

#### 5.2 Preflight API

**`src/app/api/preflight/route.ts`**
- POST: Test reachability for array of models
- Return per-model success/failure
- Include error details

#### 5.3 Chat API (Streaming)

**`src/app/api/chat/route.ts`**
- POST: Streaming chat endpoint
- Use `ReadableStream` for SSE
- Handle different call types (clarify, draft, revise, consult)
- Return events for partial tokens

#### 5.4 Session API

**`src/app/api/session/route.ts`**
- POST: Create new session directory
- GET: List available sessions (for resume)

**`src/app/api/session/[id]/route.ts`**
- GET: Load session state + config
- PATCH: Update session state

#### 5.5 Files API

**`src/app/api/files/route.ts`**
- POST: Write file (with atomic write)
- GET: Read file
- DELETE: Remove partial files

---

### Phase 6: UI Components

#### 6.1 Base UI Components

**`src/components/ui/`**
- Button (variants: primary, secondary, danger, ghost)
- Input (text input with label, error state)
- Textarea (multi-line with auto-resize)
- Select (dropdown with custom styling)
- Card (container with optional header/footer)
- Collapsible (expandable section)
- Badge (status indicators)

#### 6.2 Configuration Panel

**`src/components/ConfigurationPanel.tsx`**
- App idea textarea (multi-line)
- Spec writer model selector
- Consultant models selector (1-5, multi-select)
- Rounds input (1-10)
- Output directory selector (via dialog or text input)
- Prompt editor section (collapsible)
- Start/Resume button
- Validation display

#### 6.3 Model Selector

**`src/components/ModelSelector.tsx`**
- Dropdown with fetched models
- Manual entry fallback
- Loading/error states
- Show exact model ID
- Support single or multi-select mode

#### 6.4 Prompt Editor

**`src/components/PromptEditor.tsx`**
- Tabs for each prompt type
- Textarea with default value
- Reset to default button
- Character count

#### 6.5 Activity Stream

**`src/components/ActivityStream.tsx`**
- Real-time event list
- Timestamps for each entry
- Visual distinction by type:
  - User input (blue)
  - Spec writer output (green)
  - Consultant output (purple)
  - System messages (gray)
  - Errors (red)
- Collapsible long outputs (>500 chars)
- Auto-scroll with pause button
- Streaming token display

#### 6.6 Clarification Chat

**`src/components/ClarificationChat.tsx`**
- Chat-style interface
- Current question prominent
- Response input with submit
- "Force progress" button
- Abort button
- Streaming response display

#### 6.7 Progress Indicator

**`src/components/ProgressIndicator.tsx`**
- Current phase display
- Round progress (N of R)
- Elapsed time per operation
- Overall progress bar

#### 6.8 Error Boundary

**`src/components/ErrorBoundary.tsx`**
- Error display with details
- Retry button
- Abort button
- Preserve partial results message

---

### Phase 7: Main Application Page

**`src/app/page.tsx`**

Layout:
```
┌─────────────────────────────────────────────────────────────┐
│  AI Spec Forge                                    [Status]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐  ┌──────────────────────────────┐ │
│  │                     │  │                              │ │
│  │  Configuration      │  │  Activity Stream             │ │
│  │  Panel              │  │  (when running)              │ │
│  │                     │  │                              │ │
│  │  - App Idea         │  │  OR                          │ │
│  │  - Models           │  │                              │ │
│  │  - Rounds           │  │  Clarification Chat          │ │
│  │  - Directory        │  │  (when clarifying)           │ │
│  │  - Prompts          │  │                              │ │
│  │                     │  │                              │ │
│  │  [Start]            │  │                              │ │
│  │                     │  │                              │ │
│  └─────────────────────┘  └──────────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Progress: Phase • Round X/Y • Elapsed: 00:00              │
└─────────────────────────────────────────────────────────────┘
```

State management:
- Configuration state (form inputs)
- Session state (from orchestrator)
- UI state (auto-scroll, collapsed sections)
- Activity events (append-only list)

---

### Phase 8: Hooks & State Management

**`src/hooks/useSession.ts`**
- Session configuration state
- Session runtime state
- Actions: start, resume, abort, sendResponse, forceProgress

**`src/hooks/useActivityStream.ts`**
- Activity events array
- Add event action
- Auto-scroll state
- Clear action

**`src/hooks/useModels.ts`**
- Fetch models on mount
- Loading/error states
- Manual refresh action

---

### Phase 9: Integration & Testing

#### 9.1 End-to-End Flow Testing
1. Start new session
2. Complete preflight
3. Run through clarification (3-5 exchanges)
4. Generate snapshot
5. Generate draft
6. Run 2 feedback rounds
7. Verify all files created correctly

#### 9.2 Resume Testing
1. Start session, interrupt mid-clarification
2. Resume and verify transcript preserved
3. Start session, interrupt mid-feedback round
4. Resume and verify only missing consultants run

#### 9.3 Error Handling Testing
1. Test with invalid API key
2. Test with unreachable model
3. Test rate limit handling
4. Test network interruption

---

## Implementation Order (Sequential Steps)

### Step 1: Project Initialization
```bash
# Create Next.js project with TypeScript and Tailwind
cd /Users/arash/Developer/specMaker
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-git

# Install additional dependencies
npm install zustand uuid date-fns
npm install -D @types/uuid
```

### Step 2: Create Type Definitions
- Create `src/types/config.ts`
- Create `src/types/state.ts`
- Create `src/types/session.ts`

### Step 3: Create Storage Layer
- Create `src/lib/storage/sanitize.ts`
- Create `src/lib/storage/atomic-write.ts`
- Create `src/lib/storage/session.ts`
- Create `src/lib/storage/index.ts`

### Step 4: Create OpenRouter Client
- Create `src/lib/openrouter/types.ts`
- Create `src/lib/openrouter/client.ts`
- Create `src/lib/openrouter/streaming.ts`

### Step 5: Create Utility Functions
- Create `src/lib/utils/retry.ts`
- Create `src/lib/utils/concurrency.ts`
- Create `src/lib/utils/format.ts`

### Step 6: Create Default Prompts
- Create `src/lib/prompts/defaults.ts`

### Step 7: Create State Machine
- Create `src/lib/orchestrator/state-machine.ts`

### Step 8: Create Orchestrator Phases
- Create `src/lib/orchestrator/clarification.ts`
- Create `src/lib/orchestrator/snapshot.ts`
- Create `src/lib/orchestrator/drafting.ts`
- Create `src/lib/orchestrator/feedback.ts`
- Create `src/lib/orchestrator/revision.ts`

### Step 9: Create Main Orchestrator
- Create `src/lib/orchestrator/index.ts`

### Step 10: Create API Routes
- Create `src/app/api/models/route.ts`
- Create `src/app/api/preflight/route.ts`
- Create `src/app/api/chat/route.ts`
- Create `src/app/api/session/route.ts`
- Create `src/app/api/session/[id]/route.ts`
- Create `src/app/api/files/route.ts`

### Step 11: Create UI Components
- Create base UI components in `src/components/ui/`
- Create `src/components/ConfigurationPanel.tsx`
- Create `src/components/ModelSelector.tsx`
- Create `src/components/PromptEditor.tsx`
- Create `src/components/ActivityStream.tsx`
- Create `src/components/ClarificationChat.tsx`
- Create `src/components/ProgressIndicator.tsx`
- Create `src/components/ErrorBoundary.tsx`

### Step 12: Create Hooks
- Create `src/hooks/useModels.ts`
- Create `src/hooks/useSession.ts`
- Create `src/hooks/useActivityStream.ts`

### Step 13: Build Main Page
- Update `src/app/layout.tsx`
- Update `src/app/globals.css`
- Create `src/app/page.tsx`

### Step 14: Final Integration
- Wire everything together
- Add error boundaries
- Test complete flow

---

## Key Implementation Details

### Detecting "READY TO WRITE SPEC" (FR-15)
```typescript
function isReadySignal(text: string): boolean {
  // Remove markdown emphasis
  const cleaned = text.replace(/\*+/g, '').replace(/_+/g, '');
  // Check for signal (case-insensitive, whitespace-tolerant)
  return /^\s*ready\s+to\s+write\s+spec\s*$/im.test(cleaned);
}
```

### Atomic File Writes (FR-37)
```typescript
async function atomicWrite(filePath: string, content: string): Promise<void> {
  const partialPath = `${filePath}.partial`;
  await fs.writeFile(partialPath, content, 'utf-8');
  await fs.rename(partialPath, filePath);
}
```

### Session Directory Naming (10.1)
```typescript
function createSessionDir(basePath: string, appIdea: string): string {
  const timestamp = format(new Date(), "yyyy-MM-dd-HHmmss");
  const sanitized = sanitizeAppName(appIdea);
  return path.join(basePath, `${timestamp}-${sanitized}`);
}

function sanitizeAppName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 64) || 'untitled';
}
```

### Streaming Response Handling
```typescript
async function* streamChat(apiKey: string, request: ChatRequest) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ai-spec-forge.local',
      'X-Title': 'AI Spec Forge'
    },
    body: JSON.stringify({ ...request, stream: true })
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') return;

      const parsed = JSON.parse(data);
      const content = parsed.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
```

### Retry with Exponential Backoff
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; maxDuration?: number } = {}
): Promise<T> {
  const { maxRetries = 5, maxDuration = 300000 } = options; // 5 min default
  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;

      if (attempt >= maxRetries || Date.now() - startTime > maxDuration) {
        throw error;
      }

      const isRateLimit = error instanceof Response && error.status === 429;
      const baseDelay = isRateLimit ? 10000 : 1000;
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 60000);
      const jitter = Math.random() * 1000;

      await new Promise(r => setTimeout(r, delay + jitter));
    }
  }
}
```

---

## Environment Variables

Create `.env.local`:
```
OPENROUTER_API_KEY=your_api_key_here
```

**Important**: Never log or include API key in saved files.

---

## File Templates

### spec-vN.md Template
```markdown
# {App Name}, Specification v{N}

**Generated**: {ISO timestamp}
**Spec Writer Model**: {model_id}
**Spec Version**: v{N}

---

{specification content from model}

---

## Revision Notes

{notes if N > 1}
```

### feedback/round-N.md Template
```markdown
# Feedback Round {N}

**Timestamp**: {ISO timestamp}
**Spec Version Reviewed**: v{inputSpecVersion}

---

## Feedback from {Model Name}

**Status**: success
**Duration**: {X minutes Y seconds}

{feedback content}

---

## Feedback from {Model Name 2}

**Status**: success
**Duration**: {X minutes Y seconds}

{feedback content}
```

### session-log.md Template
```markdown
# Session Log

**Created**: {timestamp}
**App Idea**: {first 100 chars}...

---

## Events

### {timestamp} - Session Started
Configuration:
- Spec Writer: {model}
- Consultants: {models}
- Rounds: {N}

### {timestamp} - Preflight Complete
All models reachable.

### {timestamp} - Clarification Started
...

### {timestamp} - Clarification Complete
{N} exchanges. Ready signal detected.

### {timestamp} - Requirements Snapshot Saved
Path: requirements-snapshot.md

### {timestamp} - Spec v1 Saved
Path: spec-v1.md

### {timestamp} - Feedback Round 1 Started
...
```

---

## Acceptance Criteria Checklist

- [ ] User can configure models, rounds, and output directory
- [ ] Preflight check aborts on unreachable models
- [ ] Clarification phase is interactive and persists transcript
- [ ] Requirements snapshot is generated and saved
- [ ] spec-v1.md is produced after clarification
- [ ] R feedback rounds run with parallel consultant calls
- [ ] Final spec is written to spec-final.md
- [ ] All artifacts saved (versions, feedback, logs, config, transcript, state)
- [ ] Resume works for mid-round interruption
- [ ] Partial responses are discarded on resume

---

## Estimated File Count

- Types: 3 files
- Storage: 4 files
- OpenRouter: 3 files
- Utils: 3 files
- Prompts: 1 file
- Orchestrator: 7 files
- API Routes: 6 files
- UI Components: 15+ files
- Hooks: 3 files
- Main app: 3 files

**Total: ~48 files**
