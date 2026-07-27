# VePaw Backend — Coding Standards

These are the rules to follow throughout this project, for consistency across every module, whether built today or six months from now.

## 1. Naming Conventions

- **Variables, functions, methods** → `camelCase` (`getUserById`, `appointmentDate`, `isVerified`).
- **Classes, interfaces, types, DTOs, schemas, decorators** → `PascalCase` (`UsersService`, `CreatePetDto`, `Appointment`, `JwtAuthGuard`).
- **Files** → `kebab-case`, suffixed by what they are (`users.service.ts`, `create-pet.dto.ts`, `jwt-auth.guard.ts`, `vet.schema.ts`).
- **Constants and env variables** → `UPPER_SNAKE_CASE` (`JWT_ACCESS_SECRET`, `MAX_OTP_ATTEMPTS`).
- **MongoDB fields** → `camelCase` to match the TypeScript property names exactly (`dateOfBirth`, not `date_of_birth`).
- **Routes** → plural, lowercase, kebab-case nouns (`/pets`, `/store/orders`, not `/Pet` or `/getPet`).
- **Booleans** → read like a yes/no question (`isActive`, `hasDiscount`, `remindersEnabled`), never ambiguous nouns.
- Names should say what the thing *is* or *does* — no abbreviations that aren't immediately obvious (`apt` for appointment, `usr` for user — don't).

## 2. File & Module Structure

- One feature = one module folder under `src/modules/`, containing `*.module.ts`, `*.controller.ts`, `*.service.ts`, and a `dto/` subfolder.
- Controllers stay **thin** — route decorators, param extraction, and a single call into the service. No business logic in a controller, ever.
- Services hold all business logic. If a service file is getting long enough that you're scrolling a lot, that's a sign it's doing more than one job — split it.
- Schemas live only in `database/schemas/`, never redefined inline in a module.
- Shared, cross-cutting code (guards, interceptors, filters, decorators) lives in `common/` and is imported, never duplicated per-module.

## 3. Comments

- Code should explain itself through naming and structure. If you feel the urge to comment *what* a line does, rename things instead so the comment becomes unnecessary.
- Comments are only for the *why*, not the *what* — a non-obvious business rule, a workaround for a library quirk, a deliberate trade-off (e.g. `// no Redis yet — OTP TTL handled via Mongo index`).
- No commented-out code left in committed files. Delete it — git history already remembers it.
- No restating the function name in a comment above it (`// gets the user by id` above `getUserById()` adds nothing — remove it).

## 4. TypeScript Practices

- Explicit return types on every service method and controller handler — don't rely on inference for anything public.
- Avoid `any`. If a shape is genuinely dynamic, use a named interface or `Record<string, unknown>` instead.
- Every incoming request body gets a DTO with `class-validator` decorators — no raw, unvalidated `@Body()` objects.
- Prefer `interface` for object shapes, `type` for unions/aliases.
- Use `async/await` everywhere — no `.then()` chains.

## 5. API & Response Conventions

- Every response goes through the global interceptor's `{ success, data, message }` envelope — never construct that shape manually inside a controller.
- Every error goes through the global exception filter — throw Nest's built-in exceptions (`BadRequestException`, `NotFoundException`, `ForbiddenException`, `ConflictException`, `UnprocessableEntityException`) rather than building custom error objects inline.
- Use the correct HTTP status for the situation (201 for creation, 204 for deletion, 422 for business-logic failures like a slot already being booked — not everything is a 400).

## 6. Database Rules

- Never trust client-sent computed values (price totals, commission, payout) — always recompute server-side from source data.
- Add an index for any field a query filters or sorts by regularly. Don't wait until something's slow to add it.
- Use `.lean()` for read-only queries that don't need to be saved back — skips unnecessary document hydration.

## 7. Security

- Never log OTPs, tokens, or passwords — not even in development console output, beyond what's strictly needed to test the flow locally.
- Never return stack traces or internal error details in an API response, even in development — log them server-side instead.
- Validate and sanitize all input through DTOs; never interpolate user input directly into a query.

## 8. Git & Commits

- Commit messages describe the *why*, briefly: `fix: prevent double-booking on same vet slot`, not `update code`.
- `.env` is never committed — only `.env.example` with placeholder values.
- One logical change per commit; don't bundle unrelated fixes together.

## 9. General

- Keep functions short and single-purpose — if a function needs "and" to describe what it does, split it.
- DRY: if the same logic appears in two places, extract it into a shared service/utility instead of copy-pasting.
- No magic numbers/strings scattered in code — pull them into named constants if they appear more than once.

## 10. TODO — Hardcoded / Stub Items (Web Portal APIs)

