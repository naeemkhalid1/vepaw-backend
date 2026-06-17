# VePaw — API Specification Reference
**Version:** 1.0.0 | **Currency:** PKR (integers only) | **Timestamps:** ISO 8601 UTC

---

## Base URLs
| Environment | URL |
|---|---|
| Production | `https://api.vepaw.pk/api` |
| Development | `http://10.0.2.2:5000/api` |
| Local | `http://localhost:3000/api/v1` |

---

## Global Rules

### Authentication
- All endpoints except `/auth/*` require: `Authorization: Bearer <accessToken>`
- Access token expires in **15 minutes** → client calls `POST /auth/refresh`
- On refresh failure: client clears storage, user re-logs in

### Request Headers
```
Authorization: Bearer <accessToken>
Accept-Language: en   // or "ur"
```

### Success Envelope
```json
{
  "success": true,
  "data": <object | array | null>,
  "message": "Optional success message"
}
```

### Error Envelope
```json
{
  "success": false,
  "message": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "errors": {
    "phone": ["Must be a valid Pakistani number"]
  }
}
```

### HTTP Status Codes
| Code | Meaning | When to use |
|---|---|---|
| 200 | OK | GET, PATCH success |
| 201 | Created | POST success (resource created) |
| 204 | No Content | DELETE success |
| 400 | Bad Request | Validation errors, malformed payload |
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Token valid but not allowed (not owner) |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Duplicate resource (phone already registered) |
| 422 | Unprocessable | Business logic error (slot already booked) |
| 429 | Too Many Requests | OTP rate limiting |
| 500 | Internal Error | Server error |

### Pagination Response Shape
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 85,
    "totalPages": 5
  }
}
```

---

## Complete Endpoint Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/otp/send` | NO | Request OTP (SMS) |
| POST | `/auth/verify-otp` | NO | Verify OTP → get tokens |
| POST | `/auth/refresh` | NO | Refresh access token |
| POST | `/auth/logout` | YES | Logout + revoke token |
| GET | `/users/me` | YES | Get my profile |
| PATCH | `/users/me` | YES | Update my profile |
| PATCH | `/users/fcm-token` | YES | Update FCM token |
| PATCH | `/users/me/privacy` | YES | Update privacy settings |
| GET | `/users/me/reminders` | YES | Upcoming reminder (home screen) |
| POST | `/pets` | YES | Create pet |
| GET | `/pets/:id` | YES | Get pet detail |
| PATCH | `/pets/:id` | YES | Update pet |
| DELETE | `/pets/:id` | YES | Delete pet |
| POST | `/pets/:id/vaccinations` | YES | Add vaccination record |
| GET | `/pets/:id/passport/pdf` | YES | Get passport PDF URL |
| GET | `/vets` | YES | List vets (search + filter) |
| GET | `/vets/nearby` | YES | Nearby vets (home screen) |
| GET | `/vets/emergency` | YES | Emergency vets |
| GET | `/vets/:id` | YES | Vet detail |
| GET | `/vets/:id/availability` | YES | Time slot availability |
| GET | `/vets/:id/reviews` | YES | Vet reviews |
| POST | `/appointments` | YES | Create appointment |
| GET | `/appointments` | YES | List my appointments |
| GET | `/appointments/:id` | YES | Appointment detail |
| PATCH | `/appointments/:id/complete` | YES | Mark completed (vet side) |
| PATCH | `/appointments/:id/cancel` | YES | Cancel appointment |
| POST | `/appointments/:id/review` | YES | Submit star rating |
| POST | `/payments/jazzcash/initiate` | YES | Start JazzCash payment |
| POST | `/payments/easypaisa/initiate` | YES | Start EasyPaisa payment |
| POST | `/payments/jazzcash/callback` | NO | JazzCash webhook (server→server) |
| GET | `/store/products` | YES | Product list (+ filter) |
| GET | `/store/products/:id` | YES | Product detail |
| POST | `/store/orders` | YES | Place order |
| GET | `/store/orders` | YES | My orders list |
| GET | `/store/orders/:id` | YES | Order detail (polled every 30s) |
| PATCH | `/store/orders/:id/status` | YES | Update order status |
| GET | `/store/subscriptions` | YES | My subscriptions list |
| GET | `/store/subscriptions/:id` | YES | Subscription detail |
| PATCH | `/store/subscriptions/:id` | YES | Pause or cancel |
| POST | `/symptom-check` | YES | AI triage check |
| GET | `/community/posts` | YES | Feed (stories + posts) |
| POST | `/community/posts` | YES | Create post |
| GET | `/community/posts/:id` | YES | Post detail |
| GET | `/community/posts/:id/comments` | YES | Post comments |
| GET | `/community/stories/:id` | YES | Story detail |
| GET | `/messages/threads` | YES | Message thread list |
| GET | `/consultations/vet/:vetId/messages` | YES | Vet chat history |
| GET | `/notifications` | YES | Notification list |
| PATCH | `/notifications/:id/read` | YES | Mark one as read |
| PATCH | `/notifications/read-all` | YES | Mark all as read |
| POST | `/notifications/register` | YES | Register FCM token |
| DELETE | `/notifications/unregister` | YES | Unregister on logout |
| GET | `/admin/vets/pending` | ADMIN | Pending vet applications |
| PATCH | `/admin/vets/:id/approve` | ADMIN | Approve vet |
| GET | `/admin/analytics` | ADMIN | Platform analytics |

