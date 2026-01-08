'use client';

import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  size?: 'sm' | 'md';
  className?: string;
}

const variantClasses = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export function Badge({
  children,
  variant = 'gray',
  size = 'sm',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  status: 'idle' | 'preflight' | 'clarifying' | 'snapshotting' | 'drafting' | 'reviewing' | 'revising' | 'completed' | 'error';
  className?: string;
}

const statusConfig: Record<StatusBadgeProps['status'], { label: string; variant: BadgeProps['variant'] }> = {
  idle: { label: 'Ready', variant: 'gray' },
  preflight: { label: 'Checking Models', variant: 'blue' },
  clarifying: { label: 'Clarifying', variant: 'blue' },
  snapshotting: { label: 'Creating Snapshot', variant: 'blue' },
  drafting: { label: 'Drafting Spec', variant: 'blue' },
  reviewing: { label: 'Getting Feedback', variant: 'yellow' },
  revising: { label: 'Revising Spec', variant: 'yellow' },
  completed: { label: 'Completed', variant: 'green' },
  error: { label: 'Error', variant: 'red' },
};

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
