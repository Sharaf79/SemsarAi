# Second Phase — Buyer Requests Frontend (spec 006)

## Context

Semsar AI is a NestJS 11 + React + Vite property platform targeting the Egyptian market.
The backend already has a complete buyer-requests API (spec 006 Phase A — already live on `main`).
This phase adds the **frontend** for that API: a nav button, a full "My Requests" page, and a
"Create Request" modal.

All user-facing text **must** be in Modern Standard Arabic (فصحى مهذّبة), no colloquial Egyptian.

---

## Tech stack (frontend)

- React 18 + TypeScript
- React Router v6 (`<BrowserRouter>`)
- TanStack Query v5 (`useQuery` / `useMutation`)
- Axios via a shared `apiClient` (see §3)
- CSS via plain class names (no Tailwind, no CSS-modules — existing `.css` files in `src/`)

---

## Existing files to MODIFY

### 1. `frontend/src/components/Header.tsx`

Current relevant snippet (lines 20-35):

```tsx
<button
  className="btn btn-primary btn-sm"
  onClick={() => openChat('أضيف عقار 🏠')}
  style={{ marginLeft: '12px', background: '#25D366' }}
>
  اضافة عقار 🏠
</button>
```

**Add** a second button immediately **after** the green "اضافة عقار" button, visible only when
`isAuthenticated === true`:

```tsx
{isAuthenticated && (
  <Link
    to="/my-requests"
    className="btn btn-primary btn-sm"
    style={{ marginLeft: '8px', background: '#4F46E5' }}
  >
    🔍 طلباتي
  </Link>
)}
```

Add `import { Link } from 'react-router-dom';` at the top if not already present.

---

### 2. `frontend/src/components/UserMenu.tsx`

Add a menu item for "طلباتي" between the "إعلاناتي" block and the "المفضّلة" block:

```tsx
<Link to="/my-requests" className="user-menu__item" onClick={onClose}>
  <span className="user-menu__item-icon">🔍</span>
  <span>طلباتي</span>
</Link>
```

---

### 3. `frontend/src/App.tsx`

Add the import and route:

```tsx
import { MyRequestsPage } from './pages/MyRequestsPage';

// inside <Routes>:
<Route path="/my-requests" element={<MyRequestsPage />} />
```

---

## Existing files to READ (do NOT modify)

### `frontend/src/api/client.ts` — shared Axios instance

```ts
import axios from 'axios';
const BASE_URL = '/api';
export const apiClient = axios.create({ baseURL: BASE_URL, ... });
// attaches Bearer token from localStorage('semsar_token') automatically
// auto-dispatches 'semsar:logout' event on 401
```

### `frontend/src/store/AuthContext.tsx`

```ts
// useAuth() returns:
//   { isAuthenticated: boolean; token: string|null; user: User|null; login; logout; }
```

### Pattern reference — `frontend/src/pages/FavoritesPage.tsx`

Use this page as the structural template (Header import, useQuery pattern, empty-state, spinner).

---

## New files to CREATE

### 4. `frontend/src/api/requests.ts`

```ts
import { apiClient } from './client';

export type RequestIntent   = 'SALE' | 'RENT';
export type RequestStatus   = 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'EXPIRED';
export type RequestUrgency  = 'LOW' | 'MEDIUM' | 'HIGH';
export type MatchStatus     = 'NEW' | 'VIEWED' | 'INTERESTED' | 'DISMISSED' | 'CLOSED';

export interface PropertyRequest {
  id: string;
  intent: RequestIntent;
  propertyKind: string | null;
  minPrice: string | null;
  maxPrice: string | null;
  minBedrooms: number | null;
  maxBedrooms: number | null;
  minAreaM2: string | null;
  maxAreaM2: string | null;
  urgency: RequestUrgency;
  status: RequestStatus;
  notes: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyMatch {
  id: string;
  score: number;
  status: MatchStatus;
  reasons: { matched: string[]; missed: string[] };
  property: {
    id: string;
    title: string;
    price: string;
    governorate: string | null;
    city: string | null;
    district: string | null;
    bedrooms: number | null;
    areaM2: string | null;
    propertyKind: string | null;
    media: { url: string }[];
  };
  matchedAt: string;
}

export interface CreateRequestPayload {
  intent: RequestIntent;
  propertyKind?: string;
  minPrice?: string;
  maxPrice?: string;
  minBedrooms?: number;
  maxBedrooms?: number;
  minAreaM2?: string;
  maxAreaM2?: string;
  urgency?: RequestUrgency;
  notes?: string;
  locationIds?: number[];
  expiresAt?: string;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listRequests(params?: {
  status?: RequestStatus;
  page?: number;
  limit?: number;
}) {
  const { data } = await apiClient.get<{
    data: PropertyRequest[];
    meta: { total: number; page: number; limit: number };
  }>('/requests', { params });
  return data;
}

export async function createRequest(payload: CreateRequestPayload) {
  const { data } = await apiClient.post<{ data: PropertyRequest; matches: PropertyMatch[]; matchedCount: number }>(
    '/requests',
    payload,
  );
  return data;
}

export async function getRequest(id: string) {
  const { data } = await apiClient.get<{ data: PropertyRequest }>(`/requests/${id}`);
  return data;
}

export async function pauseRequest(id: string) {
  const { data } = await apiClient.post(`/requests/${id}/pause`);
  return data;
}

export async function resumeRequest(id: string) {
  const { data } = await apiClient.post(`/requests/${id}/resume`);
  return data;
}

export async function deleteRequest(id: string) {
  const { data } = await apiClient.delete(`/requests/${id}`);
  return data;
}

export async function getMatches(requestId: string, params?: { status?: MatchStatus; page?: number }) {
  const { data } = await apiClient.get<{
    data: PropertyMatch[];
    meta: { total: number; page: number; limit: number };
  }>(`/requests/${requestId}/matches`, { params });
  return data;
}

export async function updateMatch(matchId: string, status: MatchStatus) {
  const { data } = await apiClient.patch(`/matches/${matchId}`, { status });
  return data;
}

export async function recomputeRequest(id: string) {
  const { data } = await apiClient.post(`/requests/${id}/recompute`);
  return data;
}
```

