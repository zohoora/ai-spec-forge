'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Badge, CollapsibleContent } from './ui';
import { ActivityEvent } from '@/types/session';
import { formatTimestamp } from '@/lib/utils/format';

interface ActivityStreamProps {
  events: ActivityEvent[];
  autoScroll?: boolean;
  maxHeight?: string;
}

const eventTypeConfig: Record<ActivityEvent['type'], { color: string; label: string }> = {
  system: { color: 'gray', label: 'System' },
  user_input: { color: 'blue', label: 'User' },
  spec_writer: { color: 'green', label: 'Spec Writer' },
  consultant: { color: 'purple', label: 'Consultant' },
  error: { color: 'red', label: 'Error' },
  file_saved: { color: 'gray', label: 'File' },
};

export function ActivityStream({
  events,
  autoScroll = true,
  maxHeight = '500px',
}: ActivityStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(autoScroll);
  const [userScrolled, setUserScrolled] = useState(false);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (isAutoScrollEnabled && !userScrolled && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events, isAutoScrollEnabled, userScrolled]);

  // Detect user scroll
  const handleScroll = () => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    if (!isAtBottom) {
      setUserScrolled(true);
    } else {
      setUserScrolled(false);
    }
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setUserScrolled(false);
    }
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-y-auto space-y-3 pr-2"
        style={{ maxHeight }}
      >
        {events.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No activity yet. Start a session to see events here.
          </div>
        ) : (
          events.map((event) => (
            <ActivityEventItem key={event.id} event={event} />
          ))
        )}
      </div>

      {/* Scroll to bottom button */}
      {userScrolled && events.length > 0 && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-2 right-2 bg-blue-600 text-white px-3 py-1 rounded-full text-sm shadow-lg hover:bg-blue-700"
        >
          Scroll to bottom
        </button>
      )}

      {/* Auto-scroll toggle */}
      <div className="mt-2 flex justify-end">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={isAutoScrollEnabled}
            onChange={(e) => setIsAutoScrollEnabled(e.target.checked)}
            className="rounded"
          />
          Auto-scroll
        </label>
      </div>
    </div>
  );
}

interface ActivityEventItemProps {
  event: ActivityEvent;
}

function ActivityEventItem({ event }: ActivityEventItemProps) {
  const config = eventTypeConfig[event.type] || eventTypeConfig.system;

  return (
    <div className={`
      p-3 rounded-lg border
      ${event.type === 'error' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}
    `}>
      <div className="flex items-center justify-between mb-2">
        <Badge variant={config.color as 'gray' | 'blue' | 'green' | 'purple' | 'red'}>
          {config.label}
        </Badge>
        <span className="text-xs text-gray-500">
          {formatTimestamp(event.timestamp)}
        </span>
      </div>

      {event.metadata?.model && (
        <div className="text-xs text-gray-500 mb-1 font-mono">
          {event.metadata.model}
        </div>
      )}

      {event.content.length > 500 ? (
        <CollapsibleContent content={event.content} maxLength={500} />
      ) : (
        <div className="text-sm text-gray-700 whitespace-pre-wrap">
          {event.content}
        </div>
      )}

      {event.metadata?.file && (
        <div className="mt-2 text-xs text-gray-500">
          Saved: {event.metadata.file}
        </div>
      )}

      {event.metadata?.duration && (
        <div className="mt-1 text-xs text-gray-500">
          Duration: {(event.metadata.duration / 1000).toFixed(1)}s
        </div>
      )}
    </div>
  );
}

interface StreamingContentProps {
  content: string;
  isComplete?: boolean;
}

export function StreamingContent({ content, isComplete = false }: StreamingContentProps) {
  return (
    <div className="p-3 rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between mb-2">
        <Badge variant="green">Spec Writer</Badge>
        {!isComplete && (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Generating...
          </span>
        )}
      </div>
      <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
        {content}
        {!isComplete && <span className="animate-pulse">_</span>}
      </div>
    </div>
  );
}
