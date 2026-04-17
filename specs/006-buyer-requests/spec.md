# Buyer / Renter Request & Matching Engine — Feature Specification

**Status:** Draft — ready for review
**Owner:** TBD
**Depends on:** `Property`, `User`, `Location` (existing Prisma models)
**Introduces:** 3 new tables, 1 new NestJS module, BullMQ queue (new dependency)
**Sibling spec:** `005-semsarai-chat` (independent; no cross-coupling in v1)

---

## 1. Context & Motivation

Semsar AI currently models only the **supply side** of the market: owners publish listings via the `Property` model (`backend/prisma/schema.prisma:46`). There is no way for buyers, renters, or seller-agent search agents to register their **demand** — what they are looking for — and no engine to match that demand against the live catalog.

We want to introduce a demand-side subsystem so that:

- A buyer/renter submits structured criteria ("شقة 3 غرف في المعادي للبيع بسعر أقل من 2 مليون")
- The system returns a ranked list of matching active properties
- When a new property is activated, existing interested buyers are surfaced to the owner ("you have N interested buyers")

**Hard constraint:** no duplication of the `properties` table. The properties table remains the single source of truth for supply. The new system stores **criteria only** and a **derived match index**.

---

## 2. Scope

### In scope
- New model `PropertyRequest` — filter criteria only, no property display fields
- New model `PropertyMatch` — derived `(requestId, propertyId, score, reasons)` index
- New model `PropertyRequestLocation` — multi-select location join to the existing `Location` table
- New NestJS module `backend/src/requests/` with controller, service, query builder, scorer
- Matching engine triggered by: request create/update, property activation/update, nightly staleness sweep
- BullMQ + Redis for async match jobs
- REST API for buyers (CRUD requests, read matches) and sellers (reverse lookup)

### Out of scope
- Replacing or altering the `properties` schema
- Copying property fields into request/match rows
- Integration with `005-semsarai-chat` (SemsarAI will later *read* matches via the same API; no code coupling in v1)
- Push notifications, email digests, WhatsApp alerts (deferred to v2)
- ML-based ranking (v1 scorer is deterministic)

### Explicit non-goals
- A `VIEW` over `properties` joined to criteria — rejected: re-runs scoring per pageview
- Free-text request input — request is a structured DTO; NLP translation is `005`'s job
- Cross-user draft visibility — requests are always scoped to the owning `userId`

### Language policy
- All user-facing strings (error messages, summary sentences, empty states) are **Standard Arabic (فصحى / MSA)**, consistent with the `005-semsarai-chat` decision.
- No colloquial (عامية) strings in AI or UI output.

---

## 3. Architecture

```
┌──────────────────┐                          ┌──────────────────┐
│  properties      │                          │ property_requests│
│  SUPPLY          │                          │ DEMAND / CRITERIA│
│  (UNCHANGED)     │                          │ (NEW)            │
└────────┬─────────┘                          └────────┬─────────┘
         │                                             │
         │           referenced by FK                  │
         └──────────────┬──────────────────────────────┘
                        ▼
              ┌──────────────────────┐
              │  property_matches    │
              │  DERIVED INDEX (NEW) │
              │  requestId+propertyId│
              │  score, reasons      │
              └──────────▲───────────┘
                         │
              ┌──────────┴──────────┐
              │  Matching Engine    │
              │  NestJS + BullMQ    │
              └─────────────────────┘
```

**Key properties:**
- `properties` stays untouched. All supply mutations go through existing channels.
- `property_requests` stores **only criteria** — never property display fields.
- `property_matches` stores **only IDs + score + reasons**. Display data is joined at read time.
- Heavy compute is **event-driven and async**; reads are O(log N) index lookups.

---

## 4. Prisma Schema Additions

All additions are purely new — existing models gain only one-line relation fields.

