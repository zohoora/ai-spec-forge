# AI Spec Forge

An iterative specification generator that uses multiple AI models to create, review, and refine software specifications.

## Features

- **Multi-Model Architecture**: Uses one "Spec Writer" model to generate specifications and 1-5 "Consultant" models to review and provide feedback
- **Interactive Clarification**: AI asks clarifying questions about your app idea before writing the spec
- **Import & Refine Existing Specs**: Import an existing specification to iterate and improve it
- **Iterative Feedback Rounds**: Configurable number of review cycles (1-10 rounds)
- **Real-time Streaming**: Watch the AI think and write in real-time
- **Session Persistence**: All artifacts saved locally - resume interrupted sessions
- **Customizable Prompts**: Edit any of the system prompts to tune behavior

## Getting Started

### Prerequisites

- Node.js 18+
- OpenRouter API key (get one at [openrouter.ai](https://openrouter.ai))

### Installation

```bash
# Clone the repository
git clone https://github.com/zohoora/ai-spec-forge.git
cd ai-spec-forge

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Configuration

1. Enter your OpenRouter API key (stored locally, never logged)
2. **Optional**: Import an existing spec to refine it
3. Describe your app idea (or refinement goals if importing)
4. Select a Spec Writer model (e.g., `anthropic/claude-3.5-sonnet`)
5. Select 1-5 Consultant models for review
6. Set the number of feedback rounds (default: 3)
7. Choose an output directory for saved files
8. Click "Start Session"

## Workflow

### New Specification

```
App Idea -> Clarification Q&A -> Requirements Snapshot -> Draft Spec -> Feedback Rounds -> Final Spec
```

### Refine Existing Specification

```
Import Spec -> Refinement Q&A -> Updated Requirements -> Revised Spec -> Feedback Rounds -> Final Spec
```

## Output Files

Each session creates a timestamped directory containing:

```
session-directory/
├── config.json                    # Session configuration
├── state.json                     # Current session state
├── clarification-transcript.json  # Full Q&A history
├── requirements-snapshot.md       # Extracted requirements
├── session-log.md                 # Event timeline
├── spec-v1.md                     # Initial draft
├── spec-v2.md                     # After round 1
├── spec-v{N}.md                   # After round N-1
├── spec-final.md                  # Final version
└── feedback/
    ├── round-1.md                 # Aggregated feedback
    ├── round-1-model-name.md      # Individual responses
    └── ...
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **AI Provider**: OpenRouter (access to 400+ models)

## Key Features Explained

### Import Existing Spec

Click "Import Existing Spec (Optional)" to:
- Upload a `.md` or `.txt` file
- Or paste spec content directly

When a spec is imported:
- The "App Idea" field becomes "Refinement Goals"
- The AI asks about what changes you want to make
- Uses a specialized prompt for spec refinement

### Customizable Prompts

Expand "Edit Prompts" to customize:
- **Clarification Prompt**: How the AI asks about your app idea
- **Refinement Prompt**: How the AI asks about changes to existing specs
- **Snapshot Prompt**: How requirements are extracted
- **Drafting Prompt**: How the spec is written
- **Revision Prompt**: How feedback is incorporated
- **Consultant Prompt**: How reviewers analyze the spec

## Development

```bash
# Run development server
npm run dev

# Type check
npx tsc --noEmit

# Lint
npm run lint

# Build for production
npm run build
```

## License

MIT
