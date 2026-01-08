// Filename sanitization utilities per spec 10.1

import { format } from 'date-fns';

/**
 * Sanitize app name for use in directory names
 * Rules from spec 10.1:
 * - Lowercase
 * - Replace spaces with hyphens
 * - Remove characters outside a-z, 0-9, hyphen
 * - Collapse repeated hyphens
 * - Trim to 64 characters
 * - If empty, use 'untitled'
 */
export function sanitizeAppName(name: string): string {
  if (!name) return 'untitled';

  const sanitized = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') // trim leading/trailing hyphens
    .slice(0, 64);

  return sanitized || 'untitled';
}

/**
 * Generate Windows-safe timestamp
 * Format: YYYY-MM-DD-HHmmss (no colons)
 */
export function generateTimestamp(date: Date = new Date()): string {
  return format(date, 'yyyy-MM-dd-HHmmss');
}

/**
 * Create session directory name
 * Format: {timestamp}-{sanitized-app-name}
 */
export function createSessionDirectoryName(appIdea: string, date: Date = new Date()): string {
  const timestamp = generateTimestamp(date);
  const sanitizedName = sanitizeAppName(appIdea);
  return `${timestamp}-${sanitizedName}`;
}

/**
 * Extract short description from app idea for display
 */
export function getShortDescription(appIdea: string, maxLength: number = 100): string {
  if (appIdea.length <= maxLength) return appIdea;
  return appIdea.slice(0, maxLength - 3) + '...';
}
