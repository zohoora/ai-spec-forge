'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ActivityEvent, ActivityEventType } from '@/types/session';
import { generateId } from '@/lib/utils/format';

interface UseActivityStreamResult {
  activities: ActivityEvent[];
  addActivity: (type: ActivityEventType, content: string, metadata?: ActivityEvent['metadata']) => void;
  clearActivities: () => void;
  lastActivity: ActivityEvent | null;
}

export function useActivityStream(maxItems: number = 1000): UseActivityStreamResult {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const activitiesRef = useRef<ActivityEvent[]>([]);

  // Keep ref in sync
  useEffect(() => {
    activitiesRef.current = activities;
  }, [activities]);

  const addActivity = useCallback((
    type: ActivityEventType,
    content: string,
    metadata?: ActivityEvent['metadata']
  ) => {
    const event: ActivityEvent = {
      id: generateId(),
      type,
      timestamp: new Date().toISOString(),
      content,
      metadata,
    };

    setActivities((prev) => {
      const updated = [...prev, event];
      // Trim if exceeds max
      if (updated.length > maxItems) {
        return updated.slice(-maxItems);
      }
      return updated;
    });
  }, [maxItems]);

  const clearActivities = useCallback(() => {
    setActivities([]);
  }, []);

  const lastActivity = activities.length > 0 ? activities[activities.length - 1] : null;

  return {
    activities,
    addActivity,
    clearActivities,
    lastActivity,
  };
}