```prisma
model PropertyRequest {
  id                  String          @id @default(uuid())
  userId              String          @map("user_id")

  // Intent
  intent              PropertyType    // SALE | RENT (reuses existing enum)
  propertyKind        PropertyKind?   @map("property_kind")
  apartmentType       String?         @map("apartment_type")

  // Budget
  minPrice            Decimal?        @db.Decimal(14, 2) @map("min_price")
  maxPrice            Decimal?        @db.Decimal(14, 2) @map("max_price")
  paymentPreference   String?         @map("payment_preference") // CASH | INSTALLMENT | ANY
  rentRateType        String?         @map("rent_rate_type")     // DAILY | MONTHLY | YEARLY

  // Size ranges
  minBedrooms         Int?            @map("min_bedrooms")
  maxBedrooms         Int?            @map("max_bedrooms")
  minBathrooms        Int?            @map("min_bathrooms")
  maxBathrooms        Int?            @map("max_bathrooms")
  minAreaM2           Decimal?        @db.Decimal(10, 2) @map("min_area_m2")
  maxAreaM2           Decimal?        @db.Decimal(10, 2) @map("max_area_m2")

  // Geo search (optional radius)
  centerLatitude      Decimal?        @db.Decimal(10, 8) @map("center_latitude")
  centerLongitude     Decimal?        @db.Decimal(11, 8) @map("center_longitude")
  searchRadiusKm      Decimal?        @db.Decimal(6, 2)  @map("search_radius_km")

  // Feature filters
  isFurnished         Boolean?        @map("is_furnished")
  finishingType       String?         @map("finishing_type")
  floorLevel          String?         @map("floor_level")
  readiness           String?
  ownershipType       String?         @map("ownership_type")
  preferredAmenities  Json?           @map("preferred_amenities") // string[]

  // Lifecycle
  urgency             RequestUrgency  @default(MEDIUM)
  status              RequestStatus   @default(ACTIVE)
  notes               String?         @db.Text
  expiresAt           DateTime?       @map("expires_at")
  lastMatchedAt       DateTime?       @map("last_matched_at")

  createdAt           DateTime        @default(now()) @map("created_at")
  updatedAt           DateTime        @updatedAt     @map("updated_at")

  user      User                      @relation(fields: [userId], references: [id])
  locations PropertyRequestLocation[]
  matches   PropertyMatch[]

  @@index([userId, status])
  @@index([intent, status])
  @@index([status, urgency, createdAt])
  @@index([intent, propertyKind, status])   // matching hot path
  @@map("property_requests")
}

model PropertyRequestLocation {
  id         String   @id @default(uuid())
  requestId  String   @map("request_id")
  locationId Int      @map("location_id")

  request    PropertyRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  location   Location        @relation(fields: [locationId], references: [id])

  @@unique([requestId, locationId])
  @@index([locationId])                     // reverse: "who wants Maadi?"
  @@map("property_request_locations")
}

model PropertyMatch {
  id              String       @id @default(uuid())
  requestId       String       @map("request_id")
  propertyId      String       @map("property_id")

  score           Float                              // 0..100 composite
  priceScore      Float        @map("price_score")
  locationScore   Float        @map("location_score")
  featureScore    Float        @map("feature_score")
  distanceKm      Decimal?     @db.Decimal(8, 2) @map("distance_km")
  reasons         Json?                              // {matched:[...], missed:[...]}

  status          MatchStatus  @default(NEW)
  lastComputedAt  DateTime     @default(now()) @map("last_computed_at")
  createdAt       DateTime     @default(now()) @map("created_at")
  updatedAt       DateTime     @updatedAt     @map("updated_at")

  request   PropertyRequest @relation(fields: [requestId],  references: [id], onDelete: Cascade)
  property  Property        @relation(fields: [propertyId], references: [id], onDelete: Cascade)

  @@unique([requestId, propertyId])
  @@index([requestId, score(sort: Desc)])
  @@index([propertyId, score(sort: Desc)])
  @@index([status, lastComputedAt])
  @@map("property_matches")
}

enum RequestUrgency { LOW MEDIUM HIGH }
enum RequestStatus  { ACTIVE PAUSED MATCHED CLOSED EXPIRED }
enum MatchStatus    { NEW VIEWED CONTACTED DISMISSED CONVERTED }
```

### One-line relation additions to existing models

- `User` → add `propertyRequests PropertyRequest[]`
- `Property` → add `matches PropertyMatch[]`
- `Location` → add `requestLocations PropertyRequestLocation[]`

No column changes, no data migrations on existing tables.

### Optional composite index on `properties`

Add `@@index([propertyStatus, type, propertyKind])` to `Property` to accelerate the candidate-set query. Confirm with `EXPLAIN` before shipping; skip if redundant with existing `(type, propertyStatus)`.

---

## 5. Matching Logic

