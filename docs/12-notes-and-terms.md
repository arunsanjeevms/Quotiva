# 12 — Custom Notes & Terms and Conditions

An integrated feature spanning settings, document editors, sanitization, templates, PDF pagination,
preview, email and WhatsApp. Not a standalone module.

## 1. The six concepts

These are **six distinct values**, never merged into a shared field or a shared editor:

| # | Concept | Stored in |
|---|---|---|
| 1 | Default Quotation Notes | `business_settings.default_quotation_notes` |
| 2 | Default Invoice Notes | `business_settings.default_invoice_notes` |
| 3 | Default Quotation Terms & Conditions | `business_settings.default_quotation_terms` |
| 4 | Default Invoice Terms & Conditions | `business_settings.default_invoice_terms` |
| 5 | This document's Custom Notes | `quotations.custom_notes` / `invoices.custom_notes` |
| 6 | This document's Terms & Conditions | `quotations.terms_and_conditions` / `invoices.terms_and_conditions` |

Notes and Terms are separate sections with separate defaults, separate editors, separate include
toggles, separate Restore Default actions, and separate headings in the rendered document.

Also distinct and unchanged: `payment_instructions` (payment guidance printed with bank details) and
`internal_notes` (never printed, never emailed, staff-only).

## 2. Data model

Already reflected in `03-database-schema.md`:

```sql
-- business_settings
default_quotation_notes  text,
default_invoice_notes    text,
default_quotation_terms  text,
default_invoice_terms    text,
include_notes_by_default boolean not null default true,
include_terms_by_default boolean not null default true,

-- quotations AND invoices (and recurring_invoices)
custom_notes         text,
terms_and_conditions text,
include_notes        boolean not null default true,
include_terms        boolean not null default true,
```

`text` holding **sanitized HTML**. Rationale over a structured/JSON format: the same string feeds
the preview, the PDF (both HTML-rendered via Puppeteer) and optionally the email body, so HTML is
the natural transport. Safety comes from sanitizing on write *and* escaping-by-policy on read
(§5), not from the storage type.

No new tables. The existing document-settings home (`business_settings`) is extended rather than
duplicated.

### Storage limits

`check (length(custom_notes) <= 20000)` and `check (length(terms_and_conditions) <= 50000)` on both
document tables and the four settings columns. Zod enforces the same limits with a friendlier
message. This bounds PDF render time and prevents a stored-payload DoS.

## 3. Snapshot semantics — the critical rule

```
Business default terms (Jan)
        ↓ copied at document CREATE
Invoice created Jan 10  → invoices.terms_and_conditions = Jan text
        ↓
Admin edits default terms (Feb 10)
        ↓
Invoice from Jan 10 still renders the Jan text.   ← required
Invoice created Feb 11 receives the Feb text.
```

Implementation rules:

1. Defaults are resolved **once**, server-side, in `quotationService.create` /
   `invoiceService.create`, when the corresponding document field is `undefined` in the request.
   An explicitly-sent `null` or `""` means "the user cleared it" and is stored as empty — it does
   **not** re-trigger the default.
2. Rendering (`preview`, `pdf`, `email`) reads **only** the document's own columns. There is no
   fallback to `business_settings` at render time anywhere in the codebase — a renderer that
   consults settings is a bug, because it would rewrite history.
3. `include_notes` / `include_terms` are seeded from `include_notes_by_default` /
   `include_terms_by_default` at create time and snapshot the same way.
4. Quotation → invoice conversion copies the **quotation's snapshot**, not the invoice defaults, so
   the customer sees the terms they accepted. The invoice editor can then override them before
   saving, and the conversion is recorded in the audit log with the copied content hash.
5. Recurring invoices: each generated invoice copies from `recurring_invoices`, not from current
   settings, for the same reason. Editing the recurring template affects only future generations.

### Sequence

```
POST /api/invoices  (body omits custom_notes)
   → invoiceService.create
       settings = settingsRepo.get(businessId)
       doc.custom_notes         = body.custom_notes         ?? settings.default_invoice_notes ?? null
       doc.terms_and_conditions = body.terms_and_conditions ?? settings.default_invoice_terms ?? null
       doc.include_notes = body.include_notes ?? settings.include_notes_by_default
       doc.include_terms = body.include_terms ?? settings.include_terms_by_default
       sanitize both, then insert
```

