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
1. Vet confirms — response includes the vet's payment details (reuse existing `Clinic.walletNumber` / `bankName` / `accountNumber` / `payoutMethod` / `accountTitle` — as of 2026-07-21 these replaced the old single `Clinic.mobileAccount` field, see §3 below — already used for platform payouts, no new account field needed).
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

---

## 3. Vet + store payout — automated disbursement (deferred, intentionally)

**Context:** As of 2026-07-21 the entire payout *system* is built and production-ready for **both vets and stores**: each stores a validated payout account (`payoutMethod: 'jazzcash' | 'easypaisa' | 'bank_transfer'` + `walletNumber`/`bankName`+`accountNumber` + `accountTitle`, all conditionally validated in the DTOs — `Clinic` for vets, `Store` for stores); a real `Payout` ledger record is created either by clicking "withdraw" or automatically every Monday 00:00 Asia/Karachi (`VetPortalService.autoBatchWeeklyPayouts()` / `StorePortalService.autoBatchWeeklyStorePayouts()` — the vet version aggregates per-clinic via `resolveClinicVetIds()` so multi-staff clinics get one combined batch; the store version is simpler since a `Store` is single-entity, no staff aggregation needed); admin sees one unified pending-payouts queue across both (`GET /admin/payouts?status=`, `entityType: 'vet' | 'store'`) and manually confirms the transfer was sent (`POST /admin/payouts/:id/settle`); every payout-account change and every payout requested/settled event is captured in `PayoutAccountAudit` (shared schema, `entityType` distinguishes which) and surfaced as one merged timeline per entity (`GET /vet/clinic-settings/payout/activity`, `GET /store/settings/payout/activity`).

Vet-side access is restricted to `admin_vet`/`manager` (`@ClinicRoles` + `ClinicRolesGuard`); stores have no multi-staff role structure, so store-portal payout routes are just `@Roles('store')`, no additional gate needed.

Store's `availableToWithdraw` becomes eligible **immediately on delivery** (`status: 'delivered'` + `paymentStatus: 'paid'`) — no dispute-window hold, unlike appointments' 3-hour delay. Confirmed as the intended behavior for now; revisit if store-side disputes become common enough to warrant one.

**Gap — the one deliberately unfinished piece, for both entity types:** the step "money actually leaves the platform's account and lands in the vet's/store's JazzCash/bank account" is still a **manual, human action** by the admin, done outside the app, before they click "mark as settled." Neither Safepay (confirmed via their SDK + public docs — no payout/disbursement product exists) nor this codebase can move money out automatically today.

**Decision:** deliberately deferred rather than half-built against undocumented APIs — do not start the code integration below until the account/credentials exist.

### What has to happen first (outside this codebase)
1. Open a **corporate account** with JazzCash or EasyPaisa (their "Corporate Disbursement Solutions" product — separate from the personal-wallet or collection-side products) — requires business registration docs, NTN, a company bank account; typically a days-to-weeks onboarding with their business team.
2. Get **disbursement API credentials** (merchant/corporate ID, API key/secret, sandbox + production) directly from the provider's account team — not publicly documented the way their collection APIs are.
3. **Pre-fund the corporate wallet** — these APIs debit from a wallet balance you top up ahead of time, not your bank account in real time.
4. Confirm **per-transaction/per-day limits** on the account tier cover expected weekly payout volume (vets + stores combined).
5. Decide JazzCash, EasyPaisa, or both. Bank-transfer accounts (`payoutMethod: 'bank_transfer'`, either entity type) are **out of scope** for this — that needs a separate, heavier 1LINK/bank-IBFT integration and should stay on the manual path even after wallet disbursement is automated.