### 5.1 Two-phase algorithm

**Phase 1 — Hard filters (SQL `WHERE`)**
Cheap, index-friendly. Produces a bounded candidate set (cap 500).

A property `P` is a candidate for request `R` iff **all** are true:

| # | Rule |
|---|---|
| 1 | `P.propertyStatus = 'ACTIVE'` |
| 2 | `P.type = R.intent` |
| 3 | `P.userId != R.userId` (don't match own listing) |
| 4 | `R.propertyKind IS NULL OR P.propertyKind = R.propertyKind` |
| 5 | Price overlap ±15% tolerance: `P.price BETWEEN R.minPrice*0.85 AND R.maxPrice*1.15` |
| 6 | Bedrooms within `[R.minBedrooms − 1, R.maxBedrooms + 1]` |
| 7 | Area overlap same ±15% rule |
| 8 | Location: **either** `property_request_locations` join matches `P.governorate/city/district` **or** haversine distance ≤ `R.searchRadiusKm` (bounding-box prefilter first) |
| 9 | If `R.isFurnished` specified: `P.isFurnished = R.isFurnished` |

**Phase 2 — Soft scoring (compute per candidate)**

```
finalScore = 0.40 * locationScore
           + 0.30 * priceScore
           + 0.30 * featureScore
```

`locationScore` (0–100):
- District match → 100
- City match (different district) → 75
- Governorate match only → 50
- Radius-based: `max(0, (1 − distanceKm / radiusKm)) * 100`
- Else → 0

`priceScore` (0–100):
- Inside `[minPrice, maxPrice]` → 100
- Within ±10% → 80
- Within ±20% → 50
- Within ±30% → 25
- Else → 0

`featureScore` (0–100):
- Bedrooms exact +30, ±1 +15
- Bathrooms exact +10, ±1 +5
- Finishing match +15
- Furnished match +10
- Amenities: `(|P.amenities ∩ R.preferredAmenities| / |R.preferredAmenities|) * 35`
- Capped at 100

Matches with `score < 40` are **dropped, not stored** — keeps the table narrow.

### 5.2 Explainability

`PropertyMatch.reasons` is a JSON object:
```json
{
  "matched": ["same_district", "price_in_range", "3_bedrooms_exact", "2_amenities"],
  "missed":  ["finishing_type_mismatch"]
}
```
Used by the UI to render "✓ same district, ✗ finishing differs" chips.

### 5.3 Pseudo-algorithm (new-request match)

```ts
// Phase 1: candidate set (single indexed query)
const candidates = await prisma.property.findMany({
  where: {
    propertyStatus: 'ACTIVE',
    type: request.intent,
    userId: { not: request.userId },
    ...(request.propertyKind && { propertyKind: request.propertyKind }),
    AND: [
      { price: { gte: request.minPrice?.mul(0.85) ?? undefined } },
      { price: { lte: request.maxPrice?.mul(1.15) ?? undefined } },
    ],
    bedrooms: {
      gte: (request.minBedrooms ?? 0) - 1,
      lte: (request.maxBedrooms ?? 99) + 1,
    },
    OR: [
      { governorate: { in: governorateNames } },
      { city:        { in: cityNames } },
      { district:    { in: districtNames } },
      ...(request.centerLatitude ? [bboxClause(request)] : []),
    ],
  },
  take: 500,
});

// Phase 2: score + persist
const rows = candidates
  .map(p => score(p, request))
  .filter(r => r.score >= 40);

await prisma.propertyMatch.createMany({
  data: rows,
  skipDuplicates: true,
});

await prisma.propertyRequest.update({
  where: { id: request.id },
  data:  { lastMatchedAt: new Date() },
});
```

### 5.4 Event triggers

| Event | Runs | Scope |
|---|---|---|
| Request created/updated | Sync: first 50 matches for UX; then enqueue full sweep | All ACTIVE properties passing hard filters |
| Property activated (`PENDING_REVIEW → ACTIVE`) | Queue job | All ACTIVE requests whose hard filters pass |
| Property updated (price/beds/status/etc.) | Queue job | Recompute matches for that `propertyId` |
| Property sold/rented/deactivated | Queue job | Set all matches `status=CLOSED` (soft — audit trail) |
| Nightly cron | BullMQ repeatable | Sweep matches older than 7 days; recompute or drop |

Queues: `match:request`, `match:property`, `match:cleanup`. Worker concurrency: 5 × 20 jobs/s to start; tune with metrics.

---

## 6. API Endpoints (NestJS)

New module: `backend/src/requests/`. Uses existing `JwtAuthGuard` and `PrismaModule`.

### 6.1 Buyer-facing (authenticated)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/requests` | Create a request; returns first 50 inline matches + requestId |
| `GET` | `/requests` | List my requests (`?status=&urgency=&page=&limit=`) |
| `GET` | `/requests/:id` | Detail — owner only |
| `PATCH` | `/requests/:id` | Update criteria → enqueues re-match job |
| `DELETE` | `/requests/:id` | Soft close (`status=CLOSED`) |
| `POST` | `/requests/:id/pause` | `status=PAUSED` — halts new matches |
| `POST` | `/requests/:id/resume` | Back to `ACTIVE` |

### 6.2 Match-facing (authenticated)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/requests/:id/matches` | Paginated top-N with joined property data (`?minScore=&sort=score\|date&page=&limit=`). Owner-only |
| `PATCH` | `/matches/:id` | Update match lifecycle (`status: VIEWED \| CONTACTED \| DISMISSED`). Owner-only |
| `POST` | `/requests/:id/recompute` | Force full rematch. Rate-limited: 1/hour per request |

### 6.3 Seller-facing reverse lookup (authenticated)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/properties/:id/interested-requests` | "Who wants this property?" Returns anonymized request criteria + score. Requires `property.userId = requester.id` |

### 6.4 Internal

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/internal/events/property-activated` | Called by properties service on status transitions. Shared-secret guarded. Enqueues a match job |

### 6.5 Error responses

Use the existing NestJS exception filter:
- `400` — validation (`class-validator`)
- `401` — unauthenticated on protected routes
- `403` — cross-user access attempt
- `404` — request or match not found / not owned
- `429` — recompute rate limit
- `503` — Redis/BullMQ down

All error messages in MSA (فصحى).

---

## 7. DTOs

```ts
// backend/src/requests/dto/create-request.dto.ts
export class CreateRequestDto {
  @IsEnum(PropertyType)                           intent: PropertyType;
  @IsEnum(PropertyKind) @IsOptional()             propertyKind?: PropertyKind;
  @IsString()           @IsOptional()             apartmentType?: string;

  @IsDecimalString()    @IsOptional()             minPrice?: string;
  @IsDecimalString()    @IsOptional()             maxPrice?: string;
  @IsIn(['CASH','INSTALLMENT','ANY']) @IsOptional() paymentPreference?: string;
  @IsIn(['DAILY','MONTHLY','YEARLY']) @IsOptional() rentRateType?: string;

  @IsInt() @Min(0) @IsOptional()                  minBedrooms?: number;
  @IsInt() @Min(0) @IsOptional()                  maxBedrooms?: number;
  @IsInt() @Min(0) @IsOptional()                  minBathrooms?: number;
  @IsInt() @Min(0) @IsOptional()                  maxBathrooms?: number;
  @IsDecimalString()    @IsOptional()             minAreaM2?: string;
  @IsDecimalString()    @IsOptional()             maxAreaM2?: string;

  @IsArray() @IsInt({ each: true }) @IsOptional() locationIds?: number[];
  @IsLatitude()         @IsOptional()             centerLatitude?: number;
  @IsLongitude()        @IsOptional()             centerLongitude?: number;
  @IsDecimalString()    @IsOptional()             searchRadiusKm?: string;

  @IsBoolean()          @IsOptional()             isFurnished?: boolean;
  @IsString()           @IsOptional()             finishingType?: string;
  @IsString()           @IsOptional()             floorLevel?: string;
  @IsString()           @IsOptional()             readiness?: string;
  @IsString()           @IsOptional()             ownershipType?: string;
  @IsArray() @IsString({ each: true }) @IsOptional() preferredAmenities?: string[];

  @IsEnum(RequestUrgency) @IsOptional()           urgency?: RequestUrgency;
  @IsString() @MaxLength(1000) @IsOptional()      notes?: string;
  @IsDateString()         @IsOptional()           expiresAt?: string;
}

// UpdateRequestDto extends PartialType(CreateRequestDto)

// UpdateMatchDto
export class UpdateMatchDto {
  @IsEnum(MatchStatus) status: MatchStatus;
}
```

---

## 8. Indexes & Performance

### 8.1 Indexes (declared in §4)

| Table | Index | Purpose |
|---|---|---|
| `property_requests` | `(intent, propertyKind, status)` | Matching hot path on property activation |
| `property_requests` | `(userId, status)` | "My requests" list |
| `property_requests` | `(status, urgency, createdAt)` | Queue prioritization |
| `property_request_locations` | `(locationId)` | Reverse: "who wants Maadi?" |
| `property_matches` | `(requestId, score DESC)` | Top-N reads for `/requests/:id/matches` |
| `property_matches` | `(propertyId, score DESC)` | Seller reverse view |
| `property_matches` | `(status, lastComputedAt)` | Nightly staleness sweep |

### 8.2 Scaling levers

1. **Bounded candidate set** — `take: 500` per match job; no unbounded scans
2. **Bounding-box prefilter** — lat/lng `BETWEEN` before haversine
3. **Async fanout via BullMQ** — property activation enqueues; never blocks the activator
4. **Partial recompute on property update** — only touch matches for the changed `propertyId`
5. **Match pruning** — `score < 40` never stored
6. **Nightly stale sweep** — delete matches untouched > 7 days
7. **Read replica for `GET /matches`** at scale — writes stay on primary
8. **Future: per-user top-10 inbox cache** — single best match per request for home-feed reads

### 8.3 Capacity estimates (back-of-envelope)

- 10k active requests × 100k active properties → matching engine evaluates ≤500 candidates per match job
- Average match rows per request: ~50 (after `score ≥ 40` filter)
- Expected `property_matches` table size at steady state: ~500k rows → fits comfortably in InnoDB buffer pool with the declared indexes

---

## 9. Privacy & Safety Rails

- Every `/requests/*` and `/matches/*` read enforces `request.userId === requester.id`
- `/properties/:id/interested-requests` enforces `property.userId === requester.id`
- Internal webhook guarded by shared secret env var `INTERNAL_WEBHOOK_SECRET`
- `notes` field scrubbed for phone/email patterns before exposure to sellers (regex in the seller-view mapper)
- Matches only surface properties with `propertyStatus = 'ACTIVE'`; sold/rented/paused listings are hidden on read even if a row exists
- Rate limit on `POST /requests`: 20/hour per user (abuse prevention)
- Rate limit on `POST /requests/:id/recompute`: 1/hour per request
- Dedicated test (`requests.service.spec.ts › cross-user isolation`) asserts user A never sees user B's requests or matches

---

## 10. Testing Strategy

### Backend unit tests
- `scorer.service.spec.ts` — 30+ table-driven cases covering locationScore, priceScore, featureScore edge cases
- `query-builder.service.spec.ts` — hard-filter rules map correctly to Prisma `where`
- `requests.service.spec.ts` — cross-user isolation, privacy scoping, rate limits

### Integration tests
- Request creation → sync first-batch matches returned
- Property activation webhook → BullMQ job enqueued → matches appear
- Property update → existing matches recomputed
- Property sold → matches flipped to `CLOSED`

### E2E (manual for v1)
- 8-step Arabic checklist run against local stack, recorded in the PR description

### Performance smoke
- `k6` script: 100 RPS on `GET /requests/:id/matches` for 60 seconds → p95 < 200ms on seeded dataset (10k matches)

---

## 11. Rollout Plan

1. **Phase A — Schema + sync matching**
   - Prisma migration adds the 3 tables + relations
   - `RequestsModule` with sync matching (no BullMQ yet — runs inline on request create/update, capped at 500 candidates)
   - Frontend form for creating a request (separate PR, out of this spec's scope)

2. **Phase B — Async matching with BullMQ**
   - Introduce Redis dependency + BullMQ queues
   - Property activation/update events enqueue match jobs
   - Workers compute and persist matches off the request path
   - Nightly cleanup cron

3. **Phase C — Reverse seller view + notifications**
   - `GET /properties/:id/interested-requests` surfaced in the seller's property dashboard
   - Push/email/WhatsApp notification on new high-score match (≥80) — **design deferred, not in v1**

Feature flag: `BUYER_REQUESTS_ENABLED` gates the API and the frontend entry point.

---

## 12. Language Policy

All user-facing strings (validation errors, summary messages, empty states) are **Standard Arabic (فصحى / MSA)**. Examples:

| Situation | Template |
|---|---|
| Request created, N matches | `تم إنشاء طلبك، ووجدنا لك {N} عقاراً مطابقاً.` |
| Zero matches | `لا توجد نتائج مطابقة حالياً. سننبهك عند توفر عقارات تطابق طلبك.` |
| Request paused | `تم إيقاف الطلب مؤقتاً.` |
| Rate-limited recompute | `يرجى المحاولة بعد قليل.` |
| Cross-user access denied | `غير مسموح بالوصول إلى هذا الطلب.` |

Colloquial (عامية) strings are **prohibited** in this feature's output.

---

## 13. Resolved Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Derived match table** over SQL view | A view re-runs scoring on every read; the match table is incrementally maintained and cheap to query |
| 2 | **No property-column duplication** on request/match rows | Source of truth stays single; display fields fetched via join on read |
| 3 | **BullMQ + Redis** for async matching | Redis is already a likely future dependency (caching); BullMQ is the NestJS-idiomatic choice |
| 4 | **Multi-select locations via join table** (not JSON array) | Enables indexed reverse lookup ("who wants Maadi?") and reuses the existing `locations` hierarchy |
| 5 | **Two-phase matching** (hard filters → soft score) | Keeps the scored set bounded; avoids O(supply × demand) cross joins |
| 6 | **Score threshold 40** to persist a match | Below that, matches are noise and bloat the index |
| 7 | **Soft close** sold/rented matches (not delete) | Audit trail + future "this property got N contacts" analytics |
| 8 | **Feature kept separate from `005-semsarai-chat`** | Two different bounded contexts (structured demand vs. NLP search). SemsarAI may later read matches via the same API but does not share code |
| 9 | **MSA** for all user-facing output | Consistent with `005` language policy |

---

## 14. File Paths — Quick Index (for implementers)

**Create:**
- `backend/src/requests/requests.module.ts`
- `backend/src/requests/requests.controller.ts`
- `backend/src/requests/requests.service.ts`
- `backend/src/requests/matches.controller.ts`
- `backend/src/requests/matching-engine.service.ts`
- `backend/src/requests/scorer.service.ts`
- `backend/src/requests/query-builder.service.ts`
- `backend/src/requests/queues/match.processor.ts` (Phase B)
- `backend/src/requests/dto/{create-request,update-request,update-match}.dto.ts`
- `backend/src/requests/types/request.types.ts`
- `backend/src/requests/*.spec.ts` (unit + integration)
- `backend/prisma/migrations/<timestamp>_add_property_requests/migration.sql`

**Modify:**
- `backend/prisma/schema.prisma` — add 3 models + 3 enums + 3 relation fields on existing models
- `backend/src/app.module.ts` — register `RequestsModule`
- `backend/.env.example` — add `REDIS_URL`, `INTERNAL_WEBHOOK_SECRET`, `BUYER_REQUESTS_ENABLED`
- `backend/src/config/env.validation.ts` — validate the new vars

**Do NOT modify:**
- Any file under `specs/005-semsarai-chat/`
- `properties` schema columns (only relation field `matches PropertyMatch[]` added)

---

## 15. Verification (once built)

A reviewer should be able to:
1. Run `npx prisma migrate dev` → 3 new tables created, existing tables untouched
2. `POST /requests` with a valid DTO → 201 + first-batch matches returned
3. Inspect DB: `property_requests` has the row, `property_matches` has N rows, **no property columns duplicated anywhere**
4. `GET /requests/:id/matches` → paginated list with joined property data, sorted by score desc
5. Activate a pending property (`PATCH /properties/:id` with `propertyStatus=ACTIVE`) → BullMQ job observable in Redis, new matches appear within seconds
6. As user B, attempt `GET /requests/<user-A-id>` → 404/403, confirm via DB query that user B's request exists and user A's does not leak
7. `PATCH /matches/:id` with `status=DISMISSED` → row updated, no longer surfaces in default `GET /requests/:id/matches`
8. Mark a property `SOLD` → its matches flip to `CLOSED`, disappear from buyer views

---

## 16. Open Questions (to resolve before Phase A)

None — all clarifications resolved in §13. If new questions arise during implementation, append here.
