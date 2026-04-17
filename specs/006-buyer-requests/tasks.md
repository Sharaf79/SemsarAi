# Buyer Requests & Matching — Implementation Tasks

**Spec:** `specs/006-buyer-requests/spec.md`
**Total tasks:** 42 (T01–T42)
**Phases:** A (schema + sync matching) · B (async BullMQ) · C (seller reverse view)

Legend:
- **Dep** — task IDs that must complete first
- **Files** — primary paths touched
- **Est** — rough engineering effort (S ≤ 2h · M ≤ 1d · L > 1d)
- **✅** — done · **⏳** — in progress · **⬜** — not started

---

## Phase A — Schema + Sync Matching (MVP)

### A1. Prisma schema

| ID | Task | Dep | Files | Est | Status |
|---|---|---|---|---|---|
| T01 | Add `PropertyRequest` model with all fields, indexes, relations | — | `backend/prisma/schema.prisma` | M | ⬜ |
| T02 | Add `PropertyRequestLocation` join model | T01 | `backend/prisma/schema.prisma` | S | ⬜ |
| T03 | Add `PropertyMatch` model with composite indexes | T01 | `backend/prisma/schema.prisma` | M | ⬜ |
| T04 | Add `RequestUrgency`, `RequestStatus`, `MatchStatus` enums | T01 | `backend/prisma/schema.prisma` | S | ⬜ |
| T05 | Add relation fields to `User`, `Property`, `Location` (one-liners) | T01,T02,T03 | `backend/prisma/schema.prisma` | S | ⬜ |
| T06 | Evaluate + (if needed) add composite `@@index([propertyStatus, type, propertyKind])` on `Property` — EXPLAIN test | T05 | `backend/prisma/schema.prisma` | S | ⬜ |
| T07 | Generate migration `<ts>_add_property_requests` + run on local MySQL | T01–T06 | `backend/prisma/migrations/...` | S | ⬜ |
| T08 | Run `npx prisma generate` + verify types compile across backend | T07 | — | S | ⬜ |

### A2. Types & DTOs

| ID | Task | Dep | Files | Est | Status |
|---|---|---|---|---|---|
| T09 | `CreateRequestDto` with all class-validator decorators | T08 | `backend/src/requests/dto/create-request.dto.ts` | M | ⬜ |
| T10 | `UpdateRequestDto = PartialType(CreateRequestDto)` | T09 | `backend/src/requests/dto/update-request.dto.ts` | S | ⬜ |
| T11 | `UpdateMatchDto` (status-only) | T08 | `backend/src/requests/dto/update-match.dto.ts` | S | ⬜ |
| T12 | Shared type definitions (`MatchReasons`, `ScoreBreakdown`, etc.) | T08 | `backend/src/requests/types/request.types.ts` | S | ⬜ |

### A3. Core services

| ID | Task | Dep | Files | Est | Status |
|---|---|---|---|---|---|
| T13 | `QueryBuilderService` — hard filter → Prisma `where` for candidate set (cap 500) | T08,T12 | `backend/src/requests/query-builder.service.ts` | M | ⬜ |
| T14 | Bounding-box helper for geo radius prefilter | T13 | `backend/src/requests/query-builder.service.ts` | S | ⬜ |
| T15 | `ScorerService` — pure function `(property, request) → ScoreBreakdown` | T12 | `backend/src/requests/scorer.service.ts` | M | ⬜ |
| T16 | `ScorerService.composeReasons` — generate `matched/missed` JSON | T15 | `backend/src/requests/scorer.service.ts` | S | ⬜ |
| T17 | `MatchingEngineService.matchRequest(requestId)` — runs phase 1+2, persists with `createMany({ skipDuplicates: true })`, drops score<40 | T13,T15 | `backend/src/requests/matching-engine.service.ts` | L | ⬜ |
| T18 | `MatchingEngineService.matchProperty(propertyId)` — reverse direction | T17 | `backend/src/requests/matching-engine.service.ts` | M | ⬜ |
| T19 | `MatchingEngineService.closeMatchesForProperty(propertyId)` — soft close | T17 | `backend/src/requests/matching-engine.service.ts` | S | ⬜ |
| T20 | `RequestsService` — CRUD + pause/resume + rate limits + userId scoping | T09,T10,T17 | `backend/src/requests/requests.service.ts` | L | ⬜ |

### A4. Controllers

| ID | Task | Dep | Files | Est | Status |
|---|---|---|---|---|---|
| T21 | `RequestsController` — 7 endpoints (POST/GET list/GET :id/PATCH/DELETE/pause/resume) | T20 | `backend/src/requests/requests.controller.ts` | M | ⬜ |
| T22 | `MatchesController` — GET `/requests/:id/matches` (paginated, joined property data), PATCH `/matches/:id`, POST `/requests/:id/recompute` (1/hr throttle) | T17,T20 | `backend/src/requests/matches.controller.ts` | M | ⬜ |
| T23 | `RequestsModule` — wire services/controllers + import `PrismaModule`, `AuthModule` | T13–T22 | `backend/src/requests/requests.module.ts` | S | ⬜ |
| T24 | Register `RequestsModule` in `AppModule` | T23 | `backend/src/app.module.ts` | S | ⬜ |
| T25 | Add feature flag `BUYER_REQUESTS_ENABLED` gate (returns 404 when off) | T24 | `backend/src/requests/requests.controller.ts`, `matches.controller.ts` | S | ⬜ |
| T26 | Env validation for `BUYER_REQUESTS_ENABLED`, `INTERNAL_WEBHOOK_SECRET` | T25 | `backend/src/config/env.validation.ts`, `backend/.env.example` | S | ⬜ |

