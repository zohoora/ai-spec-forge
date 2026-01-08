// Session and transcript types matching spec 8.3

export interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ClarificationTranscript {
  displayMessages: DisplayMessage[];
  apiMessages: ApiMessage[];
}

export function createInitialTranscript(systemPrompt: string, appIdea: string): ClarificationTranscript {
  return {
    displayMessages: [],
    apiMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `App Idea:\n\n${appIdea}` },
    ],
  };
}

export function addUserMessage(
  transcript: ClarificationTranscript,
  content: string
): ClarificationTranscript {
  const timestamp = new Date().toISOString();
  return {
    displayMessages: [
      ...transcript.displayMessages,
      { role: 'user', content, timestamp },
    ],
    apiMessages: [
      ...transcript.apiMessages,
      { role: 'user', content },
    ],
  };
}

export function addAssistantMessage(
  transcript: ClarificationTranscript,
  content: string
): ClarificationTranscript {
  const timestamp = new Date().toISOString();
  return {
    displayMessages: [
      ...transcript.displayMessages,
      { role: 'assistant', content, timestamp },
    ],
    apiMessages: [
      ...transcript.apiMessages,
      { role: 'assistant', content },
    ],
  };
}

// Activity stream event types
export type ActivityEventType =
  | 'system'
  | 'user_input'
  | 'spec_writer'
  | 'consultant'
  | 'error'
  | 'file_saved';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: string;
  content: string;
  metadata?: {
    model?: string;
    file?: string;
    duration?: number;
    round?: number;
    phase?: string;
  };
}

// Model info types
export interface ModelInfo {
  id: string;
  name: string;
  context_length?: number;
  pricing?: {
    prompt: number;
    completion: number;
  };
}

// Preflight result
export interface PreflightResult {
  success: boolean;
  results: {
    model: string;
    reachable: boolean;
    error?: string;
  }[];
}
