# User Menu — Implementation Tasks

**Created**: 2026-04-11
**Spec**: [user-menu-spec.md](./user-menu-spec.md)
**Status**: Ready for implementation

---

## Phase 0: User Menu Component + Header Refactor
> **Goal**: Dropdown menu from the avatar icon with all navigation items.
> **Estimate**: 1–2 hours · **Depends on**: Nothing

### Task 0.1 — Create `<UserMenu />` component
- **File**: `frontend/src/components/UserMenu.tsx` (new)
- **What**:
  - Renders a dropdown panel when user clicks avatar in Header
  - Top section: avatar circle (first letter of name), `user.name`, masked phone `01x****xxxx`
  - Menu items as `<Link>` or `<button>` — each with icon + Arabic label
  - Click outside or backdrop → close
  - Items for logged-in user:
    ```
    👤 الملف الشخصي          → /profile
    ──────────
    📋 إعلاناتي              → /my-listings
    ➕ أضف إعلان جديد         → openChat('أضيف عقار 🏠')
    ──────────
    ❤️ المفضّلة              → /favorites        (disabled badge: "قريباً")
    ──────────
    ❓ المساعدة              → /help
    ──────────
    🚪 تسجيل الخروج          → logout() + navigate('/')
    ```
  - Items for logged-out user: only "تسجيل الدخول" button

### Task 0.2 — Refactor `Header.tsx` to use `<UserMenu />`
- **File**: `frontend/src/components/Header.tsx` (edit)
- **What**:
  - Replace the inline name + logout button with a clickable avatar
  - On click → toggle `<UserMenu />` dropdown
  - Keep "اضافة عقار" button visible in header (outside menu)
  - Pass `onLoginClick` to `<UserMenu />` for unauthenticated users

### Task 0.3 — CSS for UserMenu
- **File**: `frontend/src/index.css` (append)
- **What**:
  - `.user-menu` — absolute positioned dropdown, `width: 300px`, `direction: rtl`
  - `.user-menu__backdrop` — `position: fixed; inset: 0; background: transparent`
  - `.user-menu__identity` — avatar + name + phone row
  - `.user-menu__item` — icon + label row, hover state
  - `.user-menu__divider` — thin line between sections
  - Slide-down animation, shadow, rounded corners

---

## Phase 1: Profile Page
> **Goal**: User can view and edit their name and email.
> **Estimate**: 1 hour · **Depends on**: Phase 0

### Task 1.1 — Create `ProfilePage.tsx`
- **File**: `frontend/src/pages/ProfilePage.tsx` (new)
- **What**:
  - Route: `/profile` (auth required — redirect to `/` if not logged in)
  - Layout: centered card with form fields
  - Fields:
    - رقم الهاتف (`phone`) — read-only, displayed
    - الاسم (`name`) — text input, pre-filled from `user.name`
    - البريد الإلكتروني (`email`) — text input, pre-filled from `user.email`
  - Submit button: "حفظ التعديلات"
  - On submit: call `PATCH /auth/profile` with `{ name, email }`
  - On success: update AuthContext via `updateUser()`, show toast
  - Back button → navigate(-1)
- **API**: Uses existing `updateProfile()` from `frontend/src/api/auth.ts` ✅
- **Backend**: `PATCH /auth/profile` already exists ✅

### Task 1.2 — Add route to `App.tsx`
- **File**: `frontend/src/App.tsx` (edit)
- **What**: Add `<Route path="/profile" element={<ProfilePage />} />`
- **Import**: `import { ProfilePage } from './pages/ProfilePage'`

---

## Phase 2: My Listings — Backend
> **Goal**: API to fetch, edit status, and delete the current user's properties.
> **Estimate**: 1–2 hours · **Depends on**: Nothing

### Task 2.1 — Add `GET /properties/mine` endpoint
- **File**: `backend/src/properties/properties.controller.ts` (edit)
- **What**:
  - New `@Get('mine')` endpoint, `@UseGuards(JwtAuthGuard)`
  - Must be declared **before** `@Get(':id')` to avoid route conflict
  - Calls `propertiesService.findMine(userId)`
  - Returns `{ data: Property[], meta: { total } }`

### Task 2.2 — Add `findMine()` to PropertiesService
- **File**: `backend/src/properties/properties.service.ts` (edit)
- **What**:
  ```ts
  async findMine(userId: string) {
    const data = await this.prisma.property.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { ...PUBLIC_PROPERTY_SELECT, userId: true },
    });
    return { data, meta: { total: data.length } };
  }
  ```

### Task 2.3 — Add `PATCH /properties/:id/status` endpoint
- **File**: `backend/src/properties/properties.controller.ts` (edit)
- **What**:
  - `@Patch(':id/status')`, `@UseGuards(JwtAuthGuard)`
  - Body DTO: `{ status: 'ACTIVE' | 'INACTIVE' }`
  - Verify `property.userId === currentUser.id` (ownership check)
  - Updates `propertyStatus` field

