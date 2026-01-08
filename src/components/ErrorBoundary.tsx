'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button, Card } from './ui';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="m-4 p-6">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 text-red-500">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <div className="flex justify-center gap-3">
              <Button onClick={this.handleRetry}>
                Try Again
              </Button>
              <Button
                variant="secondary"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
            </div>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}

interface ErrorDisplayProps {
  error: {
    message: string;
    step?: string;
    model?: string;
    timestamp?: string;
  };
  onRetry?: () => void;
  onAbort?: () => void;
}

export function ErrorDisplay({ error, onRetry, onAbort }: ErrorDisplayProps) {
  return (
    <Card className="border-red-200 bg-red-50">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 flex-shrink-0 text-red-500">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-red-800">Error</h3>
            <p className="text-sm text-red-700 mt-1">{error.message}</p>
            {error.step && (
              <p className="text-xs text-red-600 mt-1">
                Step: {error.step}
              </p>
            )}
            {error.model && (
              <p className="text-xs text-red-600 font-mono">
                Model: {error.model}
              </p>
            )}
            {error.timestamp && (
              <p className="text-xs text-red-500 mt-1">
                {new Date(error.timestamp).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          {onRetry && (
            <Button size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
          {onAbort && (
            <Button size="sm" variant="danger" onClick={onAbort}>
              Abort
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
