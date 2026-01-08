// Session storage utilities

import { promises as fs } from 'fs';
import path from 'path';
import { SessionConfig } from '@/types/config';
import { SessionState, createInitialState } from '@/types/state';
import { ClarificationTranscript } from '@/types/session';
import { atomicWrite, appendToFile, safeReadFile, fileExists, cleanPartialFiles } from './atomic-write';
import { createSessionDirectoryName, generateTimestamp } from './sanitize';
import { format } from 'date-fns';

// File paths within a session directory
const CONFIG_FILE = 'config.json';
const STATE_FILE = 'state.json';
const TRANSCRIPT_FILE = 'clarification-transcript.json';
const REQUIREMENTS_SNAPSHOT_FILE = 'requirements-snapshot.md';
const SESSION_LOG_FILE = 'session-log.md';
const FEEDBACK_DIR = 'feedback';
const SPEC_FINAL_FILE = 'spec-final.md';

export function getConfigPath(sessionDir: string): string {
  return path.join(sessionDir, CONFIG_FILE);
}

export function getStatePath(sessionDir: string): string {
  return path.join(sessionDir, STATE_FILE);
}

export function getTranscriptPath(sessionDir: string): string {
  return path.join(sessionDir, TRANSCRIPT_FILE);
}

export function getRequirementsSnapshotPath(sessionDir: string): string {
  return path.join(sessionDir, REQUIREMENTS_SNAPSHOT_FILE);
}

export function getSessionLogPath(sessionDir: string): string {
  return path.join(sessionDir, SESSION_LOG_FILE);
}

export function getSpecVersionPath(sessionDir: string, version: number): string {
  return path.join(sessionDir, `spec-v${version}.md`);
}

export function getSpecFinalPath(sessionDir: string): string {
  return path.join(sessionDir, SPEC_FINAL_FILE);
}

export function getFeedbackDir(sessionDir: string): string {
  return path.join(sessionDir, FEEDBACK_DIR);
}

export function getFeedbackRoundPath(sessionDir: string, round: number): string {
  return path.join(sessionDir, FEEDBACK_DIR, `round-${round}.md`);
}

export function getConsultantResponsePath(sessionDir: string, round: number, modelId: string): string {
  // Sanitize model ID for filename
  const safeModelId = modelId.replace(/[^a-zA-Z0-9-]/g, '_');
  return path.join(sessionDir, FEEDBACK_DIR, `round-${round}-${safeModelId}.md`);
}

/**
 * Create a new session directory
 */
export async function createSessionDirectory(
  baseDir: string,
  appIdea: string
): Promise<string> {
  const dirName = createSessionDirectoryName(appIdea);
  const sessionDir = path.join(baseDir, dirName);

  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(path.join(sessionDir, FEEDBACK_DIR), { recursive: true });

  return sessionDir;
}

/**
 * Initialize session with config and state files
 */
export async function initializeSession(
  sessionDir: string,
  config: SessionConfig
): Promise<void> {
  // Save config
  await saveConfig(sessionDir, config);

  // Save initial state
  const state = createInitialState();
  await saveState(sessionDir, state);

  // Initialize session log
  await initializeSessionLog(sessionDir, config);

  // Clean any partial files from previous runs
  await cleanPartialFiles(sessionDir);
}

/**
 * Save session configuration
 */
export async function saveConfig(sessionDir: string, config: SessionConfig): Promise<void> {
  const configPath = getConfigPath(sessionDir);
  await atomicWrite(configPath, JSON.stringify(config, null, 2));
}

/**
 * Load session configuration
 */
export async function loadConfig(sessionDir: string): Promise<SessionConfig | null> {
  const content = await safeReadFile(getConfigPath(sessionDir));
  if (!content) return null;
  return JSON.parse(content) as SessionConfig;
}

/**
 * Save session state
 */
export async function saveState(sessionDir: string, state: SessionState): Promise<void> {
  const statePath = getStatePath(sessionDir);
  await atomicWrite(statePath, JSON.stringify(state, null, 2));
}

/**
 * Load session state
 */
export async function loadState(sessionDir: string): Promise<SessionState | null> {
  const content = await safeReadFile(getStatePath(sessionDir));
  if (!content) return null;
  return JSON.parse(content) as SessionState;
}

/**
 * Save clarification transcript
 */
export async function saveTranscript(
  sessionDir: string,
  transcript: ClarificationTranscript
): Promise<void> {
  const transcriptPath = getTranscriptPath(sessionDir);
  await atomicWrite(transcriptPath, JSON.stringify(transcript, null, 2));
}

/**
 * Load clarification transcript
 */
export async function loadTranscript(
  sessionDir: string
): Promise<ClarificationTranscript | null> {
  const content = await safeReadFile(getTranscriptPath(sessionDir));
  if (!content) return null;
  return JSON.parse(content) as ClarificationTranscript;
}

/**
 * Save requirements snapshot
 */
export async function saveRequirementsSnapshot(
  sessionDir: string,
  content: string
): Promise<void> {
  const snapshotPath = getRequirementsSnapshotPath(sessionDir);
  await atomicWrite(snapshotPath, content);
}

/**
 * Load requirements snapshot
 */
export async function loadRequirementsSnapshot(sessionDir: string): Promise<string | null> {
  return safeReadFile(getRequirementsSnapshotPath(sessionDir));
}

