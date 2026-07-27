# VePaw Backend — Architecture & Scalability Reference
**Stack:** NestJS + TypeScript + MongoDB + Redis + Socket.io

---

## 1. High-Level Architecture

```
[React Native App] ─┐
[Vet Dashboard]      ├─ REST API ──> [NestJS App Server] ──> [MongoDB]
[Store Dashboard]    │                      │
[Admin Panel]    ────┘                      ├──> [Redis] (cache, OTP, sessions, Socket.io adapter)
                                             ├──> [Socket.io Gateway] (live location, chat, call signaling)
                                             ├──> [In-process @Cron jobs] (see §5 — no separate worker/queue)
                                             └──> External: FCM (not wired), Safepay, Google Maps, LLM API, Video SDK (Agora)
```

Key principle: the API layer is **stateless**. No session data lives in server memory — everything that needs to persist across requests lives in MongoDB or Redis. This is what lets you run multiple server instances later without rewriting anything.

---

## 2. Folder Structure (NestJS)

```
src/
├── main.ts
├── app.module.ts
├── config/                  # env validation, typed config service
├── common/
│   ├── decorators/           # @CurrentUser(), @Roles()
│   ├── filters/              # global exception filter → error envelope
│   ├── interceptors/         # success envelope wrapper, logging
│   ├── guards/                # JwtAuthGuard, RolesGuard
│   ├── pipes/                  # ValidationPipe config
│   └── dto/                    # shared pagination DTO etc.
├── database/
│   └── schemas/               # Mongoose schemas (User, Pet, Vet, Appointment...)
├── modules/
│   ├── auth/                  # OTP, JWT issue/refresh
│   ├── users/
│   ├── pets/
│   ├── vets/
│   ├── appointments/
│   ├── payments/              # JazzCash/Easypaisa adapters
│   ├── store/                  # products + orders
│   ├── subscriptions/
│   ├── symptom-check/          # LLM wrapper service
│   ├── community/
│   ├── messages/
│   ├── notifications/          # FCM integration
│   ├── admin/
│   └── realtime/                # Socket.io gateways (location, chat, calls)
├── jobs/                          # orphaned leftovers from the original BullMQ design — see §5, not wired to anything
└── shared/                          # types/interfaces shared across modules
```

