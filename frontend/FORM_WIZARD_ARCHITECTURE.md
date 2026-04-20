# Add Property Form Wizard — Architecture & Implementation Guide

## Overview
Professional multi-step form wizard replicating the exact chat-based property listing flow. Same validations, business rules, and backend integration.

---

## System Architecture

### Flow Mapping (Chat → Form Wizard)

| Chat Step | Form Step | Components | Input Type |
|-----------|-----------|------------|-----------|
| PROPERTY_TYPE | Step 1.1 | Radio buttons | Combined property type selector |
| GOVERNORATE | Step 1.2 | Dropdown | Location picker (cascading) |
| CITY | Step 1.3 | Dropdown | Location picker (cascading) |
| DISTRICT | Step 1.4 | Dropdown | Location picker (cascading) |
| **Grouped** | **Step 1: Basics** | PropertyBasicsStep.tsx | Multi-page substep handling |
| DETAILS | Step 2: Pricing | Price input + rate type | Grouped for UX |
| PRICE | Step 2: Pricing | Number input | Dynamic based on property type |
| DETAILS (sub) | Step 3: Details | Multi-field form | Area, beds, baths, amenities, etc. |
| MEDIA | Step 4: Media | File upload + map | Image/video uploader + location map |
| REVIEW | Step 5: Review | Display + confirm | Summary + submit button |

### Data Flow

```
┌─────────────────────┐
│  User Starts Flow   │
└──────────┬──────────┘
           │
     ┌─────▼─────┐
     │   Start   │
     │   Draft   │
     └─────┬─────┘
           │
      Step 1: BASICS (Location + Property Type)
           │
      Step 2: PRICING (Price & Rate Type)
           │
      Step 3: DETAILS (Area, Beds, Baths, Amenities, Map)
           │
      Step 4: MEDIA (Images/Videos + Map Location)
           │
      Step 5: REVIEW (Summary + Final Submit)
           │
     ┌─────▼──────────┐
     │ Create Property│
     │ from Draft     │
     └────────────────┘
```

### Backend Integration

**Endpoints reused (no changes):**
- `POST /onboarding/start` — Start or resume draft
- `GET /onboarding/question` — Get current question metadata
- `POST /onboarding/answer` — Submit step answer
- `GET /onboarding/review` — Get review summary
- `POST /onboarding/edit` — Rewind to edit step
- `POST /onboarding/submit` — Final submit to create property
- `POST /onboarding/upload-file` — Upload media file
- `POST /onboarding/upload-media` — Attach media URL to draft

**Data Model:** 
- `PropertyDraft` — Stores collected data in JSON
- Same validation logic reused from onboarding.service.ts

---

## Component Structure

### Folder Layout
```
app/pages/PropertyWizard/
├── AddPropertyWizard.tsx           (Container + Router)
├── hooks/
│   ├── usePropertyDraft.ts         (Draft API calls + state)
│   ├── useFormValidation.ts        (Validation logic)
│   ├── useLocationData.ts          (Governorate/City/District loading)
│   └── useDraftStorage.ts          (Local storage + auto-save)
├── components/
│   ├── WizardContainer.tsx         (Main layout + progress)
│   ├── ProgressIndicator.tsx       (Visual progress bar)
│   ├── NavigationButtons.tsx       (Next/Back/Save)
│   ├── steps/
│   │   ├── Step1BasicInfo.tsx      (Property type + location)
│   │   ├── Step2Pricing.tsx        (Price & rate type)
│   │   ├── Step3Details.tsx        (Area, beds, baths, etc.)
│   │   ├── Step4Media.tsx          (Images, videos, map)
│   │   └── Step5Review.tsx         (Summary + confirm)
│   ├── fields/
│   │   ├── TextInput.tsx           (Reusable text input)
│   │   ├── NumberInput.tsx         (Number field)
│   │   ├── RadioGroup.tsx          (Radio buttons)
│   │   ├── DropdownSelect.tsx      (Cascading location dropdowns)
│   │   ├── TextAreaInput.tsx       (Textarea)
│   │   ├── FileUploader.tsx        (Image/video upload)
│   │   ├── MapPicker.tsx           (Location map picker)
│   │   └── CheckboxGroup.tsx       (Multi-select amenities)
│   └── modals/
│       ├── SuccessModal.tsx        (Success message)
│       └── ErrorModal.tsx          (Error handling)
├── types/
│   └── wizard.types.ts             (TypeScript interfaces)
├── constants/
│   └── fieldMappings.ts            (Field labels, options, maps)
└── services/
    ├── propertyService.ts          (API calls)
    └── draftService.ts             (Draft operations)
```

