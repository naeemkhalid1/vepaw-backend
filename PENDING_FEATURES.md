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
