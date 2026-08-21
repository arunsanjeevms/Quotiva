import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastRecord extends Required<Pick<ToastOptions, 'title' | 'tone' | 'duration'>> {
  id: number;
  description?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  toast: (options: ToastOptions) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const TONE_CONFIG: Record<ToastTone, { icon: typeof Info; className: string; iconClass: string }> = {
  success: { icon: CheckCircle2, className: 'border-success/25', iconClass: 'text-success' },
  error: { icon: AlertCircle, className: 'border-danger/25', iconClass: 'text-danger' },
  warning: { icon: TriangleAlert, className: 'border-warning/25', iconClass: 'text-warning' },
  info: { icon: Info, className: 'border-info/25', iconClass: 'text-info' },
};

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [items, setItems] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const record: ToastRecord = {
      id: (nextId += 1),
      title: options.title,
      tone: options.tone ?? 'info',
      duration: options.duration ?? 5000,
      ...(options.description ? { description: options.description } : {}),
      ...(options.action ? { action: options.action } : {}),
    };
    setItems((prev) => [...prev.slice(-3), record]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ title, tone: 'success', ...(description ? { description } : {}) }),
      error: (title, description) => toast({ title, tone: 'error', duration: 8000, ...(description ? { description } : {}) }),
      warning: (title, description) => toast({ title, tone: 'warning', ...(description ? { description } : {}) }),
      info: (title, description) => toast({ title, tone: 'info', ...(description ? { description } : {}) }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-full max-w-sm flex-col gap-2"
        role="region"
        aria-label="Notifications"
      >
        {items.map((item) => (
          <ToastItem key={item.id} record={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  record,
  onDismiss,
}: {
  record: ToastRecord;
  onDismiss: (id: number) => void;
}): React.ReactElement {
  const config = TONE_CONFIG[record.tone];
  const Icon = config.icon;

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(record.id), record.duration);
    return () => window.clearTimeout(timer);
  }, [record.id, record.duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live={record.tone === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-surface p-3 shadow-lg animate-slide-in-top',
        config.className,
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', config.iconClass)} />
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-content">{record.title}</p>
        {record.description && (
          <p className="mt-0.5 text-sm text-content-secondary">{record.description}</p>
        )}
        {record.action && (
          <button
            type="button"
            onClick={() => {
              record.action?.onClick();
              onDismiss(record.id);
            }}
            className="mt-1.5 text-sm font-medium text-primary hover:underline"
          >
            {record.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(record.id)}
        aria-label="Dismiss"
        className="-mr-0.5 -mt-0.5 rounded p-1 text-content-muted hover:bg-subtle hover:text-content"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
