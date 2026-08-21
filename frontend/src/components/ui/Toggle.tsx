import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, Minus } from 'lucide-react';
import { forwardRef, useId } from 'react';
import { cn } from '@/lib/cn';

export const Checkbox = forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-surface transition-colors',
      'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="text-primary-fg">
      {props.checked === 'indeterminate' ? (
        <Minus className="h-3 w-3" strokeWidth={3} />
      ) : (
        <Check className="h-3 w-3" strokeWidth={3} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

export interface CheckboxFieldProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  label: React.ReactNode;
  description?: React.ReactNode;
}

export function CheckboxField({
  label,
  description,
  className,
  ...props
}: CheckboxFieldProps): React.ReactElement {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <Checkbox id={id} className="mt-0.5" {...props} />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-base text-content">
          {label}
        </label>
        {description && <p className="text-sm text-content-muted">{description}</p>}
      </div>
    </div>
  );
}

export const Switch = forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
      'data-[state=checked]:bg-primary data-[state=unchecked]:bg-line-strong',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

export interface SwitchFieldProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label: React.ReactNode;
  description?: React.ReactNode;
}

export function SwitchField({
  label,
  description,
  className,
  ...props
}: SwitchFieldProps): React.ReactElement {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-base font-medium text-content">
          {label}
        </label>
        {description && <p className="mt-0.5 text-sm text-content-muted">{description}</p>}
      </div>
      <Switch id={id} {...props} />
    </div>
  );
}
