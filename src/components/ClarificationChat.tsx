'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button, Textarea, Badge } from './ui';
import { ClarificationTranscript, DisplayMessage } from '@/types/session';
import { formatTimestamp } from '@/lib/utils/format';

interface ClarificationChatProps {
  transcript: ClarificationTranscript | null;
  streamingContent: string;
  isStreaming: boolean;
  isReady: boolean;
  onSendMessage: (message: string) => void;
  onForceProgress: () => void;
  onAbort: () => void;
  disabled?: boolean;
}

export function ClarificationChat({
  transcript,
  streamingContent,
  isStreaming,
  isReady,
  onSendMessage,
  onForceProgress,
  onAbort,
  disabled = false,
}: ClarificationChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = transcript?.displayMessages || [];

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Focus input when streaming completes
  useEffect(() => {
    if (!isStreaming && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isStreaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled && !isStreaming) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <div>
          <h2 className="font-semibold text-gray-900">Clarification Phase</h2>
          <p className="text-sm text-gray-500">
            Answer questions to help define your specification
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isReady && (
            <Badge variant="green">Ready to Draft</Badge>
          )}
          {isStreaming && (
            <Badge variant="blue">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-1" />
              Thinking...
            </Badge>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <ChatMessage key={index} message={message} />
        ))}

        {/* Streaming content */}
        {streamingContent && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-medium text-green-700">AI</span>
            </div>
            <div className="flex-1">
              <div className="bg-gray-100 rounded-lg p-3">
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {streamingContent}
                  {isStreaming && <span className="animate-pulse">_</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t p-4 bg-white">
        {isReady ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-gray-600">
              The spec writer has gathered enough information.
            </p>
            <div className="flex gap-3">
              <Button onClick={onForceProgress} disabled={disabled}>
                Continue to Drafting
              </Button>
              <Button variant="ghost" onClick={onAbort} disabled={disabled}>
                Abort
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your response..."
              rows={3}
              disabled={disabled || isStreaming}
              autoResize
              maxHeight={200}
            />
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={!input.trim() || disabled || isStreaming}
                >
                  Send
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onForceProgress}
                  disabled={disabled || isStreaming}
                >
                  Skip to Drafting
                </Button>
              </div>
              <Button
                type="button"
                variant="danger"
                onClick={onAbort}
                disabled={disabled}
              >
                Abort
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Press Enter to send, Shift+Enter for new line
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

interface ChatMessageProps {
  message: DisplayMessage;
}

function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`
        w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
        ${isUser ? 'bg-blue-100' : 'bg-green-100'}
      `}>
        <span className={`text-sm font-medium ${isUser ? 'text-blue-700' : 'text-green-700'}`}>
          {isUser ? 'U' : 'AI'}
        </span>
      </div>
      <div className={`flex-1 max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div className={`
          inline-block rounded-lg p-3
          ${isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}
        `}>
          <div className="text-sm whitespace-pre-wrap">{message.content}</div>
        </div>
        <div className={`text-xs text-gray-400 mt-1 ${isUser ? 'text-right' : ''}`}>
          {formatTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