Note `??` (nullish-coalescing on `undefined` only, after Zod has distinguished "absent" from
"explicit null"). Zod schema uses `.optional()` for absent and `.nullable()` for cleared, and the
service branches on `'custom_notes' in body`.

## 4. Settings UI

`Settings → Document Settings` gains two tabbed panels, each with a Quotation and an Invoice editor
side by side (stacked on mobile):

```
Document Settings
├── Notes
│     Default Quotation Notes   [rich text editor]
│     Default Invoice Notes     [rich text editor]
│     ☑ Include notes on new documents by default
└── Terms & Conditions
      Default Quotation Terms   [rich text editor]
      Default Invoice Terms     [rich text editor]
      ☑ Include terms on new documents by default
```

Each panel shows a live A4-width preview of how the block will render in the selected document
template, so an admin can see spacing and list rendering before saving.

An explicit notice under the save button: *"Changing these defaults affects new documents only.
Existing quotations and invoices keep the notes and terms they were saved with."*

Permission: `settings.update` to edit, `settings.read` to view.

## 5. Rich text: editor, schema, sanitization

### Editor

TipTap (ProseMirror) — headless, so it takes the design system's styling rather than importing a
foreign theme, satisfying the "no inconsistent UI libraries" constraint. Wrapped once as
`components/ui/RichTextEditor.tsx` and reused by settings and both document editors.

Toolbar, fixed and minimal: Bold · Italic · Underline · H2 · H3 · Bulleted list · Numbered list ·
Link · Clear formatting. No colors, fonts, sizes, images, or tables — the template controls
typography (§7), and unconstrained styling would break document layout.

### Allowed HTML schema (the single source of truth)

```
p, br, strong, b, em, i, u, s,
h2, h3, h4,
ul, ol, li,
a[href, title],
blockquote, hr
```

Everything else is stripped. Attributes: only `href` and `title` on `<a>`; no `style`, no `class`,
no `id`, no `on*`, no `data-*`.

Link URLs: scheme allowlist `http`, `https`, `mailto`, `tel`. `javascript:`, `data:`, `vbscript:`
and protocol-relative `//` are rejected. Every surviving `<a>` gets `rel="noopener noreferrer nofollow"`
and `target="_blank"` injected server-side.

### Sanitization is server-side and mandatory

```
Client editor (TipTap constrains input — UX only, not a control)
        ↓  POST
Zod: string, length cap
        ↓
sanitizeRichText()  ← isomorphic-dompurify with the schema above, ALLOWED_URI_REGEXP,
        ↓             FORBID_TAGS, FORBID_ATTR; runs on the server, always
Postgres
        ↓
Renderers read the already-sanitized value
```

Rules:

- The sanitizer is one function, `backend/src/utils/sanitizeRichText.ts`, used by **every** write
  path: settings update, quotation create/update, invoice create/update, recurring template,
  import. There is no second implementation.
- Client-side sanitization is not a security control and is not relied upon.
- Content is sanitized **on write**, so a stored value is already safe. Renderers still emit it
  through the one sanctioned raw-HTML seam (§7) and nowhere else.
- Empty-after-sanitize (e.g. `<p></p>`, `<p><br></p>`, whitespace only) is normalized to `NULL`, so
  the empty-section rule in §8 works reliably.
- Sanitizer unit tests cover: `<script>`, `<img onerror>`, `javascript:` href, `<iframe>`,
  `<style>`, event attributes, SVG payloads, nested-encoding tricks, and mutation-XSS strings.

## 6. Document editor UI

Both editors gain a section near the bottom, after items/totals and before the save bar:

```
Additional Information
┌──────────────────────────────────────────────┐
│ ☑ Include Custom Notes      [Restore Default]│
│ ┌──────────────────────────────────────────┐ │
│ │ B I U  H2 H3  • 1.  🔗  ⌫                │ │
│ ├──────────────────────────────────────────┤ │
│ │ Rich text editor                         │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ ☑ Include Terms & Conditions [Restore Default]│
│ ┌──────────────────────────────────────────┐ │
│ │ toolbar                                  │ │
│ ├──────────────────────────────────────────┤ │
│ │ Rich text editor                         │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

Behaviour:

- **On new document** — both editors load pre-filled with the current defaults for that document
  type (fetched with the rest of the editor's bootstrap data; no extra round trip).
- **On edit of an existing document** — both load the document's stored snapshot. The defaults are
  not consulted.
- **Edit** — free editing within the allowed schema.
- **Clear** — the toolbar's clear button empties the editor; saving stores `NULL`. Clearing is
  persistent and is not re-filled from defaults on the next open.
- **Restore Default** — replaces editor content with the **current** business default for that
  document type, after confirmation:

  > **Restore default terms?**
  > This will replace the current content of this document with the configured business default.
  > Your edits to this document will be lost.
  > `[Cancel] [Restore]`

  The confirm appears whenever the editor is dirty or non-empty; on an already-empty editor it
  restores without prompting. Restore is a client-side content swap — nothing is persisted until
  the document is saved.
- **Include checkbox unchecked** — the editor collapses to a muted, disabled state showing the
  retained content. The content is **kept in the database**, so re-checking restores it without
  retyping; only rendering is suppressed. This is why `include_*` is a separate boolean rather than
  nulling the text.
- Both sections are collapsible; collapsed state persists per user in localStorage. On mobile they
  render as full-width stacked cards with the same toolbar, horizontally scrollable if needed.

Unsaved-changes guard: navigating away with a dirty editor triggers the standard confirm dialog.

## 7. Template support

Every document template (Classic, Modern, Minimal, Professional, Compact) implements the same
named block sequence. Adding notes/terms requires no code change by an administrator.

```
header          → logo, business identity
parties         → business details, customer details
meta            → number, dates, currency
items           → item table
totals          → subtotal, discounts, tax, charges, grand total
payment         → bank / UPI / payment instructions
notes           → "Notes"                heading + rich text     ← this feature
terms           → "Terms & Conditions"   heading + rich text     ← this feature
footer          → configurable business footer,
                  then "Designed and Developed by Arun Sanjeev M S"
```

The two new blocks are partials (`_notes.hbs`, `_terms.hbs`) shared by all five templates. Each
template supplies its own CSS for `.doc-notes` / `.doc-terms`, controlling heading font, size,
weight, letter-spacing, spacing above/below, alignment, divider rule, and background fill — so a
Minimal template can render a plain heading while Professional renders a tinted panel with a rule.

Rich-text content is emitted through the **single sanctioned raw-HTML seam**: a `{{{safeHtml}}}`
helper that asserts the value came from `sanitizeRichText` (checked via a branded TS type
`SanitizedHtml`) and throws otherwise. No other triple-stash exists in any template.

Typography inside the blocks is normalized by template CSS so an editor's `<h2>` never outgrows the
document's own headings:

```css
.doc-terms :is(h2,h3,h4) { font-size: 1em; font-weight: 600; margin: .6em 0 .2em; }
.doc-terms ol, .doc-terms ul { margin: 0 0 0 1.2em; padding: 0; }
.doc-terms li { margin: .15em 0; }
.doc-terms p { margin: 0 0 .4em; }
.doc-terms a { color: inherit; text-decoration: underline; }
```

## 8. Empty-content behaviour

A block renders **only if** `include_* = true` **and** the sanitized content is non-empty.
Otherwise the entire block — heading, divider, spacing, container — is omitted. No empty box, no
orphan heading, no residual margin.

The template condition is a single helper, `hasContent(html)`, which strips tags and entities and
tests for remaining non-whitespace text (so `<p><br></p>` counts as empty). Content is additionally
normalized to `NULL` at write time (§5), so this is belt-and-braces.

If both blocks are omitted, the payment block flows directly into the footer with no gap.

## 9. PDF pagination — the final-page requirement

This is the hardest part of the feature and is specified precisely.

### Requirement

Notes and Terms appear **at the end of the document**, after items, totals and payment information,
and before the footer. They must never overflow the page, be clipped, overlap the footer, the
totals, or the item table, and must never render partially.

### Mechanism

Puppeteer renders real CSS paged media, so pagination is CSS-driven and deterministic — not
JavaScript measurement.

```css
/* the Additional Information group */
.doc-additional {
  /* keep Notes + Terms together on one page when they reasonably fit */
  break-inside: avoid-page;
}

