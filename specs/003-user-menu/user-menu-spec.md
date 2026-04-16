# User Menu — Feature Specification

**Created**: 2026-04-11
**Status**: Draft
**Reference**: Dubizzle Egypt user menu (attached screenshot)

---

## Overview

A slide-out / dropdown user menu accessible from the Header avatar/icon. Contains all user-facing actions grouped into logical sections. RTL layout, Arabic labels.

---

## Menu Structure & Item Specifications

### ── Section 1: Profile ────────────────────────────────────

#### 1.1 User Identity Card (top of menu)
| Attribute | Value |
|---|---|
| **Label** | `{user.name}` + avatar circle |
| **Status** | 🟡 Partially exists — Header shows name+avatar inline, but no menu panel |
| **Backend** | `GET /auth/profile` ✅ exists |
| **Frontend** | Display `user.name`, `user.phone` (masked: `010****1234`), avatar initial |
| **Action** | Static display, no click |

#### 1.2 عرض وتعديل الملف الشخصي (View & Edit Profile)
| Attribute | Value |
|---|---|
| **Label** | عرض ملف التعريف الخاص بك وتعديله |
| **Icon** | 👤 |
| **Status** | 🟡 Backend exists, no frontend page |
| **Backend** | `GET /auth/profile` ✅ · `PATCH /auth/profile` ✅ (name, email) |
| **Frontend route** | `/profile` (new page) |
| **Page contents** | Editable form: الاسم (`name`), البريد الإلكتروني (`email`), رقم الهاتف (`phone`, read-only) |
| **DB fields** | `users.name`, `users.email`, `users.phone` |
| **Priority** | 🔴 High |

---

### ── Section 2: Listings ───────────────────────────────────

#### 2.1 إعلاناتي (My Listings)
| Attribute | Value |
|---|---|
| **Label** | إعلاناتي |
| **Icon** | 📋 |
| **Status** | 🔴 Does not exist |
| **Backend needed** | `GET /properties/mine` — returns properties where `userId = currentUser.id`, ordered by `createdAt DESC` |
| **Frontend route** | `/my-listings` (new page) |
| **Page contents** | List of user's own properties using `PropertyCard`, with status badge (نشط / غير نشط / مباع / مؤجر). Each card has actions: تعديل (edit), حذف (delete), إيقاف/تفعيل (toggle active) |
| **DB query** | `SELECT * FROM properties WHERE user_id = ? ORDER BY created_at DESC` |
| **Auth** | 🔒 Requires login |
| **Priority** | 🔴 High |

#### 2.2 إضافة إعلان جديد (Add New Listing)
| Attribute | Value |
|---|---|
| **Label** | أضف إعلان جديد |
| **Icon** | ➕ |
| **Status** | ✅ Exists — triggers chat onboarding via `openChat('أضيف عقار 🏠')` |
| **Action** | Opens chat widget with onboarding flow |
| **Priority** | ✅ Done |

---

### ── Section 3: Favorites & Saved Searches ──────────────