---

### 5. `frontend/src/pages/MyRequestsPage.tsx`

Full implementation requirements:

**Layout** (copy structure from `FavoritesPage.tsx`):
```
<Header onLoginClick={() => {}} />
<div className="my-requests-page">
  ...
</div>
```

**Redirect**: If `!isAuthenticated`, redirect to `/` using `useNavigate`.

**State**:
- `activeRequestId: string | null` — which request's matches panel is expanded
- `showCreateModal: boolean`

**Section 1 — Request list** (TanStack Query):
```ts
const { data, isLoading, refetch } = useQuery({
  queryKey: ['requests'],
  queryFn: () => listRequests(),
  enabled: isAuthenticated,
});
const requests = data?.data ?? [];
```

Render each `PropertyRequest` as a card with:
- Title: intent label (SALE → "شراء", RENT → "إيجار") + propertyKind
- Budget range: `minPrice – maxPrice` (formatted with `toLocaleString('ar-EG')`)
- Bedrooms range if present
- Status badge: ACTIVE → green "نشط", PAUSED → yellow "موقوف", CLOSED/EXPIRED → gray
- Urgency badge: HIGH → red "عاجل", MEDIUM → orange "متوسط", LOW → gray "عادي"
- Three action buttons:
  - "عرض التطابقات 🔍" → sets `activeRequestId`
  - "إيقاف مؤقت ⏸" / "استئناف ▶" (toggle based on status) → call `pauseRequest` / `resumeRequest` then `refetch()`
  - "حذف 🗑" → confirm dialog → `deleteRequest` then `refetch()`

**Section 2 — Matches panel** (shown when `activeRequestId` is set):
```ts
const { data: matchData } = useQuery({
  queryKey: ['matches', activeRequestId],
  queryFn: () => getMatches(activeRequestId!),
  enabled: !!activeRequestId,
});
```

Each match card shows:
- Property thumbnail (first media URL, fallback to placeholder `🏠`)
- Score badge (0–100, color: ≥75 green / ≥55 yellow / else red)
- Property title + location (governorate / city / district)
- Price formatted
- `reasons.matched` as small green pills, `reasons.missed` as small gray pills
- Status dropdown (NEW/VIEWED/INTERESTED/DISMISSED) → calls `updateMatch` on change
- "فتح العقار →" link to `/property/{property.id}`

Add a "إعادة حساب 🔄" button (calls `recomputeRequest`) with a disabled state for 30s after click
(cooldown is 1 hour server-side, but 30s client debounce is enough).

**Section 3 — Empty state**:
```tsx
{!isLoading && requests.length === 0 && (
  <div className="empty-state">
    <div className="empty-state__icon">🔍</div>
    <div className="empty-state__title">لا توجد طلبات بحث بعد</div>
    <div className="empty-state__sub">أضف طلبك الأول وسنجد لك أفضل العقارات المطابقة</div>
    <button className="btn btn-primary btn-lg" onClick={() => setShowCreateModal(true)}>
      ➕ أضف طلب بحث
    </button>
  </div>
)}
```

**FAB button** (Floating Action Button) — always visible at bottom-right:
```tsx
<button
  className="fab"
  onClick={() => setShowCreateModal(true)}
  title="طلب بحث جديد"
  style={{ position:'fixed', bottom:'24px', left:'24px', zIndex:1000,
           background:'#4F46E5', color:'#fff', border:'none',
           borderRadius:'50%', width:'56px', height:'56px',
           fontSize:'24px', cursor:'pointer', boxShadow:'0 4px 12px rgba(0,0,0,0.2)' }}
>
  ➕
</button>
```