Items that return dummy data or have incomplete logic. Fix before production.

### A. Stub Endpoints (do nothing / return empty)

| # | Item | File:Line | What it does now |
|---|---|---|---|
| 1 | Forgot password | `auth.service.ts:210` | Logs and returns "reset link sent" — sends nothing |
| 2 | ~~File upload~~ | `vet-portal.service.ts` | **Resolved 2026-07-22** — see §D, now a real S3 upload |
| 3 | Block slots | `vet-portal.service.ts:823` | Logs slot IDs — doesn't persist blocked slots |
| 4 | Bulk import preview | `store-portal.service.ts:329` | Returns empty arrays — no CSV parsing |
| 5 | Bulk import confirm | `store-portal.service.ts:346` | Returns `imported: 0` — no actual import |
| 6 | ~~Store withdraw~~ | `store-portal.service.ts` | **Resolved 2026-07-21** — see §D, now a real `Payout`-creating implementation, same as vet withdraw |

### B. Fake / Wrong Logic

| # | Item | File:Line | What's wrong |
|---|---|---|---|
| 7 | Admin login returns static token | `admin.service.ts:354` | Returns string `'admin-token'` instead of signed JWT |
| 8 | ordersVolume = ordersToday × 1500 | `admin.service.ts:231` | Fake multiplier, should sum real order values |
| 9 | Store reviews query | `store-portal.service.ts:424` | Queries reviews by order IDs — but reviews are linked to vets/appointments, not stores |
| 10 | Availability slots | `vet-portal.service.ts:794` | Hardcoded 9AM–6PM grid — should read from vet's `workingHours` |

### C. Always-Hardcoded Field Values

| # | Item | Where | Hardcoded value |
|---|---|---|---|
| 11 | All `*Change` fields | 21 places across all 3 services | Always `0` — never compares current vs previous period |
| 12 | `nextAutoPayout` | `store-portal.service.ts:393`, `vet-portal.service.ts:491` | Always `'Monday'` — accurate-by-coincidence for both as of 2026-07-21, see §D (both really do auto-batch every Monday now, but the string itself is still hardcoded, not computed) |
| 13 | `retention` / `retentionChange` | `admin.service.ts:322` | Always `'0%'` |
| 14 | ~~`disputes` / `disputesSubtitle`~~ | `admin.service.ts` (transaction stats) | **Resolved 2026-07-21** — see §D, now a real count of disputed appointments + consultations |
| 15 | `visitType` | `vet-portal.service.ts:149,187,300` | Always `'checkup'` — appointment schema has no visitType field |
| 16 | `duration` | `vet-portal.service.ts:143` | Always `'30 min'` |
| 17 | `frequency` | `store-portal.service.ts:189` | Always `'Monthly'` — no frequency field on orders |
| 18 | `commissionRate` | `vet-portal.service.ts:1046` | Always `'10%'` (updated 2026-07-21 to match `PLATFORM_COMMISSION_RATE`) — still hardcoded, should read from commission tiers |
| 19 | `slotLength` | `vet-portal.service.ts:720` | Always `'30 min'` |
| 20 | `lunchBreak` | `vet-portal.service.ts:721` | Always `'13:00 – 14:00'` |
| 21 | `bookableSlotsPerDay` | `vet-portal.service.ts:722` | Always `16` |
| 22 | Clinic notifications array | `vet-portal.service.ts:733-736` | 4 hardcoded items — not stored per-vet |
| 23 | Default commission tiers | `admin.service.ts:359-360` | Falls back to hardcoded `10%` vet / `10%` store when DB empty (both updated 2026-07-21 — store was `0%` until store orders got real commission) |
| 24 | `activeVetsCity` | `admin.service.ts:124` | Always `'Lahore'` |

### D. Resolved (2026-07-21)

