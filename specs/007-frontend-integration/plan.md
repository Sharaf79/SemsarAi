# Frontend Integration Plan — Wiring Up Orphaned Features

## Investigation Summary

Claude's investigation found 3 disconnected pieces:

| Piece | Status | Location |
|-------|--------|----------|
| **"اطلب عقار" button** | ❌ Missing from Header.tsx | Backend exists (`requests/`), no CTA button |
| **PropertyWizard (form-based)** | ✅ Already moved to `frontend/src/` | `src/pages/PropertyWizard/` — route exists at `/properties/add` |
| **Request creation flow** | ⚠️ Partial | `CreateRequestModal` exists but not accessible from Header |

**Key finding**: The PropertyWizard is ALREADY in `frontend/src/` and routed at `/properties/add` — Claude's investigation was partially outdated. The real gaps are:

1. No **"اطلب عقار"** (Request Property) button in the Header
2. No direct access to `CreateRequestModal` from the main navigation
3. The `frontend/app/pages/PropertyWizard/` is a duplicate/orphan — should be cleaned up

---

## Phase 1: Header Navigation — Add "اطلب عقار" CTA

**Goal**: Give buyers a clear entry point to request a property.

### Tasks
- [ ] **P1-T01**: Add "اطلب عقار 🔍" button to `Header.tsx`
  - Orange/warm accent color (distinct from green "اضافة عقار")
  - Opens `CreateRequestModal` directly from Header
  - Visible to all users (guests see login prompt)
- [ ] **P1-T02**: Wire `CreateRequestModal` into Header
  - Import modal, manage `isOpen` state
  - On creation success → navigate to `/my-requests`
- [ ] **P1-T03**: Style the button to match existing header design
  - RTL-compatible spacing
  - Responsive (hide text on mobile, show icon only)

**Files touched**:
- `frontend/src/components/Header.tsx`
- `frontend/src/index.css` (minor styling)

**Estimated effort**: ~1 hour

---

## Phase 2: MyRequests Page Polish

**Goal**: Ensure the `/my-requests` page is fully functional and user-friendly.

### Tasks
- [ ] **P2-T01**: Verify `MyRequestsPage.tsx` works end-to-end
  - Create request → see it listed → see matches → interact
- [ ] **P2-T02**: Add empty state when user has no requests
  - Friendly illustration + "اطلب عقارك الأول" CTA
- [ ] **P2-T03**: Add loading skeletons for request cards and match cards
- [ ] **P2-T04**: Verify match interaction flow (view property, interested, dismiss)

**Files touched**:
- `frontend/src/pages/MyRequestsPage.tsx`

**Estimated effort**: ~2 hours

---

## Phase 3: CreateRequestModal Enhancement

**Goal**: Make the request form more powerful with location selection.

### Tasks
- [ ] **P3-T01**: Add location picker to `CreateRequestModal`
  - Use existing `getGovernorates` / `getCities` / `getDistricts` APIs
  - Multi-select for areas (match backend `locationIds` field)
- [ ] **P3-T02**: Add area range fields (minAreaM2 / maxAreaM2)
- [ ] **P3-T03**: Add expiration date picker
- [ ] **P3-T04**: Improve form validation and error messages

**Files touched**:
- `frontend/src/components/CreateRequestModal.tsx`

**Estimated effort**: ~3 hours

---

## Phase 4: Cleanup — Remove Orphaned Files

**Goal**: Remove dead code and duplicates.

### Tasks
- [ ] **P4-T01**: Delete `frontend/app/pages/PropertyWizard/` (duplicate of `src/pages/PropertyWizard/`)
- [ ] **P4-T02**: Review `frontend/app/` directory — identify what else is unused
- [ ] **P4-T03**: Remove any stale CSS references to deleted components

**Files deleted**:
- `frontend/app/pages/PropertyWizard/` (entire directory)

**Estimated effort**: ~30 min

---

## Phase 5: HomePage — Request CTA Integration

**Goal**: Add a prominent "اطلب عقار" section to the homepage for discoverability.

### Tasks
- [ ] **P5-T01**: Add a hero/banner section or floating CTA on `HomePage.tsx`
  - "مش لاقي عقارك؟ اطلبه وهندورلك!" (Can't find your property? Request it and we'll search!)
  - Links to request creation flow
- [ ] **P5-T02**: Add "Featured Requests" or "Recent Matches" section if applicable

**Files touched**:
- `frontend/src/pages/HomePage.tsx`

**Estimated effort**: ~2 hours

---

## Dependency Graph

```
Phase 1 (Header CTA) ←── prerequisite for everything
    │
    ├── Phase 2 (MyRequests polish) ←── independent, can run in parallel
    │
    ├── Phase 3 (Modal enhancement) ←── builds on Phase 1
    │
    ├── Phase 4 (Cleanup) ←── independent, can run anytime
    │
    └── Phase 5 (HomePage CTA) ←── builds on Phase 1
```

## Total Estimated Effort: ~8.5 hours

## Immediate Next Step
Start with **Phase 1** — it's the smallest, highest-impact change that unlocks the buyer request flow for users.