---

## Section 3 — Auth

### 3.1 POST `/auth/otp/send`
Auth: NO | Rate limit: 3 requests per phone per 10 min → 429

**Request:**
```json
{ "phone": "03001234567" }
```
**Success 200:**
```json
{ "success": true, "data": { "expiresIn": 60 } }
```
**Errors:**
| Code | HTTP | `code` |
|---|---|---|
| Invalid phone format | 400 | `INVALID_PHONE` |
| Rate limited | 429 | `OTP_RATE_LIMITED` |

**Rules:** OTP = 4 digits, 60s TTL in Redis, never returned in response.

---

### 3.2 POST `/auth/verify-otp`
Auth: NO

**Request:**
```json
{ "phone": "03001234567", "otp": "4821" }
```
**Success 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "dGhp...",
    "isNewUser": true,
    "user": {
      "id": "user_64a3f2c1",
      "name": "",
      "phone": "03001234567",
      "email": null,
      "gender": null,
      "profilePhoto": null,
      "city": "Lahore",
      "area": "",
      "fcmToken": null,
      "language": "en",
      "pets": [],
      "createdAt": "2026-06-17T10:30:00.000Z",
      "updatedAt": "2026-06-17T10:30:00.000Z"
    }
  }
}
```
**Errors:**
| Scenario | HTTP | `code` |
|---|---|---|
| Wrong OTP | 400 | `OTP_INVALID` |
| Expired OTP | 400 | `OTP_EXPIRED` |

**Rules:** `isNewUser = true` → app goes to onboarding (AddPet). Access token: 15 min. Refresh token: 30 days. Store refresh token in DB for revocation.

---

### 3.3 POST `/auth/refresh`
Auth: NO

**Request:**
```json
{ "refreshToken": "dGhp..." }
```
**Success 200:**
```json
{ "success": true, "data": { "accessToken": "eyJ...", "refreshToken": "bmV3..." } }
```
**Error:**
- 401 `REFRESH_TOKEN_INVALID` — expired or invalid

---

### 3.4 POST `/auth/logout`
Auth: YES

**Request:**
```json
{ "refreshToken": "dGhp..." }
```
**Success 200:**
```json
{ "success": true, "data": null, "message": "Logged out successfully" }
```

---

## Section 4 — Users

### 4.1 GET `/users/me`
**Response 200:** User object (see data model below)

---

### 4.2 PATCH `/users/me`
All fields optional.

**Request:**
```json
{
  "name": "Ayesha Tariq",
  "email": "ayesha@example.com",
  "gender": "female",
  "area": "DHA Phase 5",
  "profilePhoto": "https://cdn.vepaw.pk/avatars/user_001.jpg",
  "language": "ur"
}
```
**Response 200:** Updated User object

---

### 4.3 PATCH `/users/fcm-token`
**Request:**
```json
{ "fcmToken": "eR3mT9xLq..." }
```
**Response 200:** `{ "success": true, "data": null, "message": "FCM token updated" }`

---

### 4.4 PATCH `/users/me/privacy`
All fields optional.

**Request:**
```json
{
  "locationEnabled": true,
  "showReviews": false,
  "personalised": true
}
```
**Response 200:** `{ "success": true, "data": null, "message": "Privacy settings updated" }`

---

### 4.5 GET `/users/me/reminders`
Returns the single most urgent upcoming vaccination within 30 days. Returns `null` if none.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "petId": "pet_001",
    "petName": "Simba",
    "vaccineName": "Rabies booster",
    "daysUntilDue": 7,
    "suggestedClinic": "Pet Express"
  }
}
```

