# 07 — Frontend Design System

Professional light theme. The reference point is a commercial business application — dense,
legible, restrained — not a tutorial dashboard.

## 1. Principles

- **Restraint.** No gradients on surfaces, no decorative illustration, no animated cards. Motion is
  limited to 120–180 ms opacity/transform on overlays and 0 ms on data updates.
- **Density.** Tables show ~12 rows without scrolling at 1080p. Padding is tight and consistent, not
  generous.
- **One accent.** The business's primary color appears on primary buttons, active nav, focus rings,
  links, and chart series 1 — nowhere else. Everything else is neutral grays plus semantic colors.
- **Typography carries hierarchy**, not color or size jumps. Three weights, four sizes on most
  screens.
- **Every surface has all five states**: loading (skeleton), empty, error, success, and content.

## 2. Tokens

Defined as CSS custom properties on `:root` and consumed by Tailwind via
`theme.extend.colors: { primary: 'rgb(var(--color-primary) / <alpha-value>)' }`.

```css
:root {
  /* neutrals — the interface is built from these */
  --gray-50:#F8FAFC; --gray-100:#F1F5F9; --gray-200:#E2E8F0; --gray-300:#CBD5E1;
  --gray-400:#94A3B8; --gray-500:#64748B; --gray-600:#475569; --gray-700:#334155;
  --gray-800:#1E293B; --gray-900:#0F172A;

  /* surfaces */
  --bg-app:      var(--gray-50);
  --bg-surface:  #FFFFFF;
  --bg-subtle:   var(--gray-100);
  --border:      var(--gray-200);
  --border-strong: var(--gray-300);

  /* text */
  --text-primary:   var(--gray-900);
  --text-secondary: var(--gray-600);
  --text-muted:     var(--gray-500);
  --text-inverse:   #FFFFFF;

  /* brand — overwritten at runtime from business_branding */
  --color-primary:   37 99 235;     /* rgb triplet */
  --color-secondary: 71 85 105;
  --color-primary-hover: …;          /* derived: darken 8% */
  --color-primary-subtle: …;         /* derived: 8% tint for backgrounds */

  /* semantic */
  --success:#15803D; --success-bg:#F0FDF4;
  --warning:#B45309; --warning-bg:#FFFBEB;
  --danger:#B91C1C;  --danger-bg:#FEF2F2;
  --info:#1D4ED8;    --info-bg:#EFF6FF;

  /* spacing scale: 4 8 12 16 20 24 32 40 48 64 */
  --radius-sm:4px; --radius:6px; --radius-lg:8px; --radius-xl:12px;
  --shadow-sm: 0 1px 2px rgb(15 23 42 / .05);
  --shadow:    0 1px 3px rgb(15 23 42 / .08), 0 1px 2px rgb(15 23 42 / .04);
  --shadow-lg: 0 10px 24px rgb(15 23 42 / .10);
}
```

### Runtime branding

`BrandingProvider` reads `business_branding` and writes `--color-primary` / `--color-secondary` as
rgb triplets onto `document.documentElement`, then swaps `<link rel="icon">` to the signed favicon
URL and sets `document.title` to the business name. Derived hover/subtle variants are computed in
JS on the same pass. Branding is therefore data — a color change takes effect on the next render
with no rebuild.

Contrast guard: if the chosen primary fails 4.5:1 against white, button label color flips to
`--gray-900` automatically and the settings UI warns the admin.

### Typography

Inter (self-hosted in `public/fonts`, `font-display: swap`), tabular numerals enabled for all
money and quantity cells (`font-variant-numeric: tabular-nums`) so columns align.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `display` | 24/32 | 600 | page titles |
| `h2` | 18/28 | 600 | section headings, modal titles |
| `h3` | 15/24 | 600 | card headings |
| `body` | 14/20 | 400 | default |
| `sm` | 13/18 | 400 | table cells, secondary text |
| `xs` | 12/16 | 500 | labels, badges, table headers (uppercase, 0.04em tracking) |

## 3. Component inventory

Built once in `components/ui/`, used everywhere. No second button, no ad-hoc modal.

**Primitives** — `Button` (variants: primary, secondary, ghost, danger, link; sizes sm/md; loading
state with spinner replacing the label, width preserved), `IconButton`, `Input`, `Textarea`,
`Select`, `Combobox` (searchable, async, used for customer/product pickers), `DatePicker`,
`DateRangePicker`, `Checkbox`, `RadioGroup`, `Switch`, `NumberInput` (locale-aware, tabular),
`MoneyInput` (currency-aware prefix/suffix, string-valued), `FileUpload` (drag-drop, type/size
validation mirroring the backend, progress), `RichTextEditor` (TipTap, see `12-notes-and-terms.md`).

