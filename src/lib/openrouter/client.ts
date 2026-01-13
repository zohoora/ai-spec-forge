// OpenRouter API client

import {
  ChatRequest,
  ChatResponse,
  ModelInfo,
  ModelsResponse,
  isOpenRouterError,
} from './types';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT = 90 * 60 * 1000; // 90 minutes per spec 6.4

export interface OpenRouterClientOptions {
  apiKey: string;
  appName?: string;
  appUrl?: string;
  timeout?: number;
}

export class OpenRouterClient {
  private apiKey: string;
  private appName: string;
  private appUrl: string;
  private timeout: number;

  constructor(options: OpenRouterClientOptions) {
    this.apiKey = options.apiKey;
    this.appName = options.appName || 'AI Spec Forge';
    this.appUrl = options.appUrl || 'https://ai-spec-forge.local';
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
  }

  private getHeaders(): HeadersInit {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': this.appUrl,
      'X-Title': this.appName,
    };
  }

  /**
   * Fetch available models from OpenRouter
   */
  async fetchModels(): Promise<ModelInfo[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for model fetch

    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        if (isOpenRouterError(error)) {
          throw new Error(`OpenRouter API error: ${error.error.message}`);
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ModelsResponse = await response.json();
      return data.data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Model fetch timed out');
      }
      throw error;
    }
  }

  /**
   * Test if a model is reachable with a lightweight request
   */
  async testReachability(model: string): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for reachability test

    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 50,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Reachability test failed for model ${model}:`, errorText);
        try {
          const error = JSON.parse(errorText);
          if (isOpenRouterError(error)) {
            throw new Error(error.error.message);
          }
        } catch {
          // Not JSON
        }
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
      }

      return true;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`Reachability test error for model ${model}:`, error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown error during reachability test');
    }
  }

  /**
   * Send a chat completion request (non-streaming)
   */
  async chat(request: ChatRequest): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          ...request,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        if (isOpenRouterError(error)) {
          throw new Error(`OpenRouter API error: ${error.error.message}`);
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ChatResponse = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error('Empty response from model');
      }

      const content = data.choices[0].message?.content;
      if (!content) {
        throw new Error('No content in response');
      }

      return content;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.timeout / 1000 / 60} minutes`);
      }
      throw error;
    }
  }

  /**
   * Send a streaming chat completion request
   * Returns an async generator that yields content chunks
   */
  async *chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          ...request,
          stream: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter streaming error for model ${request.model}:`, errorText);
        try {
          const error = JSON.parse(errorText);
          if (isOpenRouterError(error)) {
            throw new Error(`OpenRouter API error: ${error.error.message}`);
          }
        } catch {
          // Not JSON
        }
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed || !trimmed.startsWith('data: ')) {
            continue;
          }

          const data = trimmed.slice(6); // Remove 'data: ' prefix

          if (data === '[DONE]') {
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Ignore parse errors for malformed chunks
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.timeout / 1000 / 60} minutes`);
      }
      throw error;
    }
  }

  /**
   * Collect all chunks from a streaming request into a single string
   */
  async chatStreamCollect(request: ChatRequest): Promise<string> {
    let result = '';
    for await (const chunk of this.chatStream(request)) {
      result += chunk;
    }
    return result;
  }
}

// Singleton instance creator
let clientInstance: OpenRouterClient | null = null;

export function getOpenRouterClient(apiKey: string): OpenRouterClient {
  if (!clientInstance || clientInstance['apiKey'] !== apiKey) {
    clientInstance = new OpenRouterClient({ apiKey });
  }
  return clientInstance;
}

export function createOpenRouterClient(options: OpenRouterClientOptions): OpenRouterClient {
  return new OpenRouterClient(options);
}