---

## Section 5 — Pets

### 5.1 POST `/pets`
**Request:**
```json
{
  "name": "Simba",
  "species": "cat",
  "breed": "Persian",
  "dateOfBirth": "2021-01-15",
  "weight": 4.2,
  "gender": "male"
}
```
- `species`: `"dog" | "cat" | "bird" | "exotic" | "other"`
- `gender`: `"male" | "female"`

**Response 201:** Full Pet object (see data model)

---

### 5.2 GET `/pets/:id`
**Response 200:** Full Pet object
**Error:** 404 `PET_NOT_FOUND`

---

### 5.3 PATCH `/pets/:id`
All fields optional.

**Request:**
```json
{
  "name": "Simba",
  "breed": "Persian",
  "weight": 4.5,
  "color": "white",
  "photo": "https://cdn.vepaw.pk/pets/pet_001.jpg",
  "vaccinationStatus": "up_to_date",
  "allergies": ["chicken", "dust"],
  "currentMedications": ["Frontline monthly"],
  "remindersEnabled": true
}
```
- `vaccinationStatus`: `"up_to_date" | "some_pending" | "not_sure"`

**Response 200:** Full updated Pet object

---

### 5.4 POST `/pets/:id/vaccinations`
**Request:**
```json
{
  "name": "Rabies",
  "date": "2026-06-17",
  "nextDue": "2027-06-17",
  "vetName": "Dr. Tariq Mehmood",
  "vetId": "vet_001",
  "verified": false,
  "notes": "Given at Pet Express DHA",
  "certificatePhoto": "https://..."
}
```
**Response 201:** Vaccination object `{ id, name, date, nextDue, vetId, vetName, verified, notes }`

---

### 5.5 GET `/pets/:id/passport/pdf`
**Response 200:**
```json
{ "success": true, "data": { "url": "https://cdn.vepaw.pk/passports/pet_001-passport.pdf" } }
```
PDF contents: pet photo, name, species, breed, DOB, vaccination list with vet names/dates, QR code.

---

## Section 6 — Vets

### 6.1 GET `/vets`
Query params: `q`, `area`, `specialization`, `maxFee`, `lat`, `lng`, `page` (default 1), `limit` (default 20)

**Rules:**
- Only `verified = true AND subscriptionStatus = "active"` vets
- Sort: featured first → rating desc
- `distanceKm` calculated from `?lat=&lng=` query params

**Response 200 (paginated):** Array of Vet objects (see data model)

---

### 6.2 GET `/vets/nearby`
Query params: `lat`, `lng`, `limit` (default 5)