/* but allow natural overflow when the content is genuinely long */
.doc-additional.is-long { break-inside: auto; }

/* each block prefers to stay whole */
.doc-notes,
.doc-terms { break-inside: avoid-page; }
.doc-notes.is-long,
.doc-terms.is-long { break-inside: auto; }

/* a heading never ends a page alone */
.doc-notes > h2,
.doc-terms > h2 { break-after: avoid-page; }

/* list items never split mid-item; widow/orphan control on prose */
.doc-terms li, .doc-notes li { break-inside: avoid; }
.doc-terms p,  .doc-notes p  { orphans: 3; widows: 3; }

/* totals and payment blocks likewise stay whole */
.doc-totals, .doc-payment { break-inside: avoid-page; }
```

`break-inside: avoid-page` on `.doc-additional` is what produces the required behaviour: if the
group does not fit in the remaining space on the current page, the paged-media engine moves the
**whole group** to a new page rather than splitting it after the last item. This is exactly
"finish current content → new page → render Additional Information".

### The `is-long` escape hatch

`break-inside: avoid` on a box taller than one page is undefined-ish across engines and can clip.
So the backend measures before rendering:

1. Render the document once with Puppeteer.
2. Measure `.doc-additional` height and the usable page height (page height − margins − header −
   footer) via `page.evaluate`.
3. If `additionalHeight > usablePageHeight * 0.9`, add class `is-long` to `.doc-additional` (and to
   whichever child block individually exceeds the threshold) and re-render.
4. With `is-long`, the group is allowed to flow naturally across pages; the per-`li` and
   orphan/widow rules keep the break points sensible, so Terms may continue onto the next page
   starting at item 6, with the footer correct on every page.

This costs one extra render only for documents with unusually long terms. The measurement result is
cached per (document id, updated_at, template) alongside the generated PDF.

### Footer overlap

The footer is a Puppeteer `footerTemplate` with a reserved bottom margin (`margin.bottom` ≥ footer
height + 8mm), so page content physically cannot occupy the footer band. Content overlap is
therefore structurally impossible, not merely avoided by spacing. `displayHeaderFooter: true` with
`headerTemplate`/`footerTemplate` carrying the business footer text, page counter
(`<span class="pageNumber"></span> / <span class="totalPages"></span>`), and the fixed
"Designed and Developed by Arun Sanjeev M S" line per the selected template.

### Verification

A fixture suite renders and asserts, per template × {A4, Letter}:

| Fixture | Assertion |
|---|---|
| 3 items, short notes + short terms | all on page 1, nothing clipped |
| items filling ~95% of page 1, short notes + terms | Additional Information moved whole to page 2 |
| 60 items, medium terms | terms on the final page, not split across the totals |
| 200-line terms | flows across ≥2 pages, `is-long` applied, every page has a footer |
| notes only | terms block absent entirely |
| terms only | notes block absent entirely |
| both empty | neither block, no gap before footer |
| terms with nested lists and links | lists numbered correctly, links styled, no raw tags |

Assertions run by extracting text and layout boxes from the produced PDF and checking no content
box intersects the footer band, and that no block is split when it fits.

## 10. Preview parity

The preview endpoint returns the **same HTML** the PDF renderer consumes, displayed in an
`<iframe srcdoc>` sized to the configured page width with the same print CSS applied via
`@media print` plus a screen-mode page simulation. Because both outputs originate from one template
render, the block order — Payment → Notes → Terms → Footer — is identical by construction.

The preview additionally renders page boundaries (a visual page break indicator) using the same
measurement pass as §9, so a user sees notes landing on the final page in the preview exactly as
the PDF will place them. Preview cannot show notes on page 1 while the PDF puts them on page 2.

## 11. Email

`POST /api/invoices/:id/send` attaches the generated PDF, which is the source of truth for the full
document. The email **body** is the configured email template and may optionally include the
document's Custom Notes via a `{{custom_notes}}` token, at the template author's discretion.

- Terms & Conditions are **not** inserted into the email body by default — they belong in the PDF.
  A `{{terms_and_conditions}}` token exists for admins who explicitly want it, and is documented as
  producing long emails.
- Tokens emit the same sanitized HTML, re-sanitized against a stricter email-safe schema (no `<hr>`,
  inline styles added for mail-client compatibility).
- The email never duplicates the item table or totals — a short summary plus the attachment.

## 12. WhatsApp

The `wa.me` deep-link message stays short and **never** contains the terms. Template:

```
Hello {customer_name},