### Task 2.4 — Add `updateStatus()` to PropertiesService
- **File**: `backend/src/properties/properties.service.ts` (edit)
- **What**:
  ```ts
  async updateStatus(propertyId: string, userId: string, status: PropertyStatus) {
    const prop = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!prop) throw new NotFoundException();
    if (prop.userId !== userId) throw new ForbiddenException();
    return this.prisma.property.update({
      where: { id: propertyId },
      data: { propertyStatus: status },
    });
  }
  ```

### Task 2.5 — Add `DELETE /properties/:id` endpoint
- **File**: `backend/src/properties/properties.controller.ts` (edit)
- **What**:
  - `@Delete(':id')`, `@UseGuards(JwtAuthGuard)`
  - Verify ownership
  - Soft-delete: set `propertyStatus = INACTIVE` (or hard-delete via `prisma.property.delete`)

### Task 2.6 — Add DTO for status update
- **File**: `backend/src/properties/dto/update-status.dto.ts` (new)
- **What**: `class UpdatePropertyStatusDto { @IsEnum(['ACTIVE','INACTIVE']) status: string }`

---

## Phase 3: My Listings — Frontend
> **Goal**: Page showing user's own properties with manage actions.
> **Estimate**: 2–3 hours · **Depends on**: Phase 2

### Task 3.1 — Add API functions
- **File**: `frontend/src/api/properties.ts` (edit)
- **What**:
  ```ts
  export async function fetchMyProperties(): Promise<PropertiesResponse> { ... }
  export async function updatePropertyStatus(id: string, status: string): Promise<void> { ... }
  export async function deleteProperty(id: string): Promise<void> { ... }
  ```

### Task 3.2 — Create `MyListingsPage.tsx`
- **File**: `frontend/src/pages/MyListingsPage.tsx` (new)
- **What**:
  - Route: `/my-listings` (auth required)
  - Header: "إعلاناتي" + count
  - Uses `useQuery('my-listings', fetchMyProperties)`
  - Renders each property as a `PropertyCard` variant with:
    - Status badge: نشط (green) / غير نشط (gray) / مباع / مؤجر
    - Action buttons below card:
      - ⏸️ إيقاف / ▶️ تفعيل — toggles ACTIVE/INACTIVE
      - 🗑️ حذف — confirmation dialog, then delete
  - Empty state: "لم تقم بإضافة إعلانات بعد" + "أضف إعلانك الأول" button
  - "أضف إعلان جديد" FAB button → `openChat('أضيف عقار 🏠')`

### Task 3.3 — Add route to `App.tsx`
- **File**: `frontend/src/App.tsx` (edit)
- **What**: Add `<Route path="/my-listings" element={<MyListingsPage />} />`

### Task 3.4 — CSS for MyListingsPage
- **File**: `frontend/src/index.css` (append)
- **What**: Status badge styles, action button row, empty state

---

## Phase 4: Favorites — Backend
> **Goal**: Favorite/unfavorite properties, list favorites.
> **Estimate**: 2 hours · **Depends on**: Nothing

### Task 4.1 — Add Prisma `Favorite` model
- **File**: `backend/prisma/schema.prisma` (edit)
- **What**:
  ```prisma
  model Favorite {
    id         String   @id @default(uuid())
    userId     String   @map("user_id")
    propertyId String   @map("property_id")
    createdAt  DateTime @default(now()) @map("created_at")
    user       User     @relation(fields: [userId], references: [id])
    property   Property @relation(fields: [propertyId], references: [id])
    @@unique([userId, propertyId])
    @@index([userId])
    @@map("favorites")
  }
  ```
  - Add `favorites Favorite[]` to `User` model
  - Add `favorites Favorite[]` to `Property` model

### Task 4.2 — Run migration
- **Command**: `cd backend && npx prisma migrate dev --name add-favorites`

### Task 4.3 — Create FavoritesModule
- **Files** (all new):
  - `backend/src/favorites/favorites.module.ts`
  - `backend/src/favorites/favorites.service.ts`
  - `backend/src/favorites/favorites.controller.ts`
- **Endpoints**:
  - `POST /favorites/:propertyId` — add (upsert-safe)
  - `DELETE /favorites/:propertyId` — remove
  - `GET /favorites` — list user's favorites with full property data
  - `GET /favorites/ids` — returns just `propertyId[]` (for heart icon state on listing page)

### Task 4.4 — Register FavoritesModule in AppModule
- **File**: `backend/src/app.module.ts` (edit)

---

## Phase 5: Favorites — Frontend
> **Goal**: Heart button on cards, favorites page.
> **Estimate**: 2 hours · **Depends on**: Phase 4

### Task 5.1 — Add API functions
- **File**: `frontend/src/api/favorites.ts` (new)
- **What**:
  ```ts
  export async function addFavorite(propertyId: string): Promise<void> { ... }
  export async function removeFavorite(propertyId: string): Promise<void> { ... }
  export async function fetchFavorites(): Promise<Property[]> { ... }
  export async function fetchFavoriteIds(): Promise<string[]> { ... }
  ```