**Response 200:** Array of up to 5 Vet objects (same shape as `/vets`)

---

### 6.3 GET `/vets/emergency`
Query params: `lat`, `lng`

**Rules:** Only `isEmergency = true` vets. `nearest` = closest. `nearby` = all within 15 km sorted by distance.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "nearest": {
      "id": "vet_001",
      "name": "Pet Express Emergency",
      "address": "DHA Phase 3, Lahore",
      "distanceKm": 4.2,
      "driveMin": 12,
      "openCount": 3,
      "radiusKm": 6,
      "phone": "+923001234567"
    },
    "nearby": [
      { "id": "vet_002", "name": "CARE Animal Hospital", "area": "Gulberg", "distanceKm": 5.6, "etaMin": 16, "phone": "+923007654321" }
    ]
  }
}
```

---

### 6.4 GET `/vets/:id`
**Response 200:** Full Vet object | **Error:** 404 `VET_NOT_FOUND`

---

### 6.5 GET `/vets/:id/availability`
Query params: `date` (required, `YYYY-MM-DD`)

**Rules:** 30-minute slots within vet's working hours. Skip past slots if date is today.

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "time": "09:00", "status": "available" },
    { "time": "09:30", "status": "booked" }
  ]
}
```
- `status`: `"available" | "booked"`

---

### 6.6 GET `/vets/:id/reviews`
Query params: `page` (default 1), `limit` (default 10)

**Response 200 (paginated):** Array of Review objects `{ id, vet, user, pet, rating (1-5), comment, petType, createdAt }`

---

## Section 7 — Appointments

### 7.1 POST `/appointments`
**Request:**
```json
{
  "vetId": "vet_001",
  "petId": "pet_001",
  "date": "2026-06-20",
  "timeSlot": "11:00",
  "paymentMethod": "jazzcash",
  "fee": 1500
}
```
- `paymentMethod`: `"jazzcash" | "easypaisa" | "cod"`
- `fee`: must match vet's fee — validated server-side, never trust client

**Response 201:** Full Appointment object (see data model)

**Errors:**
- 422 `SLOT_UNAVAILABLE` — slot already booked

**Rules:** Lock slot immediately. `platformCommission` is configurable server-side. `vetPayout = fee - platformCommission`.

---

### 7.2 GET `/appointments/:id`
**Response 200:** Full Appointment object

---

### 7.3 POST `/appointments/:id/review`
**Request:**
```json
{ "rating": 5, "comment": "Very gentle with Simba." }
```
- `rating`: integer 1–5

**Response 201:** Review object

**Errors:**
- 422 `APPOINTMENT_NOT_COMPLETED` — can only review completed appointments
- 409 `REVIEW_ALREADY_EXISTS` — already reviewed

---

## Section 8 — Payments

### 8.1 POST `/payments/jazzcash/initiate`
**Request:**
```json
{ "appointmentId": "appt_001", "amount": 1500, "phone": "03001234567" }
```
**Response 200:**
```json
{ "success": true, "data": { "paymentUrl": "https://sandbox.jazzcash.com.pk/...", "txnRefNo": "T20260617123456" } }
```

---

### 8.2 POST `/payments/easypaisa/initiate`
**Request:**
```json
{ "appointmentId": "appt_001", "amount": 1500, "phone": "03001234567" }
```
**Response 200:**
```json
{ "success": true, "data": { "paymentUrl": "https://easypay.easypaisa.com.pk/...", "transactionId": "EP20260617123456" } }
```

---

### 8.3 POST `/payments/jazzcash/callback`
Auth: NO (server-to-server webhook)

**Rules:** Validate HMAC signature. On success → `appointment.paymentStatus = "held"`. On failure → `appointment.status = "cancelled"`. Trigger FCM push.

---

## Section 9 — Store: Products

### 9.1 GET `/store/products`
Query params: `category`, `petType`, `q`, `page` (default 1), `limit` (default 20)

