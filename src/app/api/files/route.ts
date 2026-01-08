// API route for file operations

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { atomicWrite, safeReadFile, fileExists, cleanPartialFiles } from '@/lib/storage/atomic-write';

// GET: Read a file
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      );
    }

    // Security: ensure path is absolute and doesn't escape
    if (!filePath.startsWith('/') || filePath.includes('..')) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 400 }
      );
    }

    // Normalize and use the cleaned path
    const normalizedPath = path.normalize(filePath);
    const content = await safeReadFile(normalizedPath);

    if (content === null) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ content });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read file';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// POST: Write a file
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filePath, content, atomic = true } = body;

    if (!filePath || content === undefined) {
      return NextResponse.json(
        { error: 'File path and content are required' },
        { status: 400 }
      );
    }

    // Security: ensure path is absolute and doesn't escape
    if (!filePath.startsWith('/') || filePath.includes('..')) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 400 }
      );
    }

    // Normalize the path
    const normalizedPath = path.normalize(filePath);

    if (atomic) {
      await atomicWrite(filePath, content);
    } else {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to write file';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// DELETE: Clean partial files in a directory
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const directory = searchParams.get('directory');

    if (!directory) {
      return NextResponse.json(
        { error: 'Directory is required' },
        { status: 400 }
      );
    }

    // Security check
    const normalizedPath = path.normalize(directory);
    if (normalizedPath !== directory || directory.includes('..')) {
      return NextResponse.json(
        { error: 'Invalid directory path' },
        { status: 400 }
      );
    }

    const cleaned = await cleanPartialFiles(directory);

    return NextResponse.json({
      success: true,
      cleanedFiles: cleaned,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clean files';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