- **Vet withdraw** — was previously an unlisted no-op identical to item 6 (`vetWithdraw()` just returned `success: true`). Now fully implemented: real `Payout` ledger creation (manual click or weekly Monday auto-batch), clinic-wide balance aggregation, `admin_vet`/`manager`-only access, admin settlement queue (`GET/POST /admin/payouts*`), and a full audit trail (`PayoutAccountAudit` + `GET /vet/clinic-settings/payout/activity`). See `PENDING_FEATURES.md` §3 for what's deliberately still manual (actual money disbursement).
- Item 6 ("Store withdraw") is **not** resolved by the above — it's a separate stub on the store side only, untouched.
- Item 12 (`nextAutoPayout` always `'Monday'`) is now accurate-by-coincidence for vets: `autoBatchWeeklyPayouts()` genuinely runs every Monday — but the string itself is still a hardcoded label, not computed from an actual next-run date.
- `Clinic.mobileAccount` no longer exists — replaced by `payoutMethod` (enum) + `walletNumber`/`bankName`+`accountNumber` (conditionally required by method), validated in the vet-portal DTOs.
- **Commission model changed for both appointments and consultations (2026-07-21):** appointments switched from a flat `PLATFORM_COMMISSION_PKR = 150` to a percentage (`PLATFORM_COMMISSION_RATE`, `appointments.service.ts`); consultations' rate (`CONSULTATION_COMMISSION_RATE`, `consultations.service.ts`) was lowered to match. **Both are currently `0.10` (10%)** — a deliberate launch-phase rate kept low to attract initial vets, expected to increase later. Update both constants together if the rate changes, plus the hardcoded `commissionRate: '10%'` display string (item 18) and the default commission-tier fallback (item 23) so they don't drift out of sync with the real computation again. Confirmed this is independent of whatever Safepay's own processing fee takes — that's deducted on Safepay's side during settlement and never touches `platformCommission`/`vetPayout` or the vet's payout amount.
- **Store orders got the same Safepay treatment as appointments/consultations (2026-07-21):** `Order.paymentMethod` changed from the dead `'jazzcash' | 'easypaisa' | 'cod'` enum to `'safepay' | 'cod'` — previously **no payment gateway was ever actually called for any store order**, regardless of the selected method; `paymentStatus` only ever flipped to `'paid'` on delivery, i.e. every order behaved like COD in practice. Now: `placeOrder()` calls `SafepayService.createCheckoutSession()` for `'safepay'` orders (new `Order.paymentReference` field), a new `StoreOrdersWebhookController` (`POST /mobile/store/orders/webhooks/safepay`) applies `payment.succeeded`/`payment.failed`, and a new hourly cron (`cancelAbandonedPendingPaymentOrders`) cancels orders stuck unpaid past 15 minutes — same pattern as appointments' `AppointmentReservation` TTL and the consultation pending-payment sweep. `platformCommission`/`storePayout` now use the same `STORE_COMMISSION_RATE = 0.10` instead of the previous hardcoded `0` (stores kept 100% of order value). **Not included:** the recurring-subscription billing engine still doesn't exist — `createSubscription()` only got the commission fix, no Safepay call, since there's no cron that actually charges subsequent cycles yet.

- **Consultations got commission/payout fields (2026-07-21):** `ConsultationSession` gained `platformCommission`, `vetPayout` (computed once at creation via `CONSULTATION_COMMISSION_RATE = 0.10`, same launch rate as everything else) and `payoutId` (double-payment guard). Previously a paid consultation's revenue was invisible to the entire payout system — `getPayoutSummary()`/`batchPayoutForVet()` only ever queried `appointmentModel`. Both now also query `consultationModel`, so consultation earnings correctly count toward a vet's withdrawable balance. Also added `ConsultationsService.cancelAbandonedPendingPaymentConsultations()` (hourly cron, 15-minute timeout) — previously a `pending_payment` session with an abandoned Safepay checkout sat forever with no cleanup, permanently blocking the owner from starting a new consultation with that vet (`CONSULTATION_ALREADY_IN_PROGRESS`).

- **Store order visibility/action-gating fix (2026-07-21):** `store-portal.service.ts`'s `getOrders()`/`getOrderStats()` and both `updateOrderStatus()` implementations (store-portal and `mobile/store`) now exclude/reject `safepay` orders where `paymentStatus !== 'paid'`. Before this, a store could see and act on (confirm/pack/dispatch) an order that hadn't actually been paid for yet, since the read/write paths never checked payment status — only mattered once Safepay orders existed as a real payment-pending state. New error code `PAYMENT_NOT_CONFIRMED` (400) on the write side.

- **Full store payout system built, mirroring the vet one (2026-07-21):** `Store.payoutMethod`/`merchantAccount` (unstructured, same problem `Clinic.mobileAccount` had) replaced with the same validated shape (`payoutMethod` enum + `accountTitle`/`walletNumber`/`bankName`/`accountNumber`). `Order.payoutId` added (mirrors `Appointment.payoutId`). `store-portal.service.ts`'s `withdraw()` (item 6 above) is no longer a stub — real `Payout` creation via `batchPayoutForStore()`, plus a weekly Monday auto-batch cron, plus new `GET /store/settings/payout/history` and `/payout/activity` endpoints (audit trail, same pattern as vets). Store is single-entity (no clinic-style multi-staff structure), so this was actually simpler than the vet version — no `resolveClinicVetIds()`-equivalent aggregation needed. `PayoutAccountAudit` was generalized from a vet-only (`clinicId`) schema to `entityId`/`entityType: 'vet' | 'store'` to support both without duplicating the schema; `payoutMethodLabel`/`payoutAccountValue`/`maskPayoutValue` were extracted from `vet-portal.service.ts` into `shared/utils/payout-account.util.ts` for the same reason (DRY, per §9). Admin's `GET/POST /admin/payouts*` needed **zero changes** — already handled `entityType: 'store'` generically. Admin's store-application review (`GET /admin/store-applications/:id`) updated to match the new fields (was still reading the now-deleted `merchantAccount`).