#### 3.1 الإعلانات المفضّلة (Favorite Listings)
| Attribute | Value |
|---|---|
| **Label** | الإعلانات المفضّلة |
| **Icon** | ❤️ |
| **Status** | 🔴 Does not exist |
| **Backend needed** | New `Favorite` model + endpoints |
| **New DB model** | `favorites` table: `id`, `user_id`, `property_id`, `created_at` (unique on `user_id + property_id`) |
| **Endpoints** | `POST /favorites/:propertyId` (add), `DELETE /favorites/:propertyId` (remove), `GET /favorites` (list user's favorites) |
| **Frontend route** | `/favorites` (new page) |
| **Frontend changes** | Add ❤️ heart toggle button on each `PropertyCard` + `PropertyPage` |
| **Auth** | 🔒 Requires login |
| **Priority** | 🟡 Medium |

#### 3.2 عمليات البحث المحفوظة (Saved Searches)
| Attribute | Value |
|---|---|
| **Label** | عمليات البحث المحفوظة |
| **Icon** | 🔍 |
| **Status** | 🔴 Does not exist |
| **Backend needed** | New `SavedSearch` model + endpoints |
| **New DB model** | `saved_searches` table: `id`, `user_id`, `name`, `filters` (JSON — stores governorate, city, district, type, priceRange, etc.), `created_at` |
| **Endpoints** | `POST /saved-searches` (save current filters), `GET /saved-searches` (list), `DELETE /saved-searches/:id` (remove) |
| **Frontend route** | `/saved-searches` or inside `/favorites` as a tab |
| **Frontend changes** | "حفظ البحث" button on `FiltersSidebar`; saved search list loads filters on click |
| **Auth** | 🔒 Requires login |
| **Priority** | 🟠 Low-Medium |

---

### ── Section 4: Account Settings ────────────────────────

#### 4.1 الإعدادات (Settings)
| Attribute | Value |
|---|---|
| **Label** | الإعدادات |
| **Icon** | ⚙️ |
| **Status** | 🔴 Does not exist |
| **Frontend route** | `/settings` (new page) |
| **Page contents** | Notification preferences (push/SMS on/off), language toggle (reserved), delete account button |
| **Backend needed** | `PATCH /auth/settings` — update user preferences; `DELETE /auth/account` — soft-delete user |
| **New DB fields** | `users.preferences` (JSON, nullable): `{ notifyOnRecommendation: bool, notifyOnNegotiation: bool }` |
| **Auth** | 🔒 Requires login |
| **Priority** | 🟠 Low |

#### 4.2 حساب عام (Public Account / Public Profile)
| Attribute | Value |
|---|---|
| **Label** | حساب عام |
| **Icon** | 👁️ |
| **Status** | 🔴 Does not exist |
| **Description** | How other users see your profile. Shows name, join date, number of active listings. No phone/email. |
| **Backend needed** | `GET /users/:id/public` — returns `{ name, createdAt, listingsCount }` |
| **Frontend route** | `/user/:id` (new page) |
| **Frontend changes** | Clicking a property owner's name navigates to their public profile |
| **Auth** | 🔓 Public (no auth required to view) |
| **Priority** | 🟠 Low |

---

### ── Section 5: Help & Support ──────────────────────────

#### 5.1 المساعدة (Help / FAQ)
| Attribute | Value |
|---|---|
| **Label** | المساعدة |
| **Icon** | ❓ |
| **Status** | 🔴 Does not exist |
| **Frontend route** | `/help` (new static page) |
| **Page contents** | FAQ accordion: كيف أضيف عقار؟ · كيف أتواصل مع المالك؟ · كيف يعمل التفاوض؟ · كيف أحذف إعلاني؟ · Contact email/WhatsApp |
| **Backend needed** | None (static content) |
| **Auth** | 🔓 Public |
| **Priority** | 🟠 Low |

---

### ── Section 6: Session ─────────────────────────────────

#### 6.1 تسجيل الخروج (Logout)
| Attribute | Value |
|---|---|
| **Label** | تسجيل الخروج |
| **Icon** | 🚪 |
| **Status** | ✅ Exists — `logout()` from `AuthContext` clears token + user from localStorage |
| **Action** | Clears auth state, redirects to `/` |
| **Priority** | ✅ Done |

---

## Menu UI Component Specification

### Component: `<UserMenu />`

| Property | Value |
|---|---|
| **Trigger** | Click on user avatar in `Header` |
| **Position** | Dropdown from top-right (RTL: top-left visually) |
| **Direction** | `direction: rtl` |
| **Backdrop** | Semi-transparent overlay, click to dismiss |
| **Animation** | Slide-down fade-in, 200ms |
| **Width** | `320px` (desktop), `100vw` (mobile fullscreen drawer) |

### Menu Items Layout

```
┌──────────────────────────────────────┐
│  [Avatar]  {user.name}               │
│            {phone masked}            │
├──────────────────────────────────────┤
│  👤  عرض وتعديل الملف الشخصي         │  → /profile
├──────────────────────────────────────┤
│  📋  إعلاناتي                        │  → /my-listings
│  ➕  أضف إعلان جديد                  │  → opens chat
├──────────────────────────────────────┤
│  ❤️  الإعلانات المفضّلة              │  → /favorites
│  🔍  عمليات البحث المحفوظة           │  → /saved-searches
├──────────────────────────────────────┤
│  ⚙️  الإعدادات                       │  → /settings
│  ❓  المساعدة                        │  → /help
├──────────────────────────────────────┤
│  🚪  تسجيل الخروج                   │  → logout()
└──────────────────────────────────────┘
```

---

## Implementation Priority

| Priority | Item | Status | Effort |
|---|---|---|---|
| 🔴 P0 | User Menu component (dropdown) | New | Small |
| 🔴 P0 | Edit Profile page (`/profile`) | Backend ✅, Frontend new | Small |
| 🔴 P0 | My Listings page (`/my-listings`) | Backend new endpoint, Frontend new | Medium |
| 🟡 P1 | Favorites (model + endpoints + UI) | All new | Medium |
| 🟡 P1 | Public Profile (`/user/:id`) | All new | Small |
| 🟠 P2 | Saved Searches | All new | Medium |
| 🟠 P2 | Settings page | Mostly frontend | Small |
| 🟠 P2 | Help / FAQ page | Static page | Small |

---

## Items Excluded (Not Applicable to SemsarAi)

The following items from the Dubizzle menu are **not applicable** to SemsarAi and are intentionally excluded:

| Dubizzle Item | Reason for Exclusion |
|---|---|
| محفظة دوبيزل (Wallet) | SemsarAi doesn't have an in-app wallet; payments flow through external gateway |
| كن مستخدمًا موثقًا (Verified badge) | Not in current scope; phone verification is the trust signal |
| الملف الشخصي للمرشّح (Candidate profile) | Dubizzle-specific (jobs section), not real estate |
| شراء الباقة المخفضة (Buy packages) | No premium listing tiers in MVP |
| الباقات والفواتير (Packages & invoices) | No subscription model in MVP |
| انضم لشركائنا (Partner program) | No partner/affiliate program in MVP |
| مدونة (Blog) | No content marketing in MVP |

---

## New DB Models Required

### `Favorite`
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

### `SavedSearch`
```prisma
model SavedSearch {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  name      String
  filters   Json
  createdAt DateTime @default(now()) @map("created_at")

  user      User     @relation(fields: [userId], references: [id])

  @@index([userId])
  @@map("saved_searches")
}
```

---

## New API Endpoints Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/properties/mine` | 🔒 JWT | List current user's properties |
| `PATCH` | `/properties/:id` | 🔒 JWT (owner) | Edit own property |
| `DELETE` | `/properties/:id` | 🔒 JWT (owner) | Delete own property |
| `PATCH` | `/properties/:id/status` | 🔒 JWT (owner) | Toggle active/inactive |
| `POST` | `/favorites/:propertyId` | 🔒 JWT | Add to favorites |
| `DELETE` | `/favorites/:propertyId` | 🔒 JWT | Remove from favorites |
| `GET` | `/favorites` | 🔒 JWT | List user's favorites |
| `POST` | `/saved-searches` | 🔒 JWT | Save search filters |
| `GET` | `/saved-searches` | 🔒 JWT | List saved searches |
| `DELETE` | `/saved-searches/:id` | 🔒 JWT | Delete saved search |
| `GET` | `/users/:id/public` | 🔓 Public | Get public profile |
| `DELETE` | `/auth/account` | 🔒 JWT | Soft-delete account |
