import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { cn } from '@/lib/cn';

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /**
   * When set, the user must type this exact string to enable the confirm button.
   * Reserved for irreversible actions such as voiding an issued invoice.
   */
  typeToConfirm?: string;
}

type Resolver = (confirmed: boolean) => void;

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * Imperative confirmation so destructive handlers read linearly:
 *   if (!(await confirm({ ... }))) return;
 */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setTyped('');
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOptions(null);
    setTyped('');
  }, []);

  const value = useMemo(() => confirm, [confirm]);
  const canConfirm = !options?.typeToConfirm || typed.trim() === options.typeToConfirm;

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog.Root open={options !== null} onOpenChange={(open) => !open && settle(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-gray-900/40 animate-fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-5 shadow-lg animate-zoom-in">
            <div className="flex gap-3">
              {options?.destructive && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-bg">
                  <AlertTriangle className="h-4.5 w-4.5 text-danger" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-h3 text-content">{options?.title}</Dialog.Title>
                {options?.description && (
                  <Dialog.Description asChild>
                    <div className="mt-1.5 text-sm text-content-secondary">{options.description}</div>
                  </Dialog.Description>
                )}
                {options?.typeToConfirm && (
                  <div className="mt-3 space-y-1.5">
                    <label className="block text-xs font-medium text-content-secondary">
                      Type <span className="font-mono text-content">{options.typeToConfirm}</span> to confirm
                    </label>
                    <Input
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      autoFocus
                      autoComplete="off"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className={cn('mt-5 flex justify-end gap-2')}>
              <Button variant="secondary" size="sm" onClick={() => settle(false)}>
                {options?.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant={options?.destructive ? 'danger' : 'primary'}
                size="sm"
                disabled={!canConfirm}
                onClick={() => settle(true)}
              >
                {options?.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmContext.Provider>
  );
}
