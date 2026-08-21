# 06 — Financial Calculation Engine

The single normative specification for money arithmetic. One implementation:
`backend/src/services/calculation/`. No other file computes a total.

## 1. Absolute rules

1. **No native floating point for money, ever.** No `+`, `-`, `*`, `/` on monetary numbers. Use
   `decimal.js` (`Decimal`) throughout. `0.1 + 0.2 !== 0.3` is not an acceptable failure mode on an
   invoice.
2. **Money crosses process boundaries as strings.** JSON responses emit `"1234.5600"`, not
   `1234.56`. The frontend formats; it never sums.
3. **Client totals are discarded.** Every request that carries items is recalculated server-side
   from `quantity`, `unit_price`, discount and tax inputs. Any `line_total`, `tax_amount`,
   `subtotal` or `grand_total` in a request body is stripped by Zod before the service sees it.
4. **Tax and price inputs are re-resolved from the database.** A request supplies `taxId`; the
   engine reads that tax's rate from `taxes` (verifying it belongs to the business). It does not
   trust a `taxRate` in the body. For catalog items, `unit_price` may be overridden by the user —
   that is a legitimate business action and is allowed — but the tax rate is not client-supplied.
5. **Storage is `numeric(18,4)`.** Never `float8`.

## 2. Rounding

`R(x)` = round half-up (away from zero) to `d` decimals, where `d = business_settings.decimal_places`
(default 2, range 0–4). `decimal.js` configured `ROUND_HALF_UP`.

Rounding is applied at exactly two boundaries:

- **B1** — each item's `line_total`, and its `tax_amount` and `discount_amount`.
- **B2** — each document total component: `subtotal`, `document_discount_amount`, `taxable_amount`,
  each per-rate tax total, `additional_charges_total`, `grand_total`.

Intermediate values (`line_subtotal` before discount, per-component tax before summation) are
carried at full precision and stored at 4dp. Document totals are the sum of **already-rounded** item
values, which guarantees the printed line items add up to the printed subtotal — the property
customers actually check.

## 3. Item pipeline

Given `quantity q`, `unit_price p`, item discount `(dType, dValue)`, tax rate `r` (%), and the
document's `tax_mode`:

```
line_subtotal = q × p                                     (full precision)

discount_amount =
    dType = 'percentage' → line_subtotal × dValue / 100
    dType = 'fixed'      → dValue                          (a per-line absolute amount)
    dType = null         → 0
discount_amount = min(discount_amount, line_subtotal)      ← never negative-total a line
discount_amount = R(discount_amount)                        [B1]

net = line_subtotal − discount_amount
```

### Exclusive tax (`tax_mode = 'exclusive'`)

```
taxable_amount = net
tax_amount     = R(taxable_amount × r / 100)               [B1]
line_total     = R(taxable_amount + tax_amount)            [B1]
```

### Inclusive tax (`tax_mode = 'inclusive'`)

`net` already contains the tax. Back it out:

```
taxable_amount = net / (1 + r/100)                          (full precision)
tax_amount     = R(net − taxable_amount)                    [B1]
taxable_amount = R(net − tax_amount)                        ← derived from the rounded tax so
                                                              taxable + tax == net exactly
line_total     = R(net)                                     [B1]
```

Deriving `taxable_amount` back from the rounded `tax_amount` is deliberate: it makes
`taxable + tax = line_total` hold to the cent, which naïve independent rounding does not.

### No tax (`tax_mode = 'none'` or `r = 0`)

```
taxable_amount = net;  tax_amount = 0;  line_total = R(net)
```

### Multi-component taxes

When the tax has rows in `tax_components`, `r = Σ component.rate` and the per-component amounts are
allocated from the **rounded** total tax by largest-remainder, so components sum exactly to
`tax_amount`:

```
for each component i:  raw_i = tax_amount × rate_i / Σrates
                       amt_i = floor to d decimals
    remainder = tax_amount − Σ amt_i
    distribute remainder in units of 10^-d to components with the largest fractional parts
```

Stored in `*_items.tax_breakdown` as `[{ name, rate, amount }]` so the document can print the split
and the tax report can group by component.

## 4. Document pipeline

```
subtotal            = R( Σ item.line_subtotal )                        [B2]
item_discount_total = R( Σ item.discount_amount )                      [B2]
net_items           = Σ item.(taxable_amount + tax_amount)   → i.e. Σ item.line_total

document_discount_amount =
     discountType='percentage' → R( (Σ item.net) × discountValue / 100 )
     discountType='fixed'      → R( min(discountValue, Σ item.net) )
     null                      → 0

additional_charges_total = R( Σ charge.amount )
charge_tax_total         = R( Σ R(charge.amount × charge.rate / 100) )  for taxable charges

tax_total     = R( Σ item.tax_amount ) + charge_tax_total  − document_discount_tax_relief
taxable_amount= R( Σ item.taxable_amount ) − document_discount_taxable_relief

grand_total   = R( Σ item.line_total
                   − document_discount_amount
                   + additional_charges_total
                   + charge_tax_total )
```