- `category`: `"food" | "medicine" | "accessories" | "grooming" | "treats"`
- `petType`: `"dog" | "cat" | "bird" | "exotic"`

**Response 200 (paginated):** Array of Product objects (see data model)

---

### 9.2 GET `/store/products/:id`
**Response 200:** Full Product object

---

## Section 10 — Store: Orders

### 10.1 POST `/store/orders`
**Request:**
```json
{
  "items": [
    { "product": "prod_001", "name": "Royal Canin Persian Adult", "photo": "https://...", "qty": 1, "price": 4250 }
  ],
  "totalAmount": 4250,
  "paymentMethod": "jazzcash",
  "deliveryAddress": {
    "street": "House 12, A Block",
    "area": "DHA Phase 5",
    "city": "Lahore",
    "label": "Home"
  }
}
```
- `paymentMethod`: `"jazzcash" | "easypaisa" | "cod"`
- `deliveryAddress.label`: `"Home" | "Work" | "Other" | null`

**Validation:** All items must belong to the same store. `totalAmount` must match sum of `qty × price`.

**Response 201:** Full Order object

**Errors:**
- 422 `ITEM_OUT_OF_STOCK`
- 422 `TOTAL_MISMATCH`

---

### 10.2 GET `/store/orders`
Query params: `page` (default 1), `limit` (default 20)

**Response 200 (paginated):** Array of Order objects, newest first

---

### 10.3 GET `/store/orders/:id`
**Response 200:** Full Order object

**Rules:** Polled every 30 seconds by the app tracking screen — must be fast. `rider` field populated only when `status = "dispatched" | "delivered"`.

Order `status` values: `"pending" | "confirmed" | "packed" | "dispatched" | "delivered" | "cancelled"`

---

## Section 11 — Subscriptions

### 11.1 GET `/store/subscriptions`
**Response 200:** Array of Subscription objects (see data model)

---

### 11.2 GET `/store/subscriptions/:id`
**Response 200:** Full Subscription object

---

### 11.3 PATCH `/store/subscriptions/:id`
**Request (pause/cancel):**
```json
{ "status": "paused" }
```
- `status`: `"paused" | "cancelled"` — cancelled subscriptions cannot be reactivated

**Request (reschedule):**
```json
{ "nextOrderDate": "2026-07-25T00:00:00.000Z" }
```
**Response 200:** Updated Subscription object

---

## Section 12 — Symptom Check

### 12.1 POST `/symptom-check`
**Request:**
```json
{ "petId": "pet_001", "symptoms": ["lethargy", "vomiting", "loss of appetite", "fever"] }
```
**Severity rules:**
- 1 symptom → `"green"` — monitor at home
- 2–3 symptoms → `"yellow"` — book vet within 24 hours
- 4+ symptoms → `"red"` — emergency, seek care immediately

**Response 200:**
```json
{
  "success": true,
  "data": {
    "petId": "pet_001",
    "symptoms": ["lethargy", "vomiting", "loss of appetite", "fever"],
    "result": "red",
    "recommendation": "Multiple concurrent symptoms detected. Seek emergency vet care immediately — do not wait.",
    "createdAt": "2026-06-17T10:30:00.000Z"
  }
}
```

---

## Section 13 — Community

### 13.1 GET `/community/posts`
Query params: `page` (default 1), `limit` (default 20)

**Response 200:** `data` contains both `stories[]` and `posts[]` arrays plus `pagination`.

---

### 13.2 POST `/community/posts`
**Request:**
```json
{
  "text": "Simba had his first vaccination today!",
  "imageUrl": "https://cdn.vepaw.pk/posts/...",
  "topics": ["vaccination", "health"],
  "petName": "Simba",
  "location": "DHA Lahore",
  "feeling": "proud"
}
```
- `text`: required
- `topics`: string[], required, min 1

**Response 201:** Post object

---