Each feature module follows the same internal shape: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`, and references a schema from `database/schemas`. Keeps things predictable as the codebase grows.

---

## 3. Database Design (MongoDB)

- **Indexes are non-negotiable**, not optional: `2dsphere` index on `Vet.location` for nearby-search; index on `User.phone` (unique); compound index on `Appointment.vet + date` for slot-availability checks; index on `Order.status` for the orders-queue dashboard.
- Use **lean queries** (`.lean()`) for read-heavy endpoints (vet list, order list) — skips Mongoose document hydration overhead.
- Denormalize selectively: the spec already does this (`vetDetails`/`petDetails` embedded in Appointment) — keep doing it for anything read far more than it's written, to avoid extra joins/populates on hot paths.
- Use a **replica set** even on a small budget (MongoDB Atlas free/shared tier includes one) — gives you automatic failover and the option to route heavy reads to a secondary later.
- **Multi-staff clinic model (as of 2026-07-21/22):** every staff member — `admin_vet`, `team_vet`, `manager` — is its own full `Vet` document (`staffRole` field), not a separate "staff/team member" schema. Each is independently public/bookable (no `staffRole` filter on public listings — a `team_vet` or `manager` with `verified: true` shows up as their own bookable vet card, same as `admin_vet`). Personal fields (`name`/`photo`/`about`/`specialty`/`yearsExperience`/`languages`) are genuinely per-document, edited by each staff member for themselves via `/vet/profile/me`. Business-identity fields (`clinicName`/`phone`/`address`/`city`/`area`) are *structurally* per-document too (not normalized onto `Clinic`, which only holds payout/banking fields) but are treated as admin_vet/manager-owned by convention: writes are gated to those two roles, and a successful write cascades the same values to every other staff `Vet` in the clinic (`resolveClinicVetIds()`). This was a deliberate choice over a true schema migration (moving those fields onto `Clinic`) to avoid redesigning the `2dsphere` geo-search index around a cross-collection join — see `PENDING_FEATURES.md` if that migration is ever revisited. **Known side effect:** login (`AuthService.login()`) looks up a vet by `$or: [{email},{phone}]` via a bare `findOne` assuming phone is unique per person — once the cascade unifies a clinic's phone number, `findOne` returns whichever staff record Mongo hands back first, so phone-based login silently authenticates as the wrong person for everyone except that one record. Email-based login is unaffected (still unique per person). See `PENDING_FEATURES.md` for the open decision on fixing this properly.

---

## 4. Caching & Redis Usage

- OTP storage with 60s TTL (already in spec).
- Cache "nearby vets" query results per geographic grid cell for ~60s — this endpoint gets hit constantly on the home screen and rarely changes second-to-second.
- Rate-limit counters for OTP requests and general API throttling (`@nestjs/throttler` backed by Redis in multi-instance setups).
- Socket.io **Redis adapter** — required the moment you run more than one server instance, since it lets sockets on different instances broadcast to each other.

---

## 5. Background Jobs

**Note (2026-07-21): this section describes the original design intent (a separate BullMQ worker process). That was never kept — the codebase now runs scheduled work in-process via `@nestjs/schedule` `@Cron` decorators directly on domain services.** No queue/worker process exists; `src/jobs/*.processor.ts` are orphaned leftovers from the original design, referenced nowhere. Jobs actually running today:
- `AppointmentsService.markStaleAppointmentsNoShow()` / `releaseEligiblePayouts()` — hourly
- `ConsultationsService.expireStaleConsultations()` — hourly (24h active-session timeout)
- `ConsultationsService.cancelAbandonedPendingPaymentConsultations()` — hourly, cancels sessions stuck `pending_payment` past 15 minutes (added 2026-07-21)
- `StoreService.cancelAbandonedPendingPaymentOrders()` — hourly, same 15-minute abandoned-checkout cleanup for `safepay` orders (added 2026-07-21)
- `StoreService.autoCancelUnconfirmedPaidOrders()` — hourly (added 2026-07-22) — a *different* timeout than the one above: this fires on orders that already reached `paymentStatus: 'paid'` but the store never advanced `status` past `'pending'` within 6 hours. Auto-cancels, issues a real Safepay refund, and notifies the owner (`order_cancelled`). Established-marketplace safety net (Foodpanda/Daraz-style confirmation SLA) this platform otherwise lacked — see `PENDING_FEATURES.md` for the appointments-side equivalent gap (no refund API exists there yet).
- `VetPortalService.autoBatchWeeklyPayouts()` — every Monday 00:00 Asia/Karachi (pinned via `@Cron(..., { timeZone: 'Asia/Karachi' })`) — auto-creates a pending `Payout` for every clinic with a released, unpaid balance
- `StorePortalService.autoBatchWeeklyStorePayouts()` — same Monday 00:00 Asia/Karachi window, store equivalent (added 2026-07-21) — simpler than the vet version since a `Store` is single-entity, no clinic-style multi-staff aggregation needed

Still not implemented anywhere: vaccination status auto-update, vaccination-due-in-7-days reminder push, FCM push dispatch (no `firebase-admin` dependency exists), pet passport PDF generation.

**Safepay webhook — one endpoint per event type (2026-07-22):** confirmed against Safepay's own dashboard — a merchant account can only register ONE endpoint per event type (`payment.succeeded`, `payment.failed`, etc.); attempting a second gets rejected with "already subscribed on another endpoint." So although `appointments-webhook.controller.ts`, `consultations-webhook.controller.ts`, and `store-webhook.controller.ts` all still exist as separate routes, only `POST /appointments/webhooks/safepay` is actually registered with Safepay — it dispatches internally by `metadata.order_id` (checking `AppointmentReservation` → `ConsultationSession` → `Order` in turn) rather than relying on Safepay hitting three different URLs. **Don't try to register the other two webhook routes with Safepay** — it will silently only deliver to whichever one claimed the event type first. Adding a future payment type means adding a lookup branch to the dispatcher, not a new Safepay endpoint.

---

## 6. Real-Time Layer (Socket.io)

Separate **namespaces/gateways**, not one giant socket handler:
- `/tracking` — owner/rider live location broadcast (emit every few seconds, throttle on the client side to avoid flooding)
- `/chat` — vet consultation messaging
- `/calls` — ring/answer/decline signaling, handing off to the video SDK once accepted

Always pair this with the Redis adapter (see §4) from day one, even with one server instance — it costs nothing now and saves a painful migration later.

---

## 7. API Design Conventions

- Global **interceptor** wraps every response in the `{ success, data, message }` envelope — don't write that manually in every controller.
- Global **exception filter** maps thrown errors to the `{ success: false, message, code, errors }` shape consistently.
- `class-validator` + `ValidationPipe` on every DTO — this is what produces the field-level `errors` object automatically.
- Versioned routes from day one (`/api/v1/...`) — cheap now, painful to retrofit later.
- Auto-generate Swagger docs (`@nestjs/swagger`) — also gives you a source to generate TypeScript client types for the dashboards/mobile app.

---

## 8. Security

- `helmet` middleware, strict CORS allow-list (your dashboards' domains + app scheme).
- `JwtAuthGuard` globally, with `@Public()` decorator to opt out for `/auth/*`.
- `RolesGuard` + `@Roles('vet' | 'store' | 'admin')` decorator for the three dashboards' endpoints — this is your RBAC layer.
- Rate-limit OTP and login endpoints harder than the rest of the API.
- Never trust client-sent prices/fees — always recompute commission/payout server-side.

---

## 9. Performance Checklist

- Pagination on every list endpoint, sane default `limit` (e.g. 20), hard max (e.g. 100).
- `compression` middleware enabled.
- Connection pooling on the Mongo driver (default is usually fine, just don't override it down).
- Upload images/PDFs to cloud storage — never store files on local disk, they vanish on redeploy and can't scale across instances. (Settled on **S3** exclusively; Cloudinary was evaluated early on but has zero references anywhere in `src/` now.)
- **S3 bucket policy is prefix-scoped, not bucket-wide (2026-07-22):** public `s3:GetObject` is only granted on a fixed allow-list of prefixes (`uploads/`, `pets/`, `avatars/` as of this writing — check the bucket policy directly for the current list). `S3Service.uploadImage()` will happily return a URL for any prefix you pass it, but a new, unlisted prefix 403s on actual fetch despite looking identical to a working one — confirmed by hitting exactly this while building the vet-onboarding document upload. Either reuse an already-whitelisted prefix or add the new one to the bucket policy first; don't assume a new folder name "just works" because the SDK call succeeded.
- Avoid N+1 query patterns — batch-populate or use aggregation pipelines instead of looping queries.

---

## 10. Scalability Path (grow into this, don't over-build day one)

1. **Now:** single NestJS instance + single worker process + MongoDB Atlas (shared tier) + Redis Cloud (free tier). Fully sufficient for early traction.
2. **Next:** ~~split API and BullMQ worker into separate deployable services~~ — no longer applicable; scheduled work runs in-process via `@nestjs/schedule` (see §5). Revisit only if in-process cron jobs start competing meaningfully with request traffic.
3. **Then:** horizontal scale the API behind a load balancer once concurrent users justify it — works immediately because the API is stateless and Socket.io already has the Redis adapter wired in.
4. **Later:** dedicated read replica for MongoDB if dashboard analytics queries start competing with live traffic.

---

## 11. Monitoring

- Structured logging (`pino` or `winston`) — log every request with a correlation ID.
- Error tracking (Sentry free tier is enough early on).
- A `/health` endpoint for uptime checks once you deploy.

---

## 12. Budget-Friendly Hosting (early stage)

- **App hosting:** Railway or Render (cheap, simple CI/CD, scales up later).
- **Database:** MongoDB Atlas free/shared tier → upgrade as data grows.
- **Cache/queue:** Redis Cloud free tier.
- **File storage:** Cloudinary free tier (handles images well, has built-in transforms — useful for pet photos/vaccination certs).
- **Maps:** Google Maps Platform has a monthly free credit that comfortably covers early-stage usage.
