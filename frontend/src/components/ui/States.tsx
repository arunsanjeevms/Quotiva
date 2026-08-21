import { AlertCircle, FileQuestion, RefreshCw, SearchX, ShieldAlert, WifiOff } from 'lucide-react';
import { Button } from './Button';
import { ApiError } from '@/lib/apiClient';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Every list ships one of these instead of a blank area (docs/07 §7). */
export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
  className,
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface px-6 py-14 text-center',
        className,
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-subtle">
        <Icon className="h-5 w-5 text-content-muted" />
      </div>
      <h3 className="text-h3 text-content">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-content-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Distinct from EmptyState: there is data, the filters just exclude all of it. */
export function NoResultsState({
  onClear,
  className,
}: {
  onClear?: () => void;
  className?: string;
}): React.ReactElement {
  return (
    <EmptyState
      icon={SearchX}
      title="No matching results"
      description="No records match the current search and filters."
      action={
        onClear ? (
          <Button variant="secondary" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        ) : undefined
      }
      className={className}
    />
  );
}

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

function describe(error: unknown): {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  requestId?: string;
  retryable: boolean;
} {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return {
        icon: WifiOff,
        title: 'Connection lost',
        description: 'We could not reach the server. Check your connection and try again.',
        retryable: true,
      };
    }
    if (error.isPermissionError) {
      return {
        icon: ShieldAlert,
        title: 'You do not have access',
        description: 'Your role does not include permission for this action. Ask an administrator for access.',
        ...(error.requestId ? { requestId: error.requestId } : {}),
        retryable: false,
      };
    }
    if (error.isNotFound) {
      return {
        icon: FileQuestion,
        title: 'Not found',
        description: 'This record does not exist, or it belongs to another business.',
        ...(error.requestId ? { requestId: error.requestId } : {}),
        retryable: false,
      };
    }
    return {
      icon: AlertCircle,
      title: 'Something went wrong',
      description: error.message,
      ...(error.requestId ? { requestId: error.requestId } : {}),
      retryable: true,
    };
  }
  return {
    icon: AlertCircle,
    title: 'Something went wrong',
    description: error instanceof Error ? error.message : 'An unexpected error occurred.',
    retryable: true,
  };
}

export function ErrorState({ error, onRetry, className }: ErrorStateProps): React.ReactElement {
  const info = describe(error);
  const Icon = info.icon;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-danger/20 bg-danger-bg px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-danger/10">
        <Icon className="h-5 w-5 text-danger" />
      </div>
      <h3 className="text-h3 text-content">{info.title}</h3>
      <p className="mt-1 max-w-md text-sm text-content-secondary">{info.description}</p>
      {info.requestId && (
        <p className="mt-2 font-mono text-xs text-content-muted">Reference: {info.requestId}</p>
      )}
      {info.retryable && onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}

/** Compact inline variant for panels inside a page that already rendered. */
export function InlineError({ error, onRetry }: ErrorStateProps): React.ReactElement {
  const info = describe(error);
  return (
    <div className="flex items-start gap-2 rounded border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-content-secondary">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <span className="flex-1">{info.description}</span>
      {info.retryable && onRetry && (
        <button type="button" onClick={onRetry} className="font-medium text-danger hover:underline">
          Retry
        </button>
      )}
    </div>
  );
}
