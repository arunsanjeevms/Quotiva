import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { humanize } from '@/lib/format';
import type { InvoiceStatus, PaymentState, QuotationStatus } from '@/types';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-subtle text-content-secondary',
        success: 'border-success/20 bg-success-bg text-success',
        warning: 'border-warning/20 bg-warning-bg text-warning',
        danger: 'border-danger/20 bg-danger-bg text-danger',
        info: 'border-info/20 bg-info-bg text-info',
        primary: 'border-primary/20 bg-primary-subtle text-primary',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps): React.ReactElement {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/**
 * One status→tone mapping for the whole app, so a "sent" quotation looks the
 * same everywhere. Color is always paired with the text label — never the sole
 * carrier of meaning.
 */
const QUOTATION_TONES: Record<QuotationStatus, BadgeTone> = {
  draft: 'neutral',
  sent: 'info',
  viewed: 'info',
  accepted: 'success',
  rejected: 'danger',
  expired: 'warning',
  cancelled: 'neutral',
  converted: 'primary',
};

const INVOICE_TONES: Record<InvoiceStatus, BadgeTone> = {
  draft: 'neutral',
  sent: 'info',
  viewed: 'info',
  cancelled: 'neutral',
  void: 'neutral',
};

const PAYMENT_TONES: Record<PaymentState, BadgeTone> = {
  unpaid: 'warning',
  partially_paid: 'info',
  paid: 'success',
  overdue: 'danger',
};

export function QuotationStatusBadge({ status }: { status: QuotationStatus }): React.ReactElement {
  return <Badge tone={QUOTATION_TONES[status]}>{humanize(status)}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }): React.ReactElement {
  return <Badge tone={INVOICE_TONES[status]}>{humanize(status)}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentState }): React.ReactElement {
  return <Badge tone={PAYMENT_TONES[status]}>{humanize(status)}</Badge>;
}