### Document-level discount and tax

A document-level discount reduces the taxable base, so tax must be recomputed, not left stale.
The discount is **allocated proportionally back across items** by each item's `taxable_amount`
share, using largest-remainder so allocations sum exactly to `document_discount_amount`. Each item's
tax is then recomputed on its reduced base, and the deltas roll up into
`document_discount_tax_relief`.

This allocation is also what makes the **tax report** correct: taxable base per rate must reflect
discounts actually given, or reported tax will not match tax collected.

Items with `tax_rate = 0` still receive a discount allocation (they just generate no relief).

### Presentation order (documents and UI both)

```
Subtotal
− Discount            (item discounts + document discount, shown separately when both exist)
= Taxable Amount
+ Tax                 (broken down per rate / per component)
+ Additional Charges
= Grand Total
```

## 5. Input validation (rejected before calculation)

| Input | Rule | Error |
|---|---|---|
| `quantity` | `> 0`, ≤ 1,000,000, ≤ 4 dp | `VALIDATION_ERROR` |
| `unit_price` | `≥ 0`, ≤ 1,000,000,000, ≤ 4 dp | `VALIDATION_ERROR` |
| percentage discount | `0 ≤ v ≤ 100` | `VALIDATION_ERROR` — **>100% is rejected, not clamped** |
| fixed discount (item) | `≥ 0`; capped at `line_subtotal` during calculation | capped silently, surfaced in the response |
| fixed discount (document) | `≥ 0`; capped at item net total | capped, surfaced |
| tax rate | from DB, `0 ≤ r ≤ 100` | `VALIDATION_ERROR` on the tax record |
| charge amount | may be negative (a credit line) but `grand_total ≥ 0` must hold | `VALIDATION_ERROR` |
| item count | 1–500 per document | `VALIDATION_ERROR` |
| empty document | at least one item required to leave `draft`; a draft may have zero items | `VALIDATION_ERROR` on send/convert |

Zero-quantity and zero-price are rejected for quantity, allowed for price (a genuinely free line
item is a real business case; a zero-quantity line is a data-entry error).

Caps are surfaced in the response `meta.adjustments` so the UI can tell the user "fixed discount
reduced to the line subtotal" rather than silently changing their number.

## 6. Payment status derivation

Computed **only** on the server, inside the transaction that touches payments, and by the overdue
sweep. Never accepted from a request.

```
paid       = Σ payments.amount  where invoice_id = X and is_voided = false
amount_due = R( grand_total − paid )

payment_status =
   invoice.status ∈ ('cancelled','void')                → status unchanged, excluded from AR
   grand_total = 0                                      → 'paid'
   paid = 0                                             → 'unpaid'
   paid ≥ grand_total                                   → 'paid'      (paid_at = last payment date)
   0 < paid < grand_total                               → 'partially_paid'

then, overlaying:
   payment_status ∈ ('unpaid','partially_paid')
     and due_date is not null and due_date < today      → 'overdue'
```

`overdue` is an overlay on unpaid/partially-paid, not a separate accumulation state. A payment that
clears an overdue invoice moves it straight to `paid`.

Over-payment is **rejected** (`OVERPAYMENT`) rather than producing a credit balance — credit notes
are an explicit non-goal (`01-overview.md`), so silently creating a negative balance would be a
feature we cannot represent. The error returns `details.outstanding` so the UI can offer the exact
maximum.

The overdue sweep is a service function `invoiceService.refreshOverdue(businessId)` run on dashboard
load and by `/reminders/run`; it is a single `UPDATE … WHERE due_date < current_date AND
payment_status IN ('unpaid','partially_paid')`, so it is cheap and idempotent.

## 7. Worked examples (these are the unit-test fixtures)

Currency decimals `d = 2`, round half-up.

### E1 — Exclusive tax, percentage item discount

`q=3, p=100.00, discount 10%, tax 18%`

```
line_subtotal  = 300.0000
discount       = 30.0000
net            = 270.0000
taxable        = 270.00
tax            = 270.00 × 0.18 = 48.60
line_total     = 318.60
```

### E2 — Inclusive tax

`q=1, p=118.00, no discount, tax 18%, mode=inclusive`