### 13.3 GET `/community/posts/:id`
**Response 200:** Full Post object

---

### 13.4 GET `/community/posts/:id/comments`
Query params: `page` (default 1), `limit` (default 20)

**Response 200 (paginated):** Comment objects. `isVet: true` shows verified badge in app.

---

### 13.5 GET `/community/stories/:id`
**Response 200:** Story object `{ id, petId, petName, caption, imageUrl, createdAt }`

---

## Section 14 — Messages

### 14.1 GET `/messages/threads`
Returns all thread types:
- `"ai"` — PawCare AI Assistant (one per user)
- `"vet"` — Consultation with a specific vet
- `"store"` — Order update thread from a store

**Response 200:** Thread objects `{ id, type, name, preview, createdAt, unread, verified, vetId, orderId }`

---

### 14.2 GET `/consultations/vet/:vetId/messages`
**Response 200:** Array of message objects

Message `type`: `"text" | "product_recommendation"`
Message `sender`: `"user" | "doctor"`

Product recommendation messages include `product: { id, name, pricePKR, storeId, storeName }` — renders an "Add to cart" card in the chat UI.

---

## Section 15 — Notifications

### 15.1 GET `/notifications`
Query params: `page` (default 1), `limit` (default 30)

**Response 200 (paginated):** Notification objects

Notification types and navigation targets:
| `type` | Navigate to |
|---|---|
| `vaccination` | targetId = petId → PetProfile |
| `order_delivery` | targetId = orderId → OrderTracking |
| `order_delivered` | targetId = orderId → OrderTracking |
| `message` | targetId = vetId → ConsultationChat |
| `booking` | targetId = vetId → VetProfile |
| `rating` | targetId = vetId → VetProfile |

---

### 15.2 PATCH `/notifications/:id/read`
**Response 200:** `{ "success": true, "data": null }`

---

### 15.3 PATCH `/notifications/read-all`
**Response 200:** `{ "success": true, "data": null }`

---

### 15.4 POST `/notifications/register`
**Request:**
```json
{ "fcmToken": "eR3mT9xLq...", "platform": "ios" }
```
- `platform`: `"ios" | "android"`

**Response 200:** `{ "success": true, "data": null }`

---

### 15.5 DELETE `/notifications/unregister`
**Request:**
```json
{ "fcmToken": "eR3mT9xLq..." }
```
**Response 200:** `{ "success": true, "data": null }`

---

## Section 17 — Data Models

### User
```
id, name, phone, email?, gender? ("male"|"female"|"other"),
profilePhoto?, city, area, fcmToken?, language ("en"|"ur"),
pets (string[]), createdAt, updatedAt
```

### Pet
```
id, owner (userId), name,
species ("dog"|"cat"|"bird"|"exotic"|"other"),
breed, dateOfBirth (YYYY-MM-DD), weight (kg, number),
gender ("male"|"female"), color?, photo?,
vaccinations (Vaccination[]), medicalHistory (MedicalRecord[]),
allergies (string[]), currentMedications (string[]),
vaccinationStatus ("up_to_date"|"some_pending"|"not_sure")?,
remindersEnabled (bool), isActive (bool), createdAt, updatedAt
```

### Vaccination
```
id, name, date (YYYY-MM-DD), nextDue (YYYY-MM-DD),
vetId?, vetName, verified (bool), notes?, certificatePhoto?
```

### Vet
```
id, name, clinicName, photo?, email, phone,
location { type: "Point", coordinates: [lng, lat], distanceKm? },
address, city, area,
fee { min (PKR int), max (PKR int) },
specialty?, about?, yearsExperience?,
specializations (string[]), languages (string[]),
workingHours { mon..sun: { open, close, isOpen } },
is24Hours (bool), isEmergency (bool),
rating (float), reviewCount (int),
verified (bool), subscriptionStatus ("active"|"inactive"),
featured (bool), createdAt
```