### Code integration to build once the above exists
1. New service mirroring `SafepayService`'s pattern (`src/common/payments/safepay.service.ts`) — wraps the chosen provider's disbursement API (auth, submit payout, check status).
2. Config additions via `ConfigService`/`.env`, same convention as `SAFEPAY_*`.
3. Wire into `AdminService.settlePayout()` (`src/modules/admin/admin.service.ts`) — this already handles both `entityType`s generically, so one integration point covers vets and stores. Call the disbursement API with the entity's `walletNumber` (resolved from `Clinic` or `Store` depending on `entityType`) + `Payout.amount` instead of (or before) the admin manually typing in a `transactionReference`; auto-fill it from the provider's response.
4. Handle **async settlement** — these APIs are typically "submit now, confirmed later via webhook." `Payout.status` already has an unused `'processing'` value for exactly this transition; needs a webhook receiver following the same pattern as `appointments-webhook.controller.ts`/`consultations-webhook.controller.ts`/`store-webhook.controller.ts` to flip `processing` → `completed` (or a failed state) when the provider confirms.
5. Failure/retry handling — a bounced disbursement (bad account number, insufficient float) must fall back into the pending queue with a visible reason, never silently disappear.

---

## 4. Appointment cancellation — no real Safepay refund (found 2026-07-22). **DONE (2026-07-29).**

**Context:** `AppointmentsService.cancelAppointment()` sets `paymentStatus: 'refunded'` as a status label only — `SafepayService` has no `refund` method call anywhere in the appointments flow, so no money actually moves. The exact same gap existed a second, independent time in `VetPortalService.updateAppointmentStatus()` (the vet-side cancel path).

**Why this was inconsistent, not just incomplete:** store orders got a real fix for the equivalent gap on 2026-07-22 — `StoreService.autoCancelUnconfirmedPaidOrders()` calls a genuine `SafepayService.refundPayment(trackerToken, amountPKR)` (wraps the SDK's `client.order.cancel.refund()`, confirmed live against Safepay's sandbox — note the API requires `amount`+`currency` explicitly, it rejects a refund request with neither). Appointments never got the equivalent, so a cancelled, previously-paid appointment showed `paymentStatus: 'refunded'` to the owner without a single rupee actually moving.

**Fix shipped 2026-07-29, in both places:** both `cancelAppointment()` and `updateAppointmentStatus()` now call `safepayService.refundPayment(paymentReference, fee)` before committing the status change to `'cancelled'`, guarded to `paymentMethod === 'safepay' && paymentStatus === 'held'`. On refund failure, the appointment is left in its prior status (not committed to `'cancelled'`) so the caller can retry, rather than the old claim-then-revert pattern used by the store cron — appropriate here since this is a synchronous user-initiated action, not an unattended batch job. `VetPortalService` needed `SafepayService` newly injected (`PaymentsModule` added to `vet-portal.module.ts`).

**Consultations' cancellation path checked — no equivalent gap.** `ConsultationsService.cancelConsultation()` only allows cancelling from `status: 'pending_payment'` (i.e. before any Safepay payment has landed) — once payment is submitted it explicitly routes through the dispute flow instead, so there was never a "cancelled after paying, no refund" case to fix here. (The dispute-reject path setting `refundRequired: true` with nothing ever consuming that flag is a separate, already-known gap, not this one.)

---

## 5. Clinic-identity cascade broke phone-based login for multi-staff clinics (found 2026-07-22, needs a decision)

**Context:** as of 2026-07-21/22, a clinic's `admin_vet`/`manager` can update `clinicName`/`phone`/`address`/`city`/`area`, and the write cascades to every other staff `Vet` in the same clinic (see `ARCHETECTURE.md` §3). This correctly unifies the clinic's public business identity — but `AuthService.login()` looks up a vet via a bare `vetModel.findOne({ $or: [{email},{phone}] })`, which silently assumed `phone` was unique per person. Once 2+ staff share one phone number (by design now), `findOne` returns whichever record Mongo hands back first, and everyone else's phone-based login attempts fail with a generic "Invalid credentials" — even when they typed their own correct password — because it's really checking it against the wrong account.

**Confirmed live:** in a real 3-person clinic (admin_vet + team_vet + manager, all sharing one cascaded phone number), only the admin_vet's phone-based login worked; the manager's failed until logging in with email instead.

**Not yet decided — needs a product/eng call, not a quiet patch:**
- **Option A — email-only login for team_vet/manager.** No schema change. Simplest, but limits login UX for anyone who doesn't have their email handy (mirrors how `AuthService.login()` already works today for anyone who happens to type a shared phone).
- **Option B — separate "personal login phone" field**, distinct from the clinic's shared public `phone`. Real schema change (`Vet` needs a second phone-like field), migration to backfill it from the current `phone` value before the first cascade touches it, and a decision on whether it's ever shown publicly or purely internal.
- **Option C — disambiguate at login time** (e.g. ask which clinic/person when a phone matches multiple accounts) — more UI work, and awkward for a single-field login form.

