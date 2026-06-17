# VePaw Backend — Architecture & Scalability Reference
**Stack:** NestJS + TypeScript + MongoDB + Redis + Socket.io

---

## 1. High-Level Architecture

```
[React Native App] ─┐
[Vet Dashboard]      ├─ REST API ──> [NestJS App Server] ──> [MongoDB]
[Store Dashboard]    │                      │
[Admin Panel]    ────┘                      ├──> [Redis] (cache, OTP, sessions, BullMQ, Socket.io adapter)
                                             ├──> [Socket.io Gateway] (live location, chat, call signaling)
                                             ├──> [BullMQ Workers] (cron jobs, notifications, PDF gen)
                                             └──> External: FCM, JazzCash/Easypaisa, Google Maps, LLM API, Video SDK (Agora)
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
├── jobs/                          # BullMQ processors (cron-style tasks)
└── shared/                          # types/interfaces shared across modules
```

Each feature module follows the same internal shape: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`, and references a schema from `database/schemas`. Keeps things predictable as the codebase grows.

---

## 3. Database Design (MongoDB)

- **Indexes are non-negotiable**, not optional: `2dsphere` index on `Vet.location` for nearby-search; index on `User.phone` (unique); compound index on `Appointment.vet + date` for slot-availability checks; index on `Order.status` for the orders-queue dashboard.
- Use **lean queries** (`.lean()`) for read-heavy endpoints (vet list, order list) — skips Mongoose document hydration overhead.
- Denormalize selectively: the spec already does this (`vetDetails`/`petDetails` embedded in Appointment) — keep doing it for anything read far more than it's written, to avoid extra joins/populates on hot paths.
- Use a **replica set** even on a small budget (MongoDB Atlas free/shared tier includes one) — gives you automatic failover and the option to route heavy reads to a secondary later.

---

## 4. Caching & Redis Usage

- OTP storage with 60s TTL (already in spec).
- Cache "nearby vets" query results per geographic grid cell for ~60s — this endpoint gets hit constantly on the home screen and rarely changes second-to-second.
- Rate-limit counters for OTP requests and general API throttling (`@nestjs/throttler` backed by Redis in multi-instance setups).
- Socket.io **Redis adapter** — required the moment you run more than one server instance, since it lets sockets on different instances broadcast to each other.

---

## 5. Background Jobs (BullMQ + Redis)

Run these as a **separate worker process**, not inline in the API process, so a slow job never blocks API responsiveness:
- Vaccination status auto-update (daily cron)
- Vaccination-due-in-7-days reminder push (daily cron)
- FCM push dispatch (queued, not sent inline on the request thread)
- Pet passport PDF generation (queued — PDF generation is slow, never do it synchronously in a request handler)
- Payment webhook post-processing (commission calc, payout ledger entries)

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
- Upload images/PDFs to cloud storage (S3, Cloudinary, or similar) — never store files on local disk, they vanish on redeploy and can't scale across instances.
- Avoid N+1 query patterns — batch-populate or use aggregation pipelines instead of looping queries.

---

## 10. Scalability Path (grow into this, don't over-build day one)

1. **Now:** single NestJS instance + single worker process + MongoDB Atlas (shared tier) + Redis Cloud (free tier). Fully sufficient for early traction.
2. **Next:** split API and BullMQ worker into separate deployable services (already structured that way from §5, so this is just a deployment change, not a code change).
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
