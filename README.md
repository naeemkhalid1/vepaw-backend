# VePaw Backend

NestJS REST API for the VePaw pet-care platform — serving a React Native app, Vet Dashboard, Store Dashboard, and Admin Panel.

## Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** NestJS 11 (Express)
- **Database:** MongoDB (Atlas)
- **Cache / Queue:** Redis + BullMQ
- **Auth:** JWT (access 4h / refresh 7d) + OTP via SMS
- **Real-time:** Socket.io
- **Push:** Firebase FCM
- **Payments:** JazzCash / Easypaisa
- **AI:** Anthropic SDK (symptom check)
- **File storage:** Cloudinary

## Setup

```bash
npm install
cp .env.example .env   # fill in your values
npm run start:dev
```

API runs on `http://localhost:3001/api/v1`
Swagger docs at `http://localhost:3001/api/docs`

## Seed scripts

```bash
# Create admin user
npx ts-node src/seed-admin.ts

# Seed vet accounts (registers, approves, sets passwords)
node seed-vets.mjs

# Seed store accounts + 50 products each
node seed-stores.mjs
```

---

## Pending Features

---

### Vet Product Recommendation

**Status:** API endpoint exists (`POST /vet/patients/:id/recommend`) but the body is a no-op — no DB writes happen yet.

#### Intended flow

1. **Vet opens the recommend modal** on a patient's chart.

2. **Vet searches by name** (e.g. "frontline", "royal canin").
   - New endpoint needed: `GET /vet/recommend/search?q=`
   - Backend searches two sources in order:
     1. Vet's own `Listing` collection (priority — vet's own stock)
     2. `Product` collection across all stores (fallback)
   - Results are merged and returned with own-listings first.
   - Each result carries a `source` field: `'own_listing'` or `'store_product'`.

3. **Vet selects a product and clicks Recommend.**
   - Frontend calls: `POST /vet/patients/:petId/recommend`
   - Body: `{ productId, source: 'own_listing' | 'store_product', ownerPhone }`

4. **Backend processes the recommendation:**
   - Resolves the product details based on `source`:
     - `own_listing` → fetch from `Listing` → `storeId = vet._id`, `storeName = vet.clinicName`
     - `store_product` → fetch from `Product` → `storeId = product.store`, `storeName = product.storeName`
   - Finds the owner `User` by `ownerPhone`.
   - Finds or creates a `Thread` `{ user: owner._id, vetId, type: 'vet' }`.
   - Creates a `Message`:
     ```
     {
       type: 'product_recommendation',
       sender: 'doctor',
       thread: thread._id,
       product: { id, name, pricePKR, storeId, storeName }
     }
     ```
   - Updates `Thread.preview` and increments `Thread.unread`.
   - Creates a `Notification` `{ type: 'message', user: owner._id, targetId: thread._id }`.
   - Sends FCM push to `owner.fcmToken` *(FCM dispatch not implemented yet — see below)*.

5. **Owner sees the recommendation** in their Messages tab as a product card inside the vet consultation thread.

#### What needs to be built

| # | Task | File(s) |
|---|---|---|
| 1 | New search endpoint `GET /vet/recommend/search?q=` | `vet-portal.controller.ts`, `vet-portal.service.ts` |
| 2 | Add `source` field to `RecommendProductDto` | `dto/update-status.dto.ts` |
| 3 | Implement `recommendProduct()` — currently a stub | `vet-portal.service.ts:1186` |
| 4 | Inject `Thread`, `Message`, `Notification` models into `VetPortalModule` | `vet-portal.module.ts` |
| 5 | FCM push dispatch (blocked on Firebase setup) | new `FcmService` or extend `NotificationsService` |

#### Open question

When the owner taps the product card in chat:
- `source = own_listing` → no cart, vet's clinic product (owner contacts vet)
- `source = store_product` → should deep-link into that store's product page so owner can add to cart

Does the frontend handle this routing via `storeId`, or does the `Message` need to store `source` explicitly?

#### Schemas already in place (no changes needed)

- `Message` — supports `type: 'product_recommendation'` with embedded `ProductRecommendation` sub-doc
- `Thread` — supports `type: 'vet'` linking `user` + `vetId`
- `Notification` — supports `type: 'message'`
- `Product` — has text index on `name + description` (ready for search)
- `Listing` — vet's own products (ready for search)
- `User.fcmToken` — stored, just no sender yet