- **Admin commission/transaction reporting fixed to include consultations (2026-07-21):** `getCommissionStats()`, `getReportStatsWithPeriod()`, `getTransactions()`, and `getTransactionStats()` (all `admin.service.ts`) previously only ever queried `Order` + `Appointment` — `ConsultationSession` was completely invisible to admin's financial reporting even after it became a real revenue stream. All four now include consultations. `getTransactions()` gained a third row `type: 'consultation'` (same generic shape, no new fields — check any frontend logic that switches on `type`). `getTransactionStats()`'s `inEscrow` now sums across all three flows (previously store-orders-only) and `disputes` is now a real count (previously hardcoded `0`, item 14 above — now resolved). Two new additive fields: `consultationsToday`/`consultationsSubtitle`.

- **Vet onboarding document upload fixed (2026-07-22)** — item 2 above. `VetPortalService.uploadFile()` used to discard the file entirely and return only `file.originalname`; `pvmcLicense`/`degreeCertificate`/`cnicDocument`/`clinicPhoto` were bare filename strings with nothing real behind them, and admin's application review couldn't actually view a vet's submitted credentials before approving them. Now does a real upload via `S3Service`, driven by a new `documentType` param on `POST /vet/onboarding/upload`: `pvmcLicense`/`degreeCertificate`/`clinicPhoto` go to the public `uploads/` prefix, `cnic` goes to private storage (`vet-cnic/` prefix) with `AdminService.getVetApplicationDetail()` now resolving it to a 1-hour signed URL rather than exposing the raw key. **Not retroactive** — any vet approved before this fix has an unrecoverable bare filename in these fields; the original bytes were never stored anywhere.

- **New personal-profile endpoint (2026-07-22):** `GET/PATCH /vet/profile/me` — `name`/`photo`/`about`/`specialty`/`yearsExperience`/`languages`, identical behavior for `admin_vet`/`team_vet`/`manager` since each is just their own `Vet` document. Photo upload reuses the same `S3Service.uploadImage()` pattern as the pet-owner app's avatar upload (`avatars/` prefix, already public). Business-identity fields (`clinicName`/`phone`/`address`/`city`/`area`) stay on the existing `PUT /vet/clinic-settings`, now gated to `admin_vet`/`manager` only and cascaded to every clinic-mate on write — see `ARCHETECTURE.md` §3 for the full model and its phone-login side effect.

- **Clinic-wide schedule + appointment management added (2026-07-22):** new `GET /vet/schedule/clinic` / `/clinic/stats`, both `admin_vet`/`manager`-gated, aggregating every staff `Vet`'s appointments via `resolveClinicVetIds()` instead of just the caller's own. `POST /vet/schedule/appointments/:id/status` widened the same way — those two roles can now confirm/cancel/complete any clinic-mate's appointment, not just their own; `team_vet` behavior is unchanged. Established practice-management platforms (salon/vet booking software) always pair a per-provider calendar with exactly this kind of front-desk/manager view.

- **`ownerName`/`ownerPhone` bug fixed in vet schedule views (2026-07-22)** — new item for §B (Fake/Wrong Logic): `VetPortalService.getScheduleAppointments()` (and the new clinic-wide variant above) were reading `a.vetDetails.name`/`a.vetDetails.phone` for the appointment's "owner" fields — that's the *treating vet's own* snapshot, not the pet owner's. Confirmed live: an appointment showed "Dr. Hira Baig" as the owner when the real owner was a different customer entirely. Fixed via a shared `loadOwnerMap()` helper that looks up the real `User` by the appointment's `owner` field. Same response shape, values are just correct now — no frontend change needed, but displayed patient-contact info will differ from what it showed before.

- **Payout list endpoints missing `status` field (2026-07-22)** — new item for §B: both `store-portal.service.ts` and `vet-portal.service.ts`'s `getPayouts()` built their response objects as hand-picked field lists and simply never included the `Payout` document's own `status` field, on every payout returned, not just fresh ones — despite it being set correctly from creation. Frontend caught this via a real payout showing up with no `status` at all. Fixed by adding `status: p.status` to both mappers.