No code changes made for this yet — flagging so it doesn't get silently forgotten the next time someone doing a demo can't figure out why a manager's login "isn't working."

---

## 6. Vet identity is a single flat record — no support for one person at multiple/changing clinics (found 2026-07-28, needs a design decision, not a patch)

**Context:** `Vet` conflates "who the person is" with "which clinic they currently work at" into one document with a single `clinicId` field and a globally-`unique: true` `email`. There is no separate person-level identity and no clinic-affiliation/membership concept at all — the two established-industry building blocks (see below) don't exist in this schema in any form.

**Confirmed broken, concretely, by tracing the actual code (not theoretical):**
- **~~Invite acceptance crashes ugly, not clean, for an already-registered email.~~ Fixed 2026-07-28 (Option A below).** `VetPortalService.acceptInvite()` now pre-checks `vetModel.findOne({email})` before creating, throwing a clean `409 EMAIL_ALREADY_REGISTERED` instead of letting Mongo's unique-index error crash through as a raw `500`. The `create()` call is also wrapped in a try/catch for the same duplicate-key error, closing the narrow race window between the pre-check and the insert. Verified live: attempting to accept an invite with an already-registered email now returns a clean `409` with an actionable message, the invite correctly stays `pending` (not consumed by the failed attempt) rather than being marked accepted, and the normal accept path was re-verified working. `store-portal`'s `acceptInvite()` was checked too — it never calls `create()` at all (just flips the invite status), so it was never at risk of this crash; nothing to change there.
- **Admin approval silently no-ops instead of doing what was asked.** In `AdminService.updateVetApplicationStatus()`, when an application's email already belongs to an existing `Vet`, the code reactivates that *same* record rather than creating anything new — and if `existing.clinicId` is already set (i.e. they're already staff somewhere), the "create a clinic" branch is skipped entirely. The applicant's submitted new-clinic details (name, address, payout info) are silently discarded. The admin approving it has no signal that nothing new was actually created — it just looks like a normal approval. **Still open** — Option A only covered the invite-accept crash, not this path.
- **No "leave a clinic" flow exists anywhere.** `clinicId` is set once (at invite-accept or approval) and never explicitly cleared or transferred by any code path in the repo. There's no offboarding/departure concept to build a real fix for the above on top of even if we wanted to. **Still open.**

