# Semsar AI Implementation Plan: 2-Phase Architecture

## Goal: Build a controlled real-estate platform with structured data collection (state machine) and algorithm-driven negotiation.

### Phase 1: Guided Data Collection Engine
- **Schema**: Add `PropertyDraft`, `PropertyMedia`, `OnboardingStep`, `PropertyKind`, `MediaType` to Prisma
- **Module**: `OnboardingModule` — Controller (6 endpoints) + Service (state machine)
- **State Machine**: PROPERTY_TYPE → LISTING_TYPE → LOCATION → DETAILS → PRICE → MEDIA → REVIEW → COMPLETED
- **Rules**: One question per step. No skipping. Progressive JSON save. Editable review.
- **Submit**: Validate all fields → create Property → transfer media → mark draft complete
- **Endpoints**: POST /onboarding/start, GET /onboarding/question, POST /onboarding/answer, GET /onboarding/review, POST /onboarding/submit, POST /onboarding/upload-media

### Phase 2: Negotiation Engine
- **Module**: `NegotiationModule` — Controller (3 endpoints) + Service (algorithm)
- **Algorithm**: Anchor at max_price × 0.85. Concession: 5% (round 1-2), 10% (round 3-5), 15% (round 6+). Max 6 rounds.
- **Rules**: AI does NOT decide — only formats messages. Backend algorithm controls all offers.
- **User actions**: accept | reject | request_counter (no free text)
- **Endpoints**: POST /negotiation/start, POST /negotiation/next-step, GET /negotiation/status
- **Messages**: Egyptian Arabic templates for counter/accept/reject

### Full Plan
See `specs/000-master-plan/plan.md` for 74-task breakdown with sprints, exit criteria, and timeline.
