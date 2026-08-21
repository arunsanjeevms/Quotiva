import { useState } from 'react';
import { Download, Mail, MessageCircle, Pencil, Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { quotationsService, invoicesService } from '@/services/resources';
import { useAppMutation } from '@/hooks/queries';
import { formatMoney } from '@/lib/format';
import { useCurrency } from '@/stores/BusinessContext';
import type { Invoice, Quotation } from '@/types';

type Doc = Quotation | Invoice;

function isInvoice(doc: Doc): doc is Invoice {
  return 'invoiceNumber' in doc;
}

/**
 * PDF, Print, Email and WhatsApp actions shared by quotations and invoices.
 *
 * WhatsApp opens a pre-filled wa.me link — it does not transmit the PDF, and
 * the button copy never implies otherwise (docs/01 §honesty rules,
 * docs/12-notes-and-terms.md §12).
 */
export function DocumentActions({
  doc,
  onEdit,
}: {
  doc: Doc;
  onEdit?: () => void;
}): React.ReactElement {
  const toast = useToast();
  const currency = useCurrency();
  const invoice = isInvoice(doc) ? doc : null;
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(doc.customer.email ?? '');
  const [emailBody, setEmailBody] = useState('');

  const number = invoice ? invoice.invoiceNumber : (doc as Quotation).quotationNumber;
  const canEdit = invoice ? invoice.status === 'draft' : (doc as Quotation).status === 'draft';

  const whatsapp = useAppMutation<{ url: string; message: string }, void>({
    mutationFn: () =>
      invoice ? invoicesService.whatsapp(invoice.id) : quotationsService.whatsapp(doc.id),
    onSuccess: (result) => {
      if (!doc.customer.phone) {
        toast.warning('No phone number on file', 'Add a phone number to this customer to share via WhatsApp.');
        return;
      }
      window.open(result.url, '_blank', 'noopener,noreferrer');
    },
  });

  const send = useAppMutation<Doc, void>({
    mutationFn: () => {
      const body = { to: [emailTo], subject: `${invoice ? 'Invoice' : 'Quotation'} ${number}`, body: emailBody, attachPdf: true };
      return invoice ? invoicesService.send(invoice.id, body) : quotationsService.send(doc.id, body);
    },
    invalidate: ['quotations', 'quotation', 'invoices', 'invoice'],
    successMessage: `Sent to ${emailTo}`,
    onSuccess: () => setEmailOpen(false),
  });

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          toast.info('PDF generation requires the backend', 'Connect the API to download a real PDF.')
        }
      >
        <Download className="h-3.5 w-3.5" />
        PDF
      </Button>
      <Button variant="secondary" size="sm" onClick={() => window.print()}>
        <Printer className="h-3.5 w-3.5" />
        Print
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setEmailOpen(true)}>
        <Mail className="h-3.5 w-3.5" />
        Email
      </Button>
      <Button variant="secondary" size="sm" loading={whatsapp.isPending} onClick={() => whatsapp.mutate()}>
        <MessageCircle className="h-3.5 w-3.5" />
        WhatsApp
      </Button>
      {canEdit && onEdit && (
        <Button variant="secondary" size="sm" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      )}

      <Modal
        open={emailOpen}
        onOpenChange={setEmailOpen}
        title={`Email ${invoice ? 'invoice' : 'quotation'} ${number}`}
        description={`Amount: ${formatMoney(doc.grandTotal, currency)}. The generated PDF is attached automatically.`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEmailOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={send.isPending} onClick={() => send.mutate()}>
              Send
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="To" required>
            {(p) => (
              <Input {...p} type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
            )}
          </Field>
          <Field label="Message" description="A short note added to the standard email template.">
            {(p) => (
              <Textarea {...p} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={4} />
            )}
          </Field>
        </div>
      </Modal>
    </>
  );
}