### Task 5.2 — Add heart toggle to `PropertyCard.tsx`
- **File**: `frontend/src/components/PropertyCard.tsx` (edit)
- **What**:
  - New prop: `isFavorited?: boolean`, `onToggleFavorite?: (id: string) => void`
  - Render ❤️ (filled red) / 🤍 (outline) button at top-right of image
  - On click: call `onToggleFavorite` (parent manages state)

### Task 5.3 — Favorites context or hook
- **File**: `frontend/src/store/FavoritesContext.tsx` (new) or hook `useFavorites.ts`
- **What**: Load favorite IDs on mount for authenticated users, provide `toggle(id)` function

### Task 5.4 — Create `FavoritesPage.tsx`
- **File**: `frontend/src/pages/FavoritesPage.tsx` (new)
- **What**:
  - Route: `/favorites` (auth required)
  - Uses `fetchFavorites()` → renders `PropertyCard` list
  - Empty state: "لا توجد إعلانات مفضّلة" with link to browse

### Task 5.5 — Add route + wire up
- **File**: `frontend/src/App.tsx` (edit)
- **File**: `frontend/src/pages/HomePage.tsx` (edit) — pass favorites state to PropertyGrid

---

## Phase 6: Help Page (Static)
> **Goal**: Simple FAQ page.
> **Estimate**: 30 min · **Depends on**: Phase 0

### Task 6.1 — Create `HelpPage.tsx`
- **File**: `frontend/src/pages/HelpPage.tsx` (new)
- **What**:
  - Route: `/help`
  - Arabic FAQ accordion (collapsible sections):
    1. كيف أضيف عقاري؟
    2. كيف أتواصل مع صاحب العقار؟
    3. كيف يعمل التفاوض؟
    4. كيف أعدل أو أحذف إعلاني؟
    5. هل الخدمة مجانية؟
  - Contact section: email + WhatsApp link
  - Back button → navigate(-1)

### Task 6.2 — Add route to `App.tsx`
- **File**: `frontend/src/App.tsx` (edit)

---

## Implementation Order (Dependency Graph)

```
Phase 0 ──→ Phase 1 ──→ (done: profile)
   │
   ├──→ Phase 6 (help page — trivial, can do anytime)
   │
   └──→ Phase 3 ──→ (done: my listings frontend)
            ↑
        Phase 2 (my listings backend)

Phase 4 ──→ Phase 5 (favorites)
```

### Recommended Execution Sequence

| Order | Phase | What | Effort |
|---|---|---|---|
| 1 | **Phase 0** | UserMenu component + Header refactor | ~1h |
| 2 | **Phase 1** | Profile page | ~1h |
| 3 | **Phase 2** | My Listings backend (3 endpoints) | ~1.5h |
| 4 | **Phase 3** | My Listings frontend page | ~2h |
| 5 | **Phase 6** | Help page (static) | ~0.5h |
| 6 | **Phase 4** | Favorites backend (Prisma model + module) | ~2h |
| 7 | **Phase 5** | Favorites frontend (heart + page) | ~2h |
| | | **Total** | **~10h** |

---

## Files Changed / Created Summary

### New Files (14)
| File | Phase |
|---|---|
| `frontend/src/components/UserMenu.tsx` | 0 |
| `frontend/src/pages/ProfilePage.tsx` | 1 |
| `frontend/src/pages/MyListingsPage.tsx` | 3 |
| `frontend/src/pages/FavoritesPage.tsx` | 5 |
| `frontend/src/pages/HelpPage.tsx` | 6 |
| `frontend/src/api/favorites.ts` | 5 |
| `frontend/src/store/FavoritesContext.tsx` | 5 |
| `backend/src/favorites/favorites.module.ts` | 4 |
| `backend/src/favorites/favorites.service.ts` | 4 |
| `backend/src/favorites/favorites.controller.ts` | 4 |
| `backend/src/properties/dto/update-status.dto.ts` | 2 |
| `backend/prisma/migrations/xxx_add_favorites/` | 4 |

### Modified Files (8)
| File | Phase | Change |
|---|---|---|
| `frontend/src/components/Header.tsx` | 0 | Refactor to use UserMenu |
| `frontend/src/App.tsx` | 1,3,5,6 | Add 4 routes |
| `frontend/src/index.css` | 0,3 | Menu + page styles |
| `frontend/src/api/properties.ts` | 3 | Add mine/status/delete functions |
| `frontend/src/components/PropertyCard.tsx` | 5 | Add heart toggle |
| `backend/src/properties/properties.controller.ts` | 2 | Add mine/status/delete endpoints |
| `backend/src/properties/properties.service.ts` | 2 | Add findMine/updateStatus/delete |
| `backend/src/app.module.ts` | 4 | Register FavoritesModule |
| `backend/prisma/schema.prisma` | 4 | Add Favorite model |

---

## Deferred (Phase 7+, not in this plan)

| Feature | Reason |
|---|---|
| Saved Searches | Low priority, needs FiltersSidebar integration |
| Settings page | Low priority, minimal user preferences in MVP |
| Public profile (`/user/:id`) | Low priority, no user-facing link yet |
| Account deletion | Low priority, regulatory requirement for later |