### Appointment
```
id, pet, vet, owner, date (YYYY-MM-DD), timeSlot (HH:MM),
status ("pending"|"confirmed"|"completed"|"cancelled"|"no-show"),
fee (PKR int), platformCommission (PKR int), vetPayout (PKR int),
paymentMethod ("jazzcash"|"easypaisa"|"cod"),
paymentStatus ("pending"|"held"|"released"|"refunded"),
paymentReference?, notes?, reviewId?,
vetDetails { name, clinicName, address, phone },
petDetails { name, species },
createdAt, updatedAt
```

### Order
```
id (e.g. "PC-2398"), user, store, storeName,
items (OrderItem[]) { product, name, photo, qty, price (PKR int) },
totalAmount (PKR int), platformCommission (PKR int), storePayout (PKR int),
status ("pending"|"confirmed"|"packed"|"dispatched"|"delivered"|"cancelled"),
paymentMethod ("jazzcash"|"easypaisa"|"cod"),
paymentStatus ("pending"|"paid"|"refunded"),
deliveryAddress { street, area, city, label ("Home"|"Work"|"Other") },
isSubscription (bool), nextOrderDate?,
estimatedDelivery (string)?, rider { name, phone }?,
createdAt, updatedAt
```

### Product
```
id, store, storeName, name, photo, description?,
category ("food"|"medicine"|"accessories"|"grooming"|"treats"),
petTypes (string[]), brand?, weight?, price (PKR int),
originalPrice (PKR int)?, inStock (bool),
isVetRecommended (bool)?, recommendedBy?
```

### Subscription
```
id, user, product, productName, productPhoto, storeName,
qty (int), interval ("weekly"|"biweekly"|"monthly"|"quarterly"),
nextOrderDate (ISO string), subscriberPrice (PKR int),
status ("active"|"paused"|"cancelled")
```

### Notification
```
id, type, title, subtitle, createdAt (ISO), read (bool), targetId?
```

### Post
```
id, author, authorName, petName?, text, imageUrl?, topics (string[]),
location?, feeling?, likes (int), comments (int), createdAt
```

### Comment
```
id, postId, author, authorName, isVet (bool), text, likes (int), createdAt
```

---

## Section 18 — Implementation Notes

### Phone Format
Store as-is: `"03001234567"` (11 digits, starts with 0, no country code prefix).

### Currency
All monetary values are **integers in PKR**. No floats. Never.

### GeoJSON Coordinates
`{ type: "Point", coordinates: [longitude, latitude] }` — longitude comes **first**.
MongoDB: use `2dsphere` index on `location` for nearby queries.

### Vet Visibility Rule
Only serve vets where `verified = true AND subscriptionStatus = "active"`.

### Single Cart Per Store
Validate on `POST /store/orders` that all items belong to the same store.

### OTP Security
- Never return OTP in any response
- Redis TTL: 60 seconds
- Invalidate after first successful use
- Rate limit: max 3 requests per phone per 10 minutes

### Token Security
- Access token: 15 min
- Refresh token: 30 days
- Store refresh tokens in DB (for revocation)
- On logout: delete refresh token from DB

### Order Tracking
`GET /store/orders/:id` is polled every 30 seconds — must be fast. Cache if needed.

### Commission
- Appointments: fixed PKR amount (configurable server-side constant)
- Store orders: currently 0 PKR commission
- Always store `platformCommission` + `vetPayout`/`storePayout` on every transaction

### Vaccination Auto-Update (Cron)
When a vaccination's `nextDue` date passes, set `pet.vaccinationStatus = "some_pending"` via scheduled job.

### FCM Push Triggers
| Event | Notification type |
|---|---|
| Appointment confirmed | `booking` |
| Order status changes | `order_delivery` / `order_delivered` |
| Vet replies in chat | `message` |
| Vaccination due in 7 days | `vaccination` (cron) |
| Appointment completed | `rating` |