---

### 6. `frontend/src/components/CreateRequestModal.tsx`

A modal dialog (use existing `AuthModal` as style reference for the overlay + modal box).

**Props**:
```ts
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void; // called after successful creation → triggers refetch
}
```

**Form fields** (all optional except `intent`):

| Field | Input type | Arabic label |
|---|---|---|
| `intent` | radio: SALE / RENT | "نوع الطلب" — "شراء" / "إيجار" |
| `propertyKind` | select | "نوع العقار" — شقة / فيلا / محل / مكتب / أرض |
| `minPrice` | number | "أقل سعر (جنيه)" |
| `maxPrice` | number | "أعلى سعر (جنيه)" |
| `minBedrooms` | number | "أقل عدد غرف" |
| `maxBedrooms` | number | "أعلى عدد غرف" |
| `urgency` | select: LOW/MEDIUM/HIGH | "مستوى الأهمية" — عادي / متوسط / عاجل |
| `notes` | textarea maxLength=1000 | "ملاحظات إضافية" |

**Submit** (`useMutation`):
```ts
const mutation = useMutation({
  mutationFn: createRequest,
  onSuccess: () => { onCreated(); onClose(); },
});
```

Show inline error if mutation fails. Show spinner on `mutation.isPending`.

---

## CSS classes to add

Add to `frontend/src/index.css` (or any existing CSS file):

```css
/* ── My Requests Page ─────────────────────────── */
.my-requests-page { max-width: 960px; margin: 24px auto; padding: 0 16px; }
.my-requests-page__title { font-size: 1.5rem; font-weight: 700; margin-bottom: 20px; }

.request-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.request-card__header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.request-card__title { font-size: 1rem; font-weight: 600; flex: 1; }
.request-card__actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}
.badge--green  { background: #d1fae5; color: #065f46; }
.badge--yellow { background: #fef3c7; color: #92400e; }
.badge--red    { background: #fee2e2; color: #991b1b; }
.badge--gray   { background: #f3f4f6; color: #6b7280; }

.matches-panel {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}
.match-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.match-card__img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
}
.match-card__body { flex: 1; }
.score-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 700;
  color: #fff;
}
.score-badge--green  { background: #059669; }
.score-badge--yellow { background: #d97706; }
.score-badge--red    { background: #dc2626; }

.pill {
  display: inline-flex;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.7rem;
  margin: 2px;
}
.pill--matched { background: #d1fae5; color: #065f46; }
.pill--missed  { background: #f3f4f6; color: #6b7280; }
```

---

## Backend API reference (live on localhost:3000)

All endpoints require `Authorization: Bearer <token>` — handled automatically by `apiClient`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/requests` | List own requests (paginated) |
| POST | `/api/requests` | Create request + sync first 50 matches |
| GET | `/api/requests/:id` | Get single request |
| PATCH | `/api/requests/:id` | Update request fields |
| DELETE | `/api/requests/:id` | Close (soft delete) |
| POST | `/api/requests/:id/pause` | Pause |
| POST | `/api/requests/:id/resume` | Resume |
| GET | `/api/requests/:id/matches` | Get matches (paginated) |
| POST | `/api/requests/:id/recompute` | Re-run matching (1h cooldown) |
| PATCH | `/api/matches/:id` | Update match status |

### Create request response shape
```json
{
  "data": { /* PropertyRequest */ },
  "matches": [ /* PropertyMatch[] first batch */ ],
  "matchedCount": 12
}
```

---

## File summary — what to create / edit

| Action | File |
|---|---|
| **EDIT** | `frontend/src/components/Header.tsx` |
| **EDIT** | `frontend/src/components/UserMenu.tsx` |
| **EDIT** | `frontend/src/App.tsx` |
| **CREATE** | `frontend/src/api/requests.ts` |
| **CREATE** | `frontend/src/pages/MyRequestsPage.tsx` |
| **CREATE** | `frontend/src/components/CreateRequestModal.tsx` |
| **EDIT** | `frontend/src/index.css` (append CSS block) |

---

## Constraints

1. Do NOT modify any backend files.
2. Do NOT modify any existing CSS class names that already exist.
3. Arabic text only — no English user-facing strings.
4. Use `apiClient` from `frontend/src/api/client.ts` — do not create a new Axios instance.
5. Use TanStack Query (`useQuery` / `useMutation`) — no `useEffect` + `fetch`.
6. The `CreateRequestModal` must reuse the visual style of `AuthModal` (same overlay, same modal box).
7. Vite proxies `/api/*` → `http://localhost:3000/*` — do not include the port in any URL.
