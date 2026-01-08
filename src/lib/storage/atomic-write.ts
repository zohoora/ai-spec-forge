// Atomic file write utilities per spec FR-37

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Write file atomically by writing to .partial first, then renaming
 * This prevents corrupted files if the process is interrupted
 */
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const partialPath = `${filePath}.partial`;

  // Ensure directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Write to partial file
  await fs.writeFile(partialPath, content, 'utf-8');

  // Rename to final path (atomic on most filesystems)
  await fs.rename(partialPath, filePath);
}

/**
 * Append to file with locking semantics
 * For session-log.md and other append-only files
 */
export async function appendToFile(filePath: string, content: string): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Append with newline
  await fs.appendFile(filePath, content + '\n', 'utf-8');
}

/**
 * Clean up any partial files in a directory
 * Called on startup/resume per spec FR-37
 */
export async function cleanPartialFiles(directory: string): Promise<string[]> {
  const cleaned: string[] = [];

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.partial')) {
        const partialPath = path.join(directory, entry.name);
        await fs.unlink(partialPath);
        cleaned.push(partialPath);
      } else if (entry.isDirectory()) {
        // Recursively clean subdirectories
        const subDir = path.join(directory, entry.name);
        const subCleaned = await cleanPartialFiles(subDir);
        cleaned.push(...subCleaned);
      }
    }
  } catch (error) {
    // Directory might not exist yet
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return cleaned;
}

/**
 * Safely read a file, returning null if it doesn't exist
 */
export async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory is writable
 */
export async function isDirectoryWritable(dirPath: string): Promise<boolean> {
  try {
    // Create dir if it doesn't exist
    await fs.mkdir(dirPath, { recursive: true });

    // Try to write a test file
    const testFile = path.join(dirPath, '.write-test');
    await fs.writeFile(testFile, 'test', 'utf-8');
    await fs.unlink(testFile);

    return true;
  } catch {
    return false;
  }
}
