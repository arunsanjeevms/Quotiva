import { Info } from 'lucide-react';
import { SettingsPanel, useDraft } from './shared';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { SwitchField } from '@/components/ui/Toggle';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Menu';
import { useAppMutation } from '@/hooks/queries';
import { settingsService } from '@/services/resources';
import { useBusiness } from '@/stores/BusinessContext';

interface Draft {
  defaultQuotationNotes: string | null;
  defaultInvoiceNotes: string | null;
  defaultQuotationTerms: string | null;
  defaultInvoiceTerms: string | null;
  includeNotesByDefault: boolean;
  includeTermsByDefault: boolean;
}

/**
 * The four independent business-level defaults (docs/12-notes-and-terms.md §4).
 *
 * Notes and Terms are separate concepts with separate defaults per document
 * type — never one shared field. Editing them affects new documents only.
 */
export function NotesAndTermsSettings(): React.ReactElement {
  const { settings } = useBusiness();

  const { draft, setDraft, dirty, reset } = useDraft<Draft>({
    defaultQuotationNotes: settings.defaultQuotationNotes,
    defaultInvoiceNotes: settings.defaultInvoiceNotes,
    defaultQuotationTerms: settings.defaultQuotationTerms,
    defaultInvoiceTerms: settings.defaultInvoiceTerms,
    includeNotesByDefault: settings.includeNotesByDefault,
    includeTermsByDefault: settings.includeTermsByDefault,
  });

  const save = useAppMutation<unknown, void>({
    mutationFn: () => settingsService.updateSettings(draft),
    invalidate: ['bootstrap'],
    successMessage: 'Document defaults saved',
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info-bg px-3 py-2.5 text-sm text-content-secondary">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <span>
          Changing these defaults affects <strong>new documents only</strong>. Existing quotations
          and invoices keep the notes and terms they were saved with, so historical documents never
          change after the fact.
        </span>
      </div>

      <SettingsPanel
        title="Notes"
        description="A short message loaded into new documents. Users can edit or remove it per document."
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onReset={reset}
      >
        <div className="space-y-5">
          <Tabs defaultValue="quotation">
            <TabsList>
              <TabsTrigger value="quotation">Quotation notes</TabsTrigger>
              <TabsTrigger value="invoice">Invoice notes</TabsTrigger>
            </TabsList>
            <TabsContent value="quotation">
              <RichTextEditor
                value={draft.defaultQuotationNotes}
                onChange={(value) => setDraft({ ...draft, defaultQuotationNotes: value })}
                placeholder="Default note for new quotations…"
                minHeight={140}
              />
            </TabsContent>
            <TabsContent value="invoice">
              <RichTextEditor
                value={draft.defaultInvoiceNotes}
                onChange={(value) => setDraft({ ...draft, defaultInvoiceNotes: value })}
                placeholder="Default note for new invoices…"
                minHeight={140}
              />
            </TabsContent>
          </Tabs>

          <div className="border-t border-line pt-4">
            <SwitchField
              label="Include notes on new documents by default"
              description="Users can still switch this off for an individual document."
              checked={draft.includeNotesByDefault}
              onCheckedChange={(checked) => setDraft({ ...draft, includeNotesByDefault: checked })}
            />
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Terms & Conditions"
        description="The terms loaded into new documents. Separate from notes, with its own default per document type."
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onReset={reset}
      >
        <div className="space-y-5">
          <Tabs defaultValue="quotation">
            <TabsList>
              <TabsTrigger value="quotation">Quotation terms</TabsTrigger>
              <TabsTrigger value="invoice">Invoice terms</TabsTrigger>
            </TabsList>
            <TabsContent value="quotation">
              <RichTextEditor
                value={draft.defaultQuotationTerms}
                onChange={(value) => setDraft({ ...draft, defaultQuotationTerms: value })}
                placeholder="Default terms for new quotations…"
                minHeight={200}
              />
            </TabsContent>
            <TabsContent value="invoice">
              <RichTextEditor
                value={draft.defaultInvoiceTerms}
                onChange={(value) => setDraft({ ...draft, defaultInvoiceTerms: value })}
                placeholder="Default terms for new invoices…"
                minHeight={200}
              />
            </TabsContent>
          </Tabs>

          <div className="border-t border-line pt-4">
            <SwitchField
              label="Include terms on new documents by default"
              description="Users can still switch this off for an individual document."
              checked={draft.includeTermsByDefault}
              onCheckedChange={(checked) => setDraft({ ...draft, includeTermsByDefault: checked })}
            />
          </div>
        </div>
      </SettingsPanel>
    </div>
  );
}