/**
 * Save spec version
 */
export async function saveSpecVersion(
  sessionDir: string,
  version: number,
  content: string,
  model: string,
  appName: string
): Promise<void> {
  const timestamp = new Date().toISOString();
  const header = `# ${appName}, Specification v${version}

**Generated**: ${timestamp}
**Spec Writer Model**: ${model}
**Spec Version**: v${version}

---

`;

  const fullContent = header + content;
  const specPath = getSpecVersionPath(sessionDir, version);
  await atomicWrite(specPath, fullContent);
}

/**
 * Load spec version
 */
export async function loadSpecVersion(
  sessionDir: string,
  version: number
): Promise<string | null> {
  return safeReadFile(getSpecVersionPath(sessionDir, version));
}

/**
 * Copy final spec version
 */
export async function copyFinalSpec(
  sessionDir: string,
  version: number
): Promise<void> {
  const sourcePath = getSpecVersionPath(sessionDir, version);
  const destPath = getSpecFinalPath(sessionDir);
  const content = await safeReadFile(sourcePath);
  if (content) {
    await atomicWrite(destPath, content);
  }
}

/**
 * Save consultant feedback response
 */
export async function saveConsultantResponse(
  sessionDir: string,
  round: number,
  modelId: string,
  content: string,
  duration: number,
  status: 'success' | 'error'
): Promise<string> {
  const responsePath = getConsultantResponsePath(sessionDir, round, modelId);
  const timestamp = new Date().toISOString();

  const durationStr = formatDuration(duration);

  const formattedContent = `# Consultant Response: ${modelId}

**Timestamp**: ${timestamp}
**Round**: ${round}
**Status**: ${status}
**Duration**: ${durationStr}

---

${content}
`;

  await atomicWrite(responsePath, formattedContent);
  return responsePath;
}

/**
 * Save aggregated feedback bundle for a round
 */
export async function saveFeedbackBundle(
  sessionDir: string,
  round: number,
  inputSpecVersion: number,
  consultantResponses: Array<{ modelId: string; content: string; duration: number; status: string }>
): Promise<string> {
  const bundlePath = getFeedbackRoundPath(sessionDir, round);
  const timestamp = new Date().toISOString();

  let bundleContent = `# Feedback Round ${round}

**Timestamp**: ${timestamp}
**Spec Version Reviewed**: v${inputSpecVersion}

---

`;

  for (const response of consultantResponses) {
    const durationStr = formatDuration(response.duration);
    bundleContent += `## Feedback from ${response.modelId}

**Status**: ${response.status}
**Duration**: ${durationStr}

${response.content}

---

`;
  }

  await atomicWrite(bundlePath, bundleContent);
  return bundlePath;
}

/**
 * Initialize session log
 */
async function initializeSessionLog(
  sessionDir: string,
  config: SessionConfig
): Promise<void> {
  const logPath = getSessionLogPath(sessionDir);
  const timestamp = new Date().toISOString();
  const shortIdea = config.appIdea.length > 100
    ? config.appIdea.slice(0, 100) + '...'
    : config.appIdea;

  const initialContent = `# Session Log

**Created**: ${timestamp}
**App Idea**: ${shortIdea}

---

## Configuration

- **Spec Writer Model**: ${config.specWriterModel}
- **Consultant Models**: ${config.consultantModels.join(', ')}
- **Number of Rounds**: ${config.numberOfRounds}
- **Output Directory**: ${config.outputDirectory}

---

## Events

`;

  await atomicWrite(logPath, initialContent);
}

/**
 * Append event to session log
 */
export async function appendSessionLogEvent(
  sessionDir: string,
  event: string,
  details?: string
): Promise<void> {
  const logPath = getSessionLogPath(sessionDir);
  const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

  let entry = `### ${timestamp} - ${event}\n`;
  if (details) {
    entry += `${details}\n`;
  }
  entry += '\n';

  await appendToFile(logPath, entry);
}

/**
 * Check if a directory contains a valid session
 */
export async function isValidSessionDirectory(dir: string): Promise<boolean> {
  const statePath = getStatePath(dir);
  return fileExists(statePath);
}

/**
 * Check if a session can be resumed (non-completed status)
 */
export async function canResumeSession(dir: string): Promise<boolean> {
  const state = await loadState(dir);
  if (!state) return false;
  return state.status !== 'completed' && state.status !== 'idle';
}

/**
 * List available sessions in a directory
 */
export async function listSessions(baseDir: string): Promise<Array<{
  path: string;
  name: string;
  createdAt: string;
  status: string;
  canResume: boolean;
}>> {
  const sessions: Array<{
    path: string;
    name: string;
    createdAt: string;
    status: string;
    canResume: boolean;
  }> = [];

  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sessionDir = path.join(baseDir, entry.name);
        const state = await loadState(sessionDir);
        const config = await loadConfig(sessionDir);

        if (state && config) {
          sessions.push({
            path: sessionDir,
            name: entry.name,
            createdAt: config.createdAt,
            status: state.status,
            canResume: state.status !== 'completed' && state.status !== 'idle',
          });
        }
      }
    }
  } catch {
    // Directory might not exist
  }

  return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Format duration in milliseconds to human readable string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
  }
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}
