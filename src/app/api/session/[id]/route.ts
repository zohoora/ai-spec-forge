// API route for individual session operations

import { NextRequest, NextResponse } from 'next/server';
import {
  loadConfig,
  loadState,
  loadTranscript,
  loadRequirementsSnapshot,
  loadSpecVersion,
  saveState,
  saveTranscript,
  canResumeSession,
  isValidSessionDirectory,
} from '@/lib/storage/session';
import { SessionState } from '@/types/state';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: Load session data
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // The id is a base64-encoded path
    const { id } = await params;
    const sessionDir = Buffer.from(id, 'base64').toString('utf-8');

    // Validate it's a real session
    const isValid = await isValidSessionDirectory(sessionDir);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid session directory' },
        { status: 404 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const include = searchParams.get('include')?.split(',') || ['config', 'state'];

    const result: Record<string, unknown> = {
      sessionDir,
      canResume: await canResumeSession(sessionDir),
    };

    if (include.includes('config')) {
      result.config = await loadConfig(sessionDir);
    }

    if (include.includes('state')) {
      result.state = await loadState(sessionDir);
    }

    if (include.includes('transcript')) {
      result.transcript = await loadTranscript(sessionDir);
    }

    if (include.includes('snapshot')) {
      result.snapshot = await loadRequirementsSnapshot(sessionDir);
    }

    // Load specific spec version
    const specVersion = searchParams.get('specVersion');
    if (specVersion) {
      result.spec = await loadSpecVersion(sessionDir, parseInt(specVersion, 10));
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load session';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// PATCH: Update session state or transcript
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessionDir = Buffer.from(id, 'base64').toString('utf-8');

    const isValid = await isValidSessionDirectory(sessionDir);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid session directory' },
        { status: 404 }
      );
    }

    const body = await request.json();

    // Update state
    if (body.state) {
      const currentState = await loadState(sessionDir);
      if (!currentState) {
        return NextResponse.json(
          { error: 'Could not load current state' },
          { status: 500 }
        );
      }

      const updatedState: SessionState = {
        ...currentState,
        ...body.state,
      };

      await saveState(sessionDir, updatedState);
    }

    // Update transcript
    if (body.transcript) {
      await saveTranscript(sessionDir, body.transcript);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update session';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