---

## Step Details

### Step 1: Basic Information (Substeps A, B, C, D)
**Purpose:** Collect property type and location

**Substep A: Property Type**
- Radio buttons for combined property types
- Maps to: `property_type` + `listing_type`
- Options: شقق للبيع, شقق للإيجار, فلل للبيع, etc. (from COMBINED_PROPERTY_MAP)

**Substep B: Governorate**
- Dropdown (dynamically loaded from DB)
- Maps to: `governorate_id`, `governorate_name`

**Substep C: City**
- Dropdown (filtered by selected governorate)
- Maps to: `city_id`, `city_name`

**Substep D: District**
- Dropdown (filtered by selected city)
- Maps to: `district_id`, `district_name`
- Auto-skip if city has no districts

---

### Step 2: Pricing
**Purpose:** Collect price and rental rate type

**Fields:**
- **Rental Rate Type (if RENT):**  
  Radio: يومي / شهري / سنوي
  
- **Price:**  
  Number input (or preset buttons)  
  Dynamic question based on:
  - Sale: "سعر البيع المتوقع؟"
  - Rent (يومي): "الإيجار اليومي؟"
  - Rent (شهري): "الإيجار الشهري؟"
  - Rent (سنوي): "الإيجار السنوي؟"

**Validation:**
- Price must be positive or skipped
- Rate type required for rentals

---

### Step 3: Details
**Purpose:** Collect property specifications

**Fields (all except SHOP/OFFICE/COMMERCIAL/LAND_BUILDING):**
1. **Area (م²)** — Required, number > 0
2. **Bedrooms** — Optional, 0-10
3. **Bathrooms** — Optional, 0-10
4. **Apartment Type** — Dropdown
   - Sale: شقة, دوبلكس, بنتهاوس, ستوديو
   - Rent: شقة, دوبلكس, بنتهاوس, غرفة, ستوديو, شقة فندقية, سطح
5. **Ownership Type (Sale only)** — أول سكن / إعادة بيع
6. **Rent Rate Type (Rent only)** — يومي / شهري / سنوي
7. **Readiness** — جاهز / قيد الإنشاء
8. **Delivery Date (if under construction)** — Text (optional)
9. **Finishing Type** — بدون تشطيب / نصف تشطيب / تشطيب كامل / سوبر لوكس / ألترا سوبر لوكس
10. **Floor Level** — أرضي / 1-10 / 10+
11. **Furnished?** — نعم / لا
12. **Ad Title** — Text (max 100 chars)
13. **Ad Description** — Textarea (optional)
14. **Amenities** — Textarea (optional, comma-separated)

---

### Step 4: Media & Location
**Purpose:** Collect photos, videos, and map location

**Fields:**
1. **Image/Video Upload**
   - Multi-file uploader
   - Types: JPG, PNG, GIF, WebP, MP4, MOV, AVI
   - Size limit: 20 MB per file
   - Calls: POST /onboarding/upload-file → POST /onboarding/upload-media

2. **Map Location Picker**
   - Interactive map (Google Maps or similar)
   - "Get my location" button
   - Saves: `lat`, `lng` in details
   - Optional (can skip)

---

### Step 5: Review & Submit
**Purpose:** Display summary and request confirmation

**Layout:**
- Summary of all collected data (formatted nicely)
- Edit links next to each section
- Final submit button
- Payment/credit check logic

**Actions:**
- Edit: Rewind to specific step (via POST /onboarding/edit)
- Confirm: Submit final data (POST /onboarding/submit)

---

## TypeScript Interfaces

