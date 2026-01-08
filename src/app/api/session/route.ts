// API route for session management

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { SessionConfig, validateConfig } from '@/types/config';
import { createSessionDirectory, initializeSession, listSessions } from '@/lib/storage/session';
import { getDefaultPrompts, mergeWithDefaults } from '@/lib/prompts/defaults';

interface CreateSessionRequest {
  appIdea: string;
  specWriterModel: string;
  consultantModels: string[];
  numberOfRounds: number;
  prompts?: Partial<SessionConfig['prompts']>;
  outputDirectory: string;
}

// POST: Create a new session
export async function POST(request: NextRequest) {
  try {
    const body: CreateSessionRequest = await request.json();

    // Build full config
    const config: SessionConfig = {
      appIdea: body.appIdea,
      specWriterModel: body.specWriterModel,
      consultantModels: body.consultantModels,
      numberOfRounds: body.numberOfRounds,
      prompts: mergeWithDefaults(body.prompts || {}),
      outputDirectory: body.outputDirectory,
      createdAt: new Date().toISOString(),
    };

    // Validate
    const errors = validateConfig(config);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: errors },
        { status: 400 }
      );
    }

    // Check output directory exists and is writable
    try {
      await fs.mkdir(config.outputDirectory, { recursive: true });
      const testFile = path.join(config.outputDirectory, '.write-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
    } catch {
      return NextResponse.json(
        { error: 'Output directory is not writable' },
        { status: 400 }
      );
    }

    // Create session directory
    const sessionDir = await createSessionDirectory(config.outputDirectory, config.appIdea);

    // Initialize session
    await initializeSession(sessionDir, config);

    return NextResponse.json({
      success: true,
      sessionDir,
      config,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create session';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// GET: List sessions in a directory or get default prompts
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');

  // Get default prompts
  if (action === 'defaults') {
    return NextResponse.json({
      prompts: getDefaultPrompts(),
    });
  }

  // List sessions
  const directory = searchParams.get('directory');

  if (!directory) {
    return NextResponse.json(
      { error: 'Directory parameter is required' },
      { status: 400 }
    );
  }

  try {
    const sessions = await listSessions(directory);
    return NextResponse.json({ sessions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list sessions';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
