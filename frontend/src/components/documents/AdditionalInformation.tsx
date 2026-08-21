import { useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { RichTextEditor, hasContent } from '@/components/ui/RichTextEditor';
import { Checkbox } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Menu';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useBusiness } from '@/stores/BusinessContext';
import { cn } from '@/lib/cn';

export interface AdditionalInformationProps {
  documentType: 'quotation' | 'invoice';
  customNotes: string | null;
  termsAndConditions: string | null;
  includeNotes: boolean;
  includeTerms: boolean;
  onChange: (patch: {
    customNotes?: string | null;
    termsAndConditions?: string | null;
    includeNotes?: boolean;
    includeTerms?: boolean;
  }) => void;
  disabled?: boolean;
}

/**
 * Custom Notes and Terms & Conditions — two independent sections with separate
 * defaults, editors, include toggles and restore actions
 * (docs/12-notes-and-terms.md §6).
 *
 * What is edited here is a snapshot: once saved, changing the business defaults
 * never rewrites this document.
 */
export function AdditionalInformation({
  documentType,
  customNotes,
  termsAndConditions,
  includeNotes,
  includeTerms,
  onChange,
  disabled,
}: AdditionalInformationProps): React.ReactElement {
  const { settings } = useBusiness();
  const confirm = useConfirm();

  const defaultNotes =
    documentType === 'quotation' ? settings.defaultQuotationNotes : settings.defaultInvoiceNotes;
  const defaultTerms =
    documentType === 'quotation' ? settings.defaultQuotationTerms : settings.defaultInvoiceTerms;

  const restore = async (kind: 'notes' | 'terms'): Promise<void> => {
    const current = kind === 'notes' ? customNotes : termsAndConditions;
    const fallback = kind === 'notes' ? defaultNotes : defaultTerms;
    const label = kind === 'notes' ? 'notes' : 'terms';

    // Only prompt when there is something to lose.
    if (hasContent(current)) {
      const confirmed = await confirm({
        title: `Restore default ${label}?`,
        description: (
          <>
            This will replace the current content of this {documentType} with the configured
            business default. Your edits to this {documentType} will be lost.
          </>
        ),
        confirmLabel: 'Restore',
      });
      if (!confirmed) return;
    }

    onChange(kind === 'notes' ? { customNotes: fallback } : { termsAndConditions: fallback });
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-h2 text-content">Additional Information</h2>
        <p className="mt-0.5 text-sm text-content-muted">
          Printed at the end of the document, after totals and payment details. Sections without
          content are not printed.
        </p>
      </div>

      <RichTextSection
        title="Custom Notes"
        description="A short message for this document — a thank-you, a delivery note, anything specific to this customer."
        value={customNotes}
        include={includeNotes}
        hasDefault={hasContent(defaultNotes)}
        disabled={disabled}
        placeholder="Add a note for this document…"
        onValueChange={(value) => onChange({ customNotes: value })}
        onIncludeChange={(value) => onChange({ includeNotes: value })}
        onRestore={() => void restore('notes')}
      />

      <RichTextSection
        title="Terms & Conditions"
        description="The terms that apply to this document. Edited here, they apply only to this document."
        value={termsAndConditions}
        include={includeTerms}
        hasDefault={hasContent(defaultTerms)}
        disabled={disabled}
        placeholder="Add terms and conditions…"
        minHeight={160}
        onValueChange={(value) => onChange({ termsAndConditions: value })}
        onIncludeChange={(value) => onChange({ includeTerms: value })}
        onRestore={() => void restore('terms')}
      />
    </section>
  );
}

function RichTextSection({
  title,
  description,
  value,
  include,
  hasDefault,
  disabled,
  placeholder,
  minHeight = 120,
  onValueChange,
  onIncludeChange,
  onRestore,
}: {
  title: string;
  description: string;
  value: string | null;
  include: boolean;
  hasDefault: boolean;
  disabled?: boolean;
  placeholder: string;
  minHeight?: number;
  onValueChange: (value: string | null) => void;
  onIncludeChange: (value: boolean) => void;
  onRestore: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <Checkbox
          checked={include}
          onCheckedChange={(checked) => onIncludeChange(checked === true)}
          disabled={disabled}
          aria-label={`Include ${title}`}
          id={`include-${title}`}
        />
        <label htmlFor={`include-${title}`} className="cursor-pointer text-h3 text-content">
          Include {title}
        </label>

        <div className="ml-auto flex items-center gap-1">
          <Tooltip
            content={
              hasDefault
                ? 'Replace this document’s content with the business default'
                : 'No business default is configured for this section'
            }
          >
            <span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRestore}
                disabled={disabled || !hasDefault}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore Default
              </Button>
            </span>
          </Tooltip>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            className="rounded p-1.5 text-content-muted hover:bg-subtle hover:text-content"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')} />
          </button>
        </div>
      </div>

      {open && (
        <div className="p-4">
          <p className="mb-2 text-sm text-content-muted">{description}</p>
          <RichTextEditor
            value={value}
            onChange={onValueChange}
            placeholder={placeholder}
            minHeight={minHeight}
            disabled={disabled || !include}
          />
          {!include && hasContent(value) && (
            <p className="mt-2 text-sm text-content-muted">
              This section is kept but will not appear on the document. Tick the box to include it
              again — the content is not lost.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