```typescript
// Wizard Types
interface PropertyDraftData {
  property_type?: string;
  listing_type?: string;
  governorate_id?: number;
  governorate_name?: string;
  city_id?: number;
  city_name?: string;
  district_id?: number;
  district_name?: string;
  price?: number;
  details?: PropertyDetails;
  media_skipped?: boolean;
}

interface PropertyDetails {
  area_m2: number;
  bedrooms?: number;
  bathrooms?: number;
  apartmentType?: string;
  rentRateType?: string;
  ownershipType?: string;
  readiness?: string;
  deliveryDate?: string;
  finishingType?: string;
  floorLevel?: string;
  isFurnished?: boolean;
  adTitle?: string;
  adDescription?: string;
  amenities?: { parsed?: string };
  lat?: number;
  lng?: number;
}

interface DraftState {
  id: string;
  userId: string;
  currentStep: OnboardingStep;
  data: PropertyDraftData;
  isCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ValidationError {
  field: string;
  message: string;
}

interface LocationOption {
  id: number;
  label: string;
}
```

---

## Validation Rules (Exact from Backend)

### Property Type
- Must be in COMBINED_PROPERTY_MAP keys
- Cannot be empty

### Location (Governorate → City → District)
- All must be valid IDs from DB
- Must maintain hierarchy (city.parentId === governorate.id)
- District auto-skips if city has 0 districts

### Details
- `area_m2`: Required (> 0)
- `bedrooms`: Optional, must be 0-10 if provided
- `bathrooms`: Optional, must be 0-10 if provided
- `apartmentType`: Validate against allowed list
- `ownershipType`: أول سكن / إعادة بيع
- `rentRateType`: يومي / شهري / سنوي
- `readiness`: جاهز / قيد الإنشاء
- `isFurnished`: Boolean

### Price
- Must be positive number or null (skippable)
- Accept preset options or custom numbers
- Strip commas: "1,000,000" → 1000000

### Media
- Optional (can skip)
- File types: jpg, jpeg, png, gif, webp, mp4, mov, avi
- Max size: 20 MB

---

## UX / UI Design Notes

### Design System
- **Colors:** Primary (primary-brand), Secondary, Success (green), Error (red), Warning (orange)
- **Typography:** Egyptian Arabic (right-to-left text)
- **Spacing:** 16px base unit
- **Breakpoints:** Mobile (320px), Tablet (768px), Desktop (1024px)

### Components
1. **Card Layout:** White background, subtle shadow, 16px padding
2. **Form Fields:** Labels above, help text below, error state styling
3. **Buttons:** Primary (blue), Secondary (gray), CTA (green)
4. **Progress Bar:** Visual indicator of completion (e.g., 40% → Step 2 of 5)
5. **Modals:** Success (green), Error (red), Loading (spinner)

### Accessibility
- ARIA labels on all inputs
- Keyboard navigation (Tab, Enter, Escape)
- Error messages associated with form fields
- Focus indicators visible
- RTL support for Arabic text

---

## Error Handling

### User-Facing Errors
- **Validation errors:** Display below field
- **Network errors:** Retry button + timeout handling
- **Payment blocked:** Show payment modal
- **Draft locked:** Show warning (user in another browser tab)

### Auto-Save Strategy
- Auto-save to localStorage on every change (debounced 500ms)
- Also sync to backend draft on step advance
- Recover from localStorage if browser crashes
- Show "saving..." indicator

---

## Integration Checklist

- [ ] Reuse existing onboarding.service.ts validators
- [ ] Map form fields → API request DTOs exactly
- [ ] Test all conditional logic (RENT vs SALE, Under construction flow)
- [ ] Verify all validations match backend rules
- [ ] Test auto-save and draft recovery
- [ ] Test payment flow integration
- [ ] Test location cascading logic
- [ ] Mobile responsive testing
- [ ] RTL text support verification
- [ ] Accessibility audit (WCAG 2.1 AA)

---

## Deployment

1. **Backend:** No changes required (use existing endpoints)
2. **Frontend:** Add wizard components to `/app/pages/PropertyWizard/`
3. **Routes:** Add route `/properties/add` → AddPropertyWizard.tsx
4. **Database:** No migrations needed