**Why this matters (established-industry pattern, for context on the fix shape):** mature multi-tenant healthcare platforms (Epic, Cerner/Oracle Health, Athenahealth, and vet-specific practice management software like Covetrus/IDEXX Neo) universally separate a **Person/Provider identity** (anchored to something like a license number — VePaw already has `pvmcNumber` for exactly this, just isn't using it as the identity key) from **Facility/Clinic affiliations** (a many-to-many join, each with its own role, schedule, and status — active/former). This is also the standard shape for "locum tenens"/relief-vet work, which is common in veterinary medicine specifically: one provider, multiple *concurrent* clinic affiliations, something the current single-`clinicId` design can't represent even in theory.

**Decision status:**
- **Option A — minimal: catch the duplicate-key error cleanly. DONE (2026-07-28).** Smallest possible fix, shipped — see above. Explicitly does *not* fix the underlying model; the admin-approval silent-discard bug and the "can't actually join a second clinic" limitation are both still open, on purpose, pending a real decision below.
- **Option B — real identity/affiliation split.** Split `Vet` into a person-level identity (name, credentials, `pvmcNumber` as the real unique key, login credential) and a separate `ClinicAffiliation` join (vet ↔ clinic, role, status, joined/left dates). Matches the industry pattern properly, supports multi-clinic and locum-style work, and gives a real place to build a "leave clinic" flow. Real schema migration — touches every query that currently assumes one `Vet` doc = one clinic (schedule, payouts, reviews, appointments, `resolveClinicVetIds()`), so this is a significant re-architecture, not a small patch. **Not decided.**
- **Option C — narrower middle ground: allow the *same person* only after explicitly leaving their prior clinic.** Add a real "leave clinic" action that clears `clinicId`/`staffRole` on the existing record (with an audit trail of the departure), so the *existing* single-`clinicId` model can still represent "used to be at A, now at B" sequentially — just not concurrently. Cheaper than Option B, doesn't require a schema split, but still can't represent simultaneous multi-clinic work and needs careful handling of what happens to their historical appointments/reviews at clinic A. **Not decided.**

Option A's fix means the *immediate* crash is gone, but it's a symptom patch, not a resolution — the admin-approval silent-discard bug and the total absence of a "leave clinic" flow are still real, undecided gaps. Don't mistake "the 500 is fixed" for "this is solved."

---

## 7. Store subscriptions — no recurring billing engine at all (found 2026-07-29, blocked on a Safepay capability question)

**Context:** `src/modules/subscriptions/` is a dead empty shell (8-line controller, 4-line service, zero routes, zero schema) — the real subscription logic actually lives in `StoreService`, reusing `Order` with `isSubscription: true` plus `interval`/`nextOrderDate` fields already on the schema. `StoreService.createSubscription()` (`store.service.ts:259-317`) creates exactly **one** `Order` with `status: 'active'` — its own comment admits *"no recurring billing engine exists yet... nothing here calls Safepay to actually charge on an ongoing basis."* Nothing anywhere ever creates a second billing cycle. A customer "subscribing" today gets charged once, and then nothing happens again, ever.

**Two more bugs found in the same area, independent of the missing engine:**
- `UpdateSubscriptionDto` only allows `status: 'paused' | 'cancelled'` — there is no `'active'` option, so **a paused subscription can never be resumed** via the customer-facing endpoint.
- `StorePortalService.updateSubscriptionStatus()` (`store-portal.service.ts:1112-1119`) is worse: `status: status === 'paused' || status === 'cancelled' ? 'cancelled' : 'confirmed'` — a store owner "pausing" a subscription from their dashboard actually **cancels it outright**, and the only other branch writes `'confirmed'` (not even `'active'`), which isn't a meaningful subscription state at all.
- Reporting is entirely fake regardless of the above: `monthlyRecurring: 'PKR 0'`, `dueThisWeek: 0`, `activePlansChange: 0` are hardcoded (`store-portal.service.ts:289-293`), and `frequency: 'Monthly'` (`store-portal.service.ts:269`) is a hardcoded literal regardless of the subscription's actual `interval`.

### The blocking question: can Safepay charge without a customer present?

Every payment in this codebase today goes through `SafepayService.createCheckoutSession()` → `payments.session.setup()` — a hosted checkout **redirect**, no exception, confirmed by reading `safepay.service.ts` directly. But the installed SDK (`@sfpy/node-core`) also exposes an entirely unused `order.vault.session()` / `order.vault.card()` API plus `customers.paymentMethods` / `user.cards` resources — so Safepay does support saving a card. What's **not answerable from the SDK alone** (its types are all untyped `params?: any`) is whether a vaulted card can then be charged **server-to-server with no customer present** — the "merchant-initiated transaction" primitive every real subscription product needs. This needs Safepay's actual API docs or their integration team, not more code-reading — same category of external dependency as the JazzCash/EasyPaisa disbursement gap in item 3, but should only take a docs/support question, not a business-onboarding process.

### Two designs, depending on the answer

- **Option A — true card-on-file (preferred, if Safepay's Vault supports merchant-initiated charges).** Customer vaults a card once at signup; a cron charges it automatically each cycle with no redirect and no customer action — standard Netflix/Spotify-style UX. Needs a vault-session flow at subscription creation and a stored card/customer token on the subscription record.
- **Option B — recurring reminder + re-checkout (fallback, works today with zero new Safepay capability).** N days before `nextOrderDate`, notify the customer and send them through the existing `createCheckoutSession()` flow again, same as a one-off order. Ships faster, but real friction — a "subscription" that requires manually re-checking-out every cycle has poor renewal completion in practice.

**Not decided — recommend confirming with Safepay before building the engine**, since the retry/failure/dunning shape differs meaningfully between "a charge silently failed" (A) and "the customer never clicked the link" (B).

### Full build list once the above is answered
1. **Real `Subscription` schema**, separate from `Order`. Today one `Order` document is asked to represent both "the recurring plan" and "one shipment" at once — that conflation is *why* pause/resume is broken. A `Subscription` record (product, qty, interval, `nextChargeDate`, `paymentMethod`, vaulted-card-token-if-A, `status: active|paused|cancelled`, `failedAttempts`) should be the source of truth; each billing cycle spawns a **new** `Order` reusing `placeOrder()`'s existing logic — including the atomic stock-reservation fix already shipped (`StoreService.reserveStock()`/`restoreStock()`, 2026-07-29) — rather than mutating one `Order` forever.
2. **Daily billing cron**: find subscriptions where `nextChargeDate <= now && status === 'active'`, attempt charge, on success create that cycle's `Order` (stock-checked the same way a normal order is — decide the policy for a recurring item that's gone permanently out of stock: skip-and-notify vs. auto-pause), advance `nextChargeDate`, reset failure count.
3. **Dunning policy** (needs a product decision): standard shape is retry after e.g. 1/3/7 days, notify the customer on each failure, auto-pause after N consecutive failures rather than silently dropping the subscription.
4. **Fix pause/resume properly** — add `'active'` as a valid target status to `UpdateSubscriptionDto`, and remove the collapse-to-cancelled bug in `store-portal.service.ts:1115`. This is a real bug independent of the Option A/B decision above.
5. **Cancellation policy decision**: does cancelling mid-cycle refund the current period, or just stop future charges? Would reuse the same `SafepayService.refundPayment()` pattern already wired for appointments/store orders.
6. **Notifications**: pre-charge reminder (especially load-bearing for Option B), charge-succeeded receipt, charge-failed alert, paused/cancelled confirmation.
7. **Make store-portal reporting real** — `monthlyRecurring`, `dueThisWeek`, `activePlansChange` all need real aggregations once cycles actually recur; `frequency: 'Monthly'` needs to read the actual `interval`.
8. **Decide the fate of `src/modules/subscriptions/`** — delete the dead empty shell, or actually move the logic there instead of leaving it split across `StoreService`.

No code changes made for this yet — purely a planning/scoping pass, blocked on the Safepay Vault question above before implementation should start.

---

## 8. Store order delivery — platform stops at "dispatched," last-mile is the store's own responsibility (decided 2026-07-30)

**Context:** While auditing the store-order status-update endpoints (see the ownership/cancel-only fix shipped the same day, `StoreService.cancelOrder()`), it came up that the only place `rider` (name/phone) was ever collected was the unrestricted customer-facing endpoint that just got locked down to cancel-only — meaning nothing in the system can currently capture rider info on dispatch at all, and `StorePortalService.updateOrderStatus()` (the correct, store-scoped place fulfillment transitions belong) has no rider field in its DTO either.

**Decision:** the platform does **not** manage last-mile delivery in any form — no rider assignment, no rider fee, no delivery tracking, no platform-side rider marketplace. A store arranges delivery entirely on their own (their own staff, a courier they hire) outside the app. The platform's job ends at the transaction: order placed, payment handled, commission taken, order handed off to the store to fulfill however they see fit.

**What this means concretely:**
- `Order.rider` (name/phone) stays a purely optional, informational courtesy field if a store wants the customer to know who's coming — never required to progress an order through `confirmed → packed → dispatched → delivered`. (The old rider-required-on-dispatch check that lived in the now-removed customer-facing DTO should not be reintroduced on the store-portal side either.)
- `delivered` is the store's own word — there's no rider app, no customer-side "confirm receipt" step, no tracking. A store marks an order delivered once they know it happened. A customer-confirmation step (mirroring the appointment dispute-window pattern) is possible future polish, not a blocker for anything today.
- No rider-fee logic needed anywhere — `storePayout` (order total minus platform commission) already has to cover whatever a store spends on their own fulfillment, same as any retailer pricing in their own delivery cost. A separate customer-visible "delivery fee" line item is a future addable feature if ever wanted, not a current gap.

**Not a bug, not blocked on anything** — this closes the rider-field question raised during the ownership fix; no further action needed unless the product direction changes.