**Layout & structure** — `Card` (header/body/footer slots), `Tabs`, `Accordion`, `Divider`,
`PageHeader` (title, breadcrumb, actions slot), `SectionHeader`, `DescriptionList`, `Timeline`,
`StatTile`, `Toolbar` (search + filters + actions row above tables).

**Data** — `DataTable`: column definitions, server-side sort/paginate, sticky header, row selection,
per-row action menu, column visibility, and a **responsive card mode** below `md` where each row
collapses into a stacked key/value card with the primary field as the card title. `Pagination`,
`EmptyState`, `ErrorState`, `Skeleton` (text, row, card, chart variants), `StatusBadge` (maps
document/payment status to semantic color, one mapping shared app-wide).

**Overlays** — `Modal` (sm/md/lg/xl, focus trap, ESC, backdrop click configurable),
`Drawer` (right-side; used for quick-view of an invoice from a list),
`Dropdown` / `Menu`, `Popover`, `Tooltip`, `ConfirmDialog` (title, body, destructive variant,
typed-confirmation option for void/cancel), `Toast` (queue, four severities, action slot).

**Charts** — thin Recharts wrappers (`LineChart`, `BarChart`, `DonutChart`) with a shared theme:
one categorical palette derived from the brand primary plus neutral-distinct hues, gridlines at
`--gray-200`, no 3D, no drop shadows, always an accessible legend and an empty state.

**Documents** — `LineItemEditor` (the core of both editors), `TotalsPanel`, `DocumentPreviewFrame`
(iframe + srcdoc), `DocumentActions` (Edit / PDF / Print / Email / WhatsApp), `CurrencyDisplay`.

## 4. Layout

```
┌────────────┬──────────────────────────────────────────────┐
│            │ Topbar: global search · notifications · user │
│  Sidebar   ├──────────────────────────────────────────────┤
│  240px     │ PageHeader: title · breadcrumb · actions      │
│            ├──────────────────────────────────────────────┤
│  (collapse │ Content (max-width 1440, px-24)               │
│   to 64px) │                                              │
│            ├──────────────────────────────────────────────┤
│            │ Footer: Designed and Developed by Arun        │
│            │         Sanjeev M S                          │
└────────────┴──────────────────────────────────────────────┘
```

### Sidebar

Exactly this tree, with collapsible groups (expanded state persisted per user):

```
Dashboard
Sales ▸ Quotations · Invoices · Payments · Recurring Invoices
Customers
Catalog ▸ Products · Services · Categories · Units · Taxes
Reports ▸ Sales · Invoices · Quotations · Payments · Customers · Taxes
Settings ▸ Business Profile · Branding · Invoice Settings · Quotation Settings ·
           Numbering · Currency · Payment Settings · Email · Notifications ·
           Templates · Custom Fields · Users & Roles · Security · Audit Logs · Backup
```

Items the user lacks permission for are hidden (not disabled). A group with no visible children is
hidden entirely. The backend enforces the same rules independently.

Responsive: ≥`lg` fixed 240px with a collapse toggle to a 64px icon rail (tooltips on hover);
`md`–`lg` starts collapsed; `<md` becomes an overlay drawer opened from a topbar hamburger, closing
on navigation, with a backdrop and focus trap.

### Topbar

Global search (`⌘K` / `Ctrl+K`) opening a command palette that queries `/api/search` with a 250 ms
debounce and groups results by type; notification bell with unread count and a dropdown list; user
menu (profile, change password, business switcher when the user belongs to several, logout).

### Footer

Every authenticated page renders, in muted 12px, centered:

> Designed and Developed by Arun Sanjeev M S

This is fixed application chrome. It is **not** the configurable `business_settings.default_footer`,
which appears only on generated documents. Both may be visible at once on a preview screen and that
is correct.

## 5. Page patterns

**List page** — PageHeader (title + primary action) → Toolbar (search, status filter, date range,
customer filter, export) → DataTable → Pagination. Filters are reflected in the URL query string so
a filtered view is shareable and survives refresh. Skeleton rows on first load; a subtle top
progress bar on refetch (never a full-page spinner on refetch).

**Detail page** — PageHeader with status badge and an action menu → summary strip (key facts) →
Tabs. Customer detail tabs: Overview · Quotations · Invoices · Payments · Activity. Document detail
tabs: Preview · Items · Payments (invoices) · History.

**Editor page** (quotation/invoice) — the most important screen:

