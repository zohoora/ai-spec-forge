// Formatting utilities

import { format, formatDistanceToNow } from 'date-fns';

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Format timestamp as relative time
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format model ID for display (extract readable name)
 */
export function formatModelId(modelId: string): string {
  // OpenRouter model IDs are often in format: provider/model-name
  const parts = modelId.split('/');
  if (parts.length === 2) {
    return parts[1];
  }
  return modelId;
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Pluralize a word based on count
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) return singular;
  return plural || `${singular}s`;
}

/**
 * Convert transcript messages to readable format
 */
export function formatTranscript(
  messages: Array<{ role: string; content: string; timestamp?: string }>
): string {
  return messages
    .map((msg) => {
      const prefix = msg.role === 'user' ? 'User' : 'Assistant';
      const time = msg.timestamp
        ? ` (${formatTimestamp(msg.timestamp)})`
        : '';
      return `**${prefix}**${time}:\n${msg.content}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Extract app name from idea for display purposes
 */
export function extractAppName(appIdea: string): string {
  // Try to find a name-like pattern at the start
  const lines = appIdea.split('\n');
  const firstLine = lines[0].trim();

  // If first line is short, use it as name
  if (firstLine.length <= 50 && firstLine.length > 0) {
    // Remove common prefixes
    const cleaned = firstLine
      .replace(/^(build|create|make|develop|i want to build|i want to create|an app (for|to|that)|a tool (for|to|that))/i, '')
      .trim();
    if (cleaned.length > 0 && cleaned.length <= 50) {
      return cleaned;
    }
    return firstLine;
  }

  // Otherwise truncate
  return truncate(firstLine, 50);
}

/**
 * Status label formatting
 */
export function formatStatus(status: string): {
  label: string;
  color: 'gray' | 'blue' | 'yellow' | 'green' | 'red';
} {
  switch (status) {
    case 'idle':
      return { label: 'Ready', color: 'gray' };
    case 'preflight':
      return { label: 'Checking Models', color: 'blue' };
    case 'clarifying':
      return { label: 'Clarifying', color: 'blue' };
    case 'snapshotting':
      return { label: 'Creating Snapshot', color: 'blue' };
    case 'drafting':
      return { label: 'Drafting Spec', color: 'blue' };
    case 'reviewing':
      return { label: 'Getting Feedback', color: 'yellow' };
    case 'revising':
      return { label: 'Revising Spec', color: 'yellow' };
    case 'completed':
      return { label: 'Completed', color: 'green' };
    case 'error':
      return { label: 'Error', color: 'red' };
    default:
      return { label: status, color: 'gray' };
  }
}