```
net        = 118.0000
taxable_raw= 118 / 1.18 = 100.000000
tax        = R(118 − 100) = 18.00
taxable    = R(118 − 18.00) = 100.00
line_total = 118.00                    ← taxable + tax == line_total ✓
```

### E3 — Inclusive tax, awkward rounding

`q=1, p=100.00, tax 7.5%, mode=inclusive`

```
taxable_raw = 100 / 1.075 = 93.02325581…
tax         = R(100 − 93.02325581) = R(6.97674419) = 6.98
taxable     = R(100 − 6.98) = 93.02
line_total  = 100.00                   ← 93.02 + 6.98 = 100.00 ✓
```
(Independent rounding would have given 93.02 + 6.98 = 100.00 here but 93.02 + 6.97 in other cases;
the derived form is what guarantees it.)

### E4 — Multi-component tax

`net = 1000.00`, tax "Combined 18%" = components A 9% + B 9%

```
tax_amount = 180.00
raw_A = 90.00, raw_B = 90.00  → amt_A = 90.00, amt_B = 90.00, remainder 0
breakdown = [{A, 9, 90.00}, {B, 9, 90.00}]
```

With an odd split (A 5%, B 12.5%, total 17.5%, tax_amount = 175.00 on 1000):

```
raw_A = 175 × 5/17.5   = 50.000000  → 50.00
raw_B = 175 × 12.5/17.5= 125.000000 → 125.00   sum 175.00 ✓
```

### E5 — Document discount redistributes tax

Two items: I1 net 1000 @ 18%, I2 net 500 @ 5%. Document discount 10%.

```
item net total          = 1500.00
document_discount       = 150.00
allocation by taxable share: I1 → 100.00, I2 → 50.00
recomputed taxable: I1 900.00, I2 450.00
recomputed tax:     I1 162.00, I2  22.50   (was 180.00 and 25.00)
tax_total  = 184.50
taxable    = 1350.00
grand_total= 1350.00 + 184.50 = 1534.50
```

The tax report for this period shows base 900 @ 18% and 450 @ 5% — matching the tax actually
charged.

### E6 — Fixed discount larger than subtotal

`line_subtotal = 200.00`, fixed item discount `500` → discount capped at `200.00`, `net = 0`,
`tax = 0`, `line_total = 0.00`. Response `meta.adjustments` reports the cap. Never negative.

### E7 — Percentage discount above 100%

`discountValue = 120`, type percentage → rejected with `VALIDATION_ERROR`
(`items.0.discountValue: must be between 0 and 100`). No document is created.

### E8 — Partial payments

`grand_total = 1000.00`; payments 400.00 then 350.00.

```
after p1: paid 400.00, due 600.00, status partially_paid
after p2: paid 750.00, due 250.00, status partially_paid
p3 of 300.00 → rejected OVERPAYMENT, details.outstanding = "250.0000"
p3 of 250.00 → paid 1000.00, due 0.00, status paid, paid_at = p3.payment_date
void p2      → paid 650.00, due 350.00, status partially_paid (or overdue if past due)
```

### E9 — Large values

`q = 999999, p = 999999999.99` → `line_subtotal = 999998999000.01` (fits `numeric(18,4)`;
`decimal.js` precision set to 34 significant digits). Formatting must not switch to exponential
notation — the formatter uses `toFixed(d)`, never `toString()`.

### E10 — Zero-total invoice

All items free (`p = 0`). `grand_total = 0.00` → `payment_status = 'paid'` immediately, no payment
record required, `amount_due = 0.00`.

## 8. Engine API

```ts
// backend/src/services/calculation/index.ts
export function calculateItem(input: ItemInput, ctx: CalcContext): CalculatedItem;
export function calculateDocument(input: DocumentInput, ctx: CalcContext): CalculatedDocument;
export function derivePaymentStatus(invoice: InvoiceTotals, payments: Payment[], today: Date): PaymentDerivation;

interface CalcContext {
  decimalPlaces: number;         // from business_settings
  taxMode: TaxMode;
  taxes: Map<string, TaxWithComponents>;   // pre-loaded, business-scoped
}
```

Pure functions: no database access, no clock (today is injected), no config lookup. That makes the
whole engine trivially unit-testable, and every fixture in §7 is a test case. Repositories load the
context; services call the engine; controllers never touch it.

The frontend has a **display-only mirror** (`frontend/src/lib/calc.ts`) used to show live totals in
the editor before saving. It is explicitly labelled as an estimate, uses the same `decimal.js`
logic, and is never the source of persisted values. If the server's recalculation differs, the
server's numbers replace the editor's on save — and a diff beyond one rounding unit is logged as a
bug signal.
