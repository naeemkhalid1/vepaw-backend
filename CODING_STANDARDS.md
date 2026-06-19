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
| 2 | File upload | `vet-portal.service.ts:931` | Returns filename — doesn't save to Cloudinary/S3 |
| 3 | Block slots | `vet-portal.service.ts:823` | Logs slot IDs — doesn't persist blocked slots |
| 4 | Bulk import preview | `store-portal.service.ts:329` | Returns empty arrays — no CSV parsing |
| 5 | Bulk import confirm | `store-portal.service.ts:346` | Returns `imported: 0` — no actual import |
| 6 | Store withdraw | `store-portal.service.ts:401` | Returns `success: true` — no payout processing |

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
| 12 | `nextAutoPayout` | `store-portal.service.ts:393`, `vet-portal.service.ts:491` | Always `'Monday'` |
| 13 | `retention` / `retentionChange` | `admin.service.ts:322` | Always `'0%'` |
| 14 | `disputes` / `disputesSubtitle` | `admin.service.ts:234` | Always `0` / `'no active disputes'` |
| 15 | `visitType` | `vet-portal.service.ts:149,187,300` | Always `'checkup'` — appointment schema has no visitType field |
| 16 | `duration` | `vet-portal.service.ts:143` | Always `'30 min'` |
| 17 | `frequency` | `store-portal.service.ts:189` | Always `'Monthly'` — no frequency field on orders |
| 18 | `commissionRate` | `vet-portal.service.ts:729` | Always `'15%'` — should read from commission tiers |
| 19 | `slotLength` | `vet-portal.service.ts:720` | Always `'30 min'` |
| 20 | `lunchBreak` | `vet-portal.service.ts:721` | Always `'13:00 – 14:00'` |
| 21 | `bookableSlotsPerDay` | `vet-portal.service.ts:722` | Always `16` |
| 22 | Clinic notifications array | `vet-portal.service.ts:733-736` | 4 hardcoded items — not stored per-vet |
| 23 | Default commission tiers | `admin.service.ts:244-245` | Falls back to hardcoded `15%` vet / `0%` store when DB empty |
| 24 | `activeVetsCity` | `admin.service.ts:124` | Always `'Lahore'` |
