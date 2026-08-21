import { createContext, useContext, useId } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/cn';

interface FieldContextValue {
  id: string;
  descriptionId: string;
  errorId: string;
  hasError: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

function useField(): FieldContextValue {
  const ctx = useContext(FieldContext);
  if (!ctx) throw new Error('Field subcomponents must be used inside <Field>');
  return ctx;
}

export interface FieldProps {
  label?: React.ReactNode;
  /** Help text, replaced by the error message when one is present. */
  description?: React.ReactNode;
  error?: string | undefined;
  required?: boolean;
  className?: string;
  children: React.ReactNode | ((props: FieldControlProps) => React.ReactNode);
}

export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': boolean | undefined;
}

/**
 * Wraps a control with its label, help text and error, wiring the aria plumbing.
 * Labels sit above inputs; errors replace help text (docs/07 §6).
 */
export function Field({
  label,
  description,
  error,
  required,
  className,
  children,
}: FieldProps): React.ReactElement {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const hasError = Boolean(error);

  const controlProps: FieldControlProps = {
    id,
    'aria-describedby': hasError ? errorId : description ? descriptionId : undefined,
    'aria-invalid': hasError || undefined,
  };

  return (
    <FieldContext.Provider value={{ id, descriptionId, errorId, hasError }}>
      <div className={cn('space-y-1.5', className)}>
        {label && (
          <LabelPrimitive.Root
            htmlFor={id}
            className="block text-xs font-medium text-content-secondary"
          >
            {label}
            {required && <span className="ml-0.5 text-danger">*</span>}
          </LabelPrimitive.Root>
        )}
        {typeof children === 'function' ? children(controlProps) : children}
        {hasError ? (
          <p id={errorId} className="text-xs font-normal text-danger">
            {error}
          </p>
        ) : description ? (
          <p id={descriptionId} className="text-xs font-normal text-content-muted">
            {description}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export function FieldLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>): React.ReactElement {
  const { id } = useField();
  return (
    <LabelPrimitive.Root
      htmlFor={id}
      className={cn('block text-xs font-medium text-content-secondary', className)}
      {...props}
    />
  );
}

export const Label = LabelPrimitive.Root;