Please find {document_type} {document_number}.

{amount_line}
{due_date_line}

Thank you,
{business_name}
```

Optionally, a **short custom message** the user types in the share dialog (capped at 300 characters)
may be appended. Document Custom Notes are not auto-inserted; if the user wants a line from them
they can paste it. Everything is `encodeURIComponent`-encoded, and the rich text is converted to
plain text (tags stripped, list items to `- ` / `1. `) before any inclusion.

UI copy remains honest: the action opens WhatsApp with a prepared message; it does not send the PDF.

## 13. API surface

No new endpoints. Existing ones extend:

```
GET  /api/settings/documents          → adds the four defaults + two include flags
PUT  /api/settings/documents          → validates + sanitizes them; requires settings.update

POST /api/quotations                  → accepts custom_notes, terms_and_conditions,
PUT  /api/quotations/:id                       include_notes, include_terms
POST /api/invoices                    → same
PUT  /api/invoices/:id                → same

GET  /api/quotations/:id/preview      → HTML including the two blocks
GET  /api/quotations/:id/pdf          → PDF with final-page placement
(and the invoice equivalents)

GET  /api/settings/documents/defaults?type=quotation|invoice
     → the current defaults, used by the editor's "Restore Default" action
```

Zod for the document bodies:

```ts
const richText = z.string().max(50_000).nullable();
custom_notes:         richText.optional(),   // absent → apply default; null → cleared
terms_and_conditions: richText.optional(),
include_notes:        z.boolean().optional(),
include_terms:        z.boolean().optional(),
```

`business_id`, totals and status remain stripped as always.

## 14. Security & tenancy

Nothing about this feature relaxes existing controls:

- `business_settings` reads/writes stay behind RLS (`settings.read` / `settings.update`) and the
  backend's tenant middleware; defaults are fetched with `req.business.id`, never a body value.
- Document notes/terms live on the existing `quotations` / `invoices` rows and inherit those tables'
  RLS policies unchanged — no new table, no new policy surface.
- The stored-HTML columns are the reason §5's server-side sanitization is mandatory: this is the
  application's primary stored-XSS surface, rendered into the preview iframe, the PDF, and
  potentially an email client.
- Audit: `settings.updated` records which of the four defaults changed (content hashes, not full
  bodies, to keep the log readable); `invoice.updated` / `quotation.updated` record whether
  notes/terms changed and whether include flags flipped.
- Length caps (§2) bound render cost; the PDF rate limit (`04-rls-and-security.md` §7) bounds abuse
  of the double-render path in §9.

## 15. Acceptance criteria

- [ ] Admin configures default quotation notes, invoice notes, quotation terms, invoice terms — four
      independent editors.
- [ ] New quotations receive quotation defaults; new invoices receive invoice defaults.
- [ ] Users edit, clear, or restore defaults per document; Restore Default confirms first.
- [ ] Clearing persists — the default does not silently return.
- [ ] Include toggles suppress rendering while retaining stored content.
- [ ] Changing a business default does not alter any existing document.
- [ ] Quotation → invoice conversion carries the quotation's snapshot.
- [ ] Empty or disabled sections render nothing — no heading, box, or spacing.
- [ ] PDF renders bold, italic, underline, headings, bulleted and numbered lists, links, paragraph
      spacing and line breaks; never raw tags.
- [ ] Notes and Terms appear after payment information and before the footer.
- [ ] The group moves whole to a new page when it does not fit the current one.
- [ ] Very long terms flow across pages with correct footers on each.
- [ ] No content ever overlaps the footer, totals, or item table.
- [ ] Preview page placement matches the PDF.
- [ ] Emailed PDFs contain the correct snapshot; email bodies do not duplicate the document.
- [ ] WhatsApp messages stay short and exclude the terms.
- [ ] Malicious HTML is stripped on write; sanitizer test suite passes.
- [ ] Tenant isolation and RLS behave exactly as before; verification script in
      `04-rls-and-security.md` §8 still passes.