### A5. Privacy & safety

| ID | Task | Dep | Files | Est | Status |
|---|---|---|---|---|---|
| T27 | `userId`-scoping guard / filter on all request reads + match reads | T20,T22 | `backend/src/requests/requests.service.ts`, `matches.controller.ts` | M | ⬜ |
| T28 | PII scrub (regex) on `notes` before seller-view exposure | T20 | `backend/src/requests/requests.service.ts` | S | ⬜ |
| T29 | Throttler: 20/hr on `POST /requests`, 1/hr on `/recompute` | T21,T22 | `backend/src/requests/*.controller.ts` | S | ⬜ |

### A6. Tests (Phase A)

| ID | Task | Dep | Files | Est | Status |
|---|---|---|---|---|---|
| T30 | `scorer.service.spec.ts` — 30+ table-driven cases | T15,T16 | `backend/src/requests/scorer.service.spec.ts` | M | ⬜ |
| T31 | `query-builder.service.spec.ts` — hard-filter rule coverage | T13,T14 | `backend/src/requests/query-builder.service.spec.ts` | M | ⬜ |
| T32 | `requests.service.spec.ts` — cross-user isolation (**non-negotiable green test**) | T20,T27 | `backend/src/requests/requests.service.spec.ts` | M | ⬜ |
| T33 | Integration test: request → sync first-batch → matches returned | T17,T21 | `backend/test/requests.e2e-spec.ts` | M | ⬜ |
| T34 | Integration test: rate limits fire at the right thresholds | T29 | `backend/test/requests.e2e-spec.ts` | S | ⬜ |

---

## Phase B — Async matching via BullMQ

| ID | Task | Dep | Files | Est | Status |
|---|---|---|---|---|---|
| T35 | Install `@nestjs/bullmq`, `bullmq`, `ioredis`; add `REDIS_URL` env | T26 | `backend/package.json`, `backend/.env.example`, `env.validation.ts` | S | ⬜ |
| T36 | Register queues `match:request`, `match:property`, `match:cleanup` in `RequestsModule` | T35 | `backend/src/requests/requests.module.ts` | S | ⬜ |
| T37 | `MatchProcessor` — BullMQ workers for the 3 queues, concurrency 5 | T36,T17,T18,T19 | `backend/src/requests/queues/match.processor.ts` | M | ⬜ |
| T38 | Rewire `RequestsService` + `MatchingEngineService` to **enqueue** full sweeps (keep first-50 sync) | T20,T37 | `backend/src/requests/requests.service.ts`, `matching-engine.service.ts` | M | ⬜ |
| T39 | Internal webhook `POST /internal/events/property-activated` + shared-secret guard + enqueue `match:property` | T37 | `backend/src/requests/internal.controller.ts` | M | ⬜ |
| T40 | Emit `property-activated` / `property-updated` / `property-sold` events from existing properties service — minimal hook, no coupling | T39 | `backend/src/properties/properties.service.ts` (add event emit only) | M | ⬜ |
| T41 | Nightly cron via BullMQ repeatable job — sweep matches older than 7 days (recompute or delete) | T37 | `backend/src/requests/queues/match.processor.ts` | M | ⬜ |

---

## Phase C — Seller reverse view + performance hardening

| ID | Task | Dep | Files | Est | Status |
|---|---|---|---|---|---|
| T42 | `GET /properties/:id/interested-requests` endpoint (owner-only, anonymized criteria) | T28,T22 | `backend/src/requests/matches.controller.ts` | M | ⬜ |

---

## Verification checklist (reviewer)

Mirrors spec §15 — every item must pass before merge:

- [ ] V1 · Migration applies cleanly; existing tables untouched
- [ ] V2 · `POST /requests` returns 201 + first-batch matches
- [ ] V3 · DB inspection: no property columns duplicated in `property_requests` or `property_matches`
- [ ] V4 · `GET /requests/:id/matches` returns joined data sorted by score desc, paginated
- [ ] V5 · Activating a property triggers async match job (Phase B only)
- [ ] V6 · User B cannot read user A's requests or matches (T32 green)
- [ ] V7 · `PATCH /matches/:id status=DISMISSED` removes from default match list
- [ ] V8 · Marking property SOLD → matches flip to `CLOSED`
- [ ] V9 · Recompute rate limit returns 429 on second hit within 1 hour
- [ ] V10 · All user-facing strings in MSA (فصحى), no عامية

---

## Task dependency graph (abbreviated)

```
T01 ─► T02,T03,T04,T05 ─► T06 ─► T07 ─► T08
                                         │
                        ┌────────────────┼────────────────┐
                        ▼                ▼                ▼
                     T09,T10,T11       T12              T13,T14
                        │               │                 │
                        └──────► T15 ◄──┘                 │
                                 │                        │
                                 └─► T16 ─► T17 ─────────►│
                                            │             │
                                            ├─► T18       │
                                            └─► T19       │
                                                          │
                                           T20 ◄──────────┘
                                            │
                                    T21, T22, T23 ─► T24 ─► T25 ─► T26
                                            │
                                           T27 ─► T28, T29
                                            │
                                    T30, T31, T32, T33, T34  (Phase A done)

Phase B:  T35 ─► T36 ─► T37 ─► T38, T39, T41
                                 │
                                T40

Phase C:  T42
```

---

## Out of scope for this tasks file

- Frontend work (buyer request form, matches feed UI, seller reverse-view panel) — separate PR/spec
- Push / email / WhatsApp notifications on high-score matches — deferred to v2
- ML-based ranking — v1 scorer is deterministic
- Integration with `005-semsarai-chat` — SemsarAI may later read matches via the same REST API; no code coupling in v1
