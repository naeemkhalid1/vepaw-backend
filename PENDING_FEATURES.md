# VePaw Backend — Pending Features

Design decisions and scenarios agreed on but not yet implemented. Each entry has enough detail to resume work without re-deriving the design.

---

## 1. Clinic request — payment confirmation + receipt confirmation flow

**Context:** Builds on the existing `ClinicDispense` flow (`src/database/schemas/clinic-dispense.schema.ts`, `src/modules/clinic-requests/`, `VetRequestsController` in `src/modules/vet-portal/`). Current state machine: `requested → confirmed → dispensed`, plus `declined`/`cancelled` from `requested` only.

**Gap:** No way to record how/whether payment actually happened, and no owner-side confirmation that the item was actually received — `dispensed` is currently just the vet's unilateral word.

### New statuses to add
`payment_submitted`, `paid`, `completed` — plus widen `declined`/`cancelled` to also be callable from `confirmed`, `payment_submitted`, and `paid` (see Scenario 4).

### Status glossary
| Status | Meaning |
|---|---|
| `requested` | Owner asked for the item. Nothing confirmed yet. |
| `confirmed` | Vet said "yes, I'll have it." No money has moved yet. |
| `payment_submitted` | Owner claims they sent money remotely and uploaded a screenshot as proof. Only exists on the advance-payment path. |
| `paid` | Vet checked their own account, money actually landed, marked it verified. Only exists on the advance-payment path. |
| `dispensed` | Vet physically handed the item over. `paymentMethod` (`cash` \| `card` \| `advance`) gets recorded at this step. |
| `completed` | Owner tapped "I received it" — optional trust signal, not required to close the request. |
| `declined` | Vet said no / can't fulfill. |
| `cancelled` | Owner backed out. |

### Scenario 1 — Cash/card in person (default, most common)
```
requested → confirmed → dispensed → (completed)
```
No screenshot, no `payment_submitted`/`paid` — those are skipped entirely. Vet hands item over and taps "Dispense," picking `paymentMethod = cash | card` as part of that one action.

### Scenario 2 — Advance/remote payment before pickup
```
requested → confirmed → payment_submitted → paid → dispensed → (completed)
```
1. Vet confirms — response includes the vet's payment details (reuse existing `Vet.mobileAccount` / `payoutMethod` / `accountTitle`, already used for platform payouts — no new account field needed).
2. Owner sends money themselves (outside the app), uploads a screenshot as proof → `POST /clinic-requests/:id/submit-payment` (multipart, reuse `S3Service`/`imageUploadOptions`). Stores `paymentProofUrl` + `paymentSubmittedAt`.
3. Vet checks their own account, confirms money landed, marks verified → `POST /vet/requests/:id/mark-paid`. Stores `paidAt`, sets `paymentMethod = advance`.
4. Vet dispenses at pickup — no further payment needed.
5. Owner optionally confirms receipt.

### Scenario 3 — Backs out before any payment
```
requested → declined | cancelled
confirmed → declined | cancelled   (e.g. no-show, vet can't fulfill after all)
```
Clean exit, nothing to reconcile.

### Scenario 4 — Backs out *after* advance payment already sent
```
payment_submitted → declined | cancelled
paid → declined | cancelled
```
The app never processed the payment (it happened directly between owner and vet), so it can't process a refund either. Mark the request declined/cancelled **and** flag `refundRequired: true` so it's visibly different from a no-money-involved cancellation in the vet's queue — a reminder the vet owes a manual refund outside the app.

### Open question before implementing
Scenario 1: should picking `paymentMethod` be **required** on every "Dispense" action (forces the vet to record it every time), or optional metadata? Not yet decided.

### New endpoints needed
- `POST /clinic-requests/:id/submit-payment` (owner, multipart image upload)
- `POST /vet/requests/:id/mark-paid` (vet)
- `POST /clinic-requests/:id/confirm-received` (owner, optional)
- Widen existing `decline`/`cancel` to accept the additional from-states above.

### New fields on `ClinicDispense`
`paymentProofUrl`, `paymentSubmittedAt`, `paidAt`, `paymentMethod: 'cash' | 'card' | 'advance' | null`, `refundRequired: boolean`.

---

## 2. Clinic request — closure path for stale `confirmed` requests

**Context:** Same `ClinicDispense` flow as above.

**Gap:** Once a request is `confirmed`, the only forward transition today is `dispense`. If the owner never shows up, the request sits in `confirmed` forever with no way to close it out, and the chat permanently shows "Confirmed, ready at your next visit."

**Fix:** Allow `decline` from `confirmed` too, not just `requested` — relabel it "Mark unfulfilled" when used from that state. Note this does **not** touch inventory either way, since `Listing.inStock` is only decremented at `dispense`, not at `confirm` — so a stale confirmed request isn't holding up real stock, it's purely a UX/closure gap.

**Not yet decided:** Whether to also auto-flag requests that sit in `confirmed` too long (e.g. "overdue" after N days) — deferred, needs a product call on timing.

This item is superseded/absorbed by item 1 above once that's built (item 1's widened decline/cancel already covers this).