```
PageHeader: New Invoice            [Save Draft] [Preview] [Save & Send]
┌───────────────────────────────┬──────────────────────┐
│ Customer  [Combobox] [+ New]  │  Summary (sticky)    │
│ Dates · Currency · Reference  │  Subtotal            │
├───────────────────────────────┤  Discount            │
│ Items                         │  Taxable             │
│ ┌───────────────────────────┐ │  Tax (per rate)      │
│ │ # Description  Qty Unit   │ │  Charges             │
│ │   Price Disc Tax  Amount  │ │  ─────────           │
│ └───────────────────────────┘ │  Grand Total         │
│ [+ Add Item] [+ Custom Item]  │                      │
│ Additional Charges            │                      │
├───────────────────────────────┴──────────────────────┤
│ Additional Information                                │
│   Custom Notes         [rich text] [Restore Default]  │
│   Terms & Conditions   [rich text] [Restore Default]  │
└───────────────────────────────────────────────────────┘
```

Item rows are keyboard-navigable (Tab across fields, Enter adds a row, ⌘⌫ removes). Adding an item
opens a combobox with two modes in one control: search the catalog, or switch to **Add Custom Item**
which requires no catalog record and offers a "Save as Product/Service" checkbox. On mobile, each
item becomes an expandable card (description + amount collapsed, fields expanded on tap) and the
totals panel docks to the bottom as a summary bar that expands on tap.

**Settings pages** — a secondary left nav inside the Settings shell, forms in cards with a sticky
save bar that appears only when dirty, and per-section permission gating.

## 6. Forms

React Hook Form + Zod resolver. Schemas live in `frontend/src/schemas/` and mirror the backend's
validators field for field (shared shapes where practical, duplicated where the backend needs more).

- Labels above inputs; help text below; errors replace help text in `--danger`.
- Required fields marked with an asterisk; optional fields are the default and unmarked.
- Server validation errors are mapped onto fields by their `details[].path` and focus moves to the
  first error.
- Submit buttons disable while pending and show the loading state; double-submit is impossible.
- Dirty forms guard navigation with a ConfirmDialog.

## 7. States

Every module implements all of:

- **Skeleton** — matching the real layout's shape (table rows, stat tiles, chart block), never a
  spinner for initial page load.
- **Empty** — icon, one-line headline, one-line explanation, primary action:

  > **No invoices yet**
  > Create your first invoice to start tracking your business transactions.
  > `[Create Invoice]`

  Filtered-empty is distinct: "No invoices match these filters. `[Clear filters]`".
- **Error** — what failed, the request id, and a Retry button. Network vs permission vs server
  errors get different copy.
- **Success** — toast with a link to the created record; destructive successes are toasts, not
  modals.

## 8. Document templates

Five templates — **Classic, Modern, Minimal, Professional, Compact** — implemented as HTML + CSS in
`backend/src/templates/documents/`, shared by preview and PDF (`02-architecture.md` §"one template,
two outputs").

Every template implements the same named block sequence and receives the same view model:

```
header · parties · meta · items · totals · payment · notes · terms · footer
```

with these guarantees: business logo (or a graceful text fallback when absent), full business and
customer details, document number and dates, item table with per-item discount and tax columns
(columns auto-hidden when no item uses them), tax breakdown per rate, discounts, totals, payment
details, notes, terms, configurable business footer. Page size A4 or Letter from settings.

Character: Classic = serif headings, ruled table, formal. Modern = brand-colored header band, sans,
airy. Minimal = no rules, whitespace-led. Professional = tinted panels, strong hierarchy, densest
information. Compact = smaller type and tighter rows for long item lists.

Print/paged CSS (repeated table headers, break rules, footer band) is specified once in
`12-notes-and-terms.md` §9 and applies to all templates.

## 9. Formatting

One module, `frontend/src/lib/format.ts`, driven entirely by `business_settings`:

```ts
formatMoney("1234.5")   // → "₹ 1,234.50" | "$1,234.50" | "1.234,50 €" per configuration
formatNumber(qty)
formatDate(iso)         // per business date_format
formatDateTime(iso)     // per timezone
```

`formatMoney` composes symbol, position, thousand separator, decimal separator and decimal places
from settings — never `Intl.NumberFormat` with a hardcoded locale, and never a hardcoded currency.
It takes and returns strings; it performs no arithmetic.

## 10. Accessibility

Semantic HTML; visible focus rings (`--color-primary`, 2px offset) never removed; all overlays trap
focus and restore it on close; modals labelled by their heading; tables use real `<th scope>`;
icon-only buttons carry `aria-label`; toasts announce via `aria-live="polite"`, errors via
`assertive`; color is never the sole carrier of meaning (status badges pair color with text);
contrast ≥ 4.5:1 for text, enforced for the configurable brand color by the guard in §2.
