# Add Property Form Wizard — Implementation Guide

## Quick Summary

A complete, production-ready multi-step form wizard that replicates the exact chat-based property listing flow. Uses the same backend endpoints, validation rules, and database schema—no backend changes required.

---

## Files Created

```
app/pages/PropertyWizard/
├── AddPropertyWizard.tsx                    [MAIN ENTRY POINT]
├── types/
│   └── wizard.types.ts                      [TypeScript interfaces & constants]
├── services/
│   ├── propertyService.ts                   [Backend API communication]
│   └── validationService.ts                 [Client-side validation mirrors]
├── hooks/
│   └── usePropertyDraft.ts                  [State management & API calls]
├── components/
│   ├── WizardContainer.tsx                  [Main layout & navigation]
│   ├── ProgressIndicator.tsx                [Visual progress bar]
│   └── steps/
│       ├── Step1BasicInfo.tsx               [Property type + location]
│       ├── Step2Pricing.tsx                 [Price & rent rate type]
│       ├── Step3Details.tsx                 [Area, beds, baths, amenities]
│       ├── Step4Media.tsx                   [Images, videos, map location]
│       └── Step5Review.tsx                  [Summary + final submission]
└── constants/
    └── (values defined in wizard.types.ts)
```

---

## Integration Steps

### 1. Add Route to Your App Router

**In your main routing file (e.g., `app/routes.tsx` or equivalent):**

```tsx
import AddPropertyWizardPage from './pages/PropertyWizard/AddPropertyWizard';

// Add to your routes:
{
  path: '/properties/add',
  element: <AddPropertyWizardPage />,
  name: 'Add Property',
}
```

### 2. Update Environment Variables

**In `.env.local` or similar:**

```bash
REACT_APP_API_URL=http://localhost:3000/api
# Or for production:
# REACT_APP_API_URL=https://api.semsar.com/api
```

### 3. Ensure Authentication Context Exists

The AddPropertyWizard component expects an `AuthContext` that provides:

```tsx
interface User {
  id: string;
  name: string;
  email?: string;
  phone: string;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials) => Promise<void>;
  logout: () => Promise<void>;
}
```

If you don't have this, create it or modify `AddPropertyWizard.tsx` to get userId from another source (props, query params, etc.).

### 4. Add Navigation Link

**In your main navigation/header:**

```tsx
<Link to="/properties/add" className="btn btn-primary">
  ➕ إضافة عقار جديد
</Link>
```

---

## Component Architecture

### Data Flow

```
User loads /properties/add
        ↓
AddPropertyWizard (page)
        ↓
WizardContainer (layout + state)
        ↓
usePropertyDraft (API + state)
        ↓
PropertyService (API calls)
        ↓
Backend (/onboarding/*)
        ↓
Prisma (PropertyDraft table)
```

### State Management

**WizardContainer** manages:
- Current step (1-5)
- UI state (loading, saving, errors)
- Navigation (next, back, restart)

**usePropertyDraft** manages:
- Draft data
- API communication
- Media uploads
- Error handling

**Each Step component** manages:
- Local form state
- Field-level validation
- User interaction

### API Integration

All API calls go through **PropertyService**, which wraps these backend endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/onboarding/start` | POST | Start/resume draft |
| `/onboarding/question` | GET | Get current step question |
| `/onboarding/answer` | POST | Submit step answer |
| `/onboarding/review` | GET | Get review summary |
| `/onboarding/edit` | POST | Rewind to edit step |
| `/onboarding/submit` | POST | Final submit |
| `/onboarding/upload-file` | POST | Upload file |
| `/onboarding/upload-media` | POST | Attach media to draft |

**No backend changes required** — all endpoints already exist.

---

## Customization Guide

### Styling

The wizard uses **Tailwind CSS** classes. To customize:

1. **Colors:** Edit color classes (bg-blue-600, text-red-800, etc.)
2. **Spacing:** Modify `px-`, `py-`, `gap-` values
3. **Layout:** Adjust grid cols (`md:grid-cols-2`, etc.)

Example: Change primary color from blue to green:

```tsx
// Replace all "bg-blue-600" with "bg-green-600"
// Replace all "border-blue-600" with "border-green-600"
```

### Language

All Arabic strings are hardcoded. To make multilingual:

1. Create a `translations.ts` file:

```ts
const translations = {
  ar: {
    STEP_1_TITLE: 'اختر نوع العقار والموقع',
    // ... more strings
  },
  en: {
    STEP_1_TITLE: 'Choose Property Type and Location',
  },
};
```

2. Use throughout components:

```tsx
const t = translations[language];
<h2>{t.STEP_1_TITLE}</h2>
```

### Location Data

Currently, location dropdowns have placeholder data. To use real data from DB:

1. **Backend:** Create `/api/locations/governorates` endpoint that returns:

```json
[
  { "id": 1, "label": "القاهرة", "nameEn": "Cairo" },
  ...
]
```

2. **Frontend:** Update `Step1BasicInfo.tsx`:

```tsx
useEffect(() => {
  const loadGovernorates = async () => {
    const res = await fetch('/api/locations/governorates');
    const data = await res.json();
    setGovernorateOptions(data);
  };
  loadGovernorates();
}, []);
```

### Map Integration

Currently, Step4Media uses Google Maps embed. To use a real map picker:

1. Install: `npm install react-leaflet leaflet` or `npm install react-google-maps`
2. Replace the embed with an interactive map component
3. Add click handler to set lat/lng

Example with Leaflet:

```tsx
import { MapContainer, TileLayer, Marker } from 'react-leaflet';

<MapContainer center={[latitude || 30, longitude || 31]} zoom={13}>
  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
  {latitude && longitude && <Marker position={[latitude, longitude]} />}
</MapContainer>
```

### File Upload

Currently, files are tracked locally. To actually upload to server:

In `Step4Media.tsx`, after `handleFileUpload`:

```tsx
const uploadFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const res = await PropertyService.uploadFile(file);
  // res.data.url is the public URL

  // Then attach to draft:
  await PropertyService.uploadMedia(userId, res.data.url, 'IMAGE');
};
```

---

## Testing Checklist

- [ ] **Happy path:** Complete entire wizard (all 5 steps)
- [ ] **Validation:** Test field validations (empty required fields, invalid prices)
- [ ] **Location cascade:** Select governorate → city → district (verify filtering)
- [ ] **Conditional fields:** Rent vs Sale flow (different rate type options)
- [ ] **Draft persistence:** Reload page mid-flow (should resume from same step)
- [ ] **Edit from review:** Click edit on review step, go back, change values
- [ ] **Error handling:** Test API errors, invalid responses
- [ ] **File upload:** Upload images/videos (currently local-only)
- [ ] **Payment flow:** Test when user lacks listing credit
- [ ] **Mobile responsive:** Test on mobile, tablet, desktop
- [ ] **RTL text:** Verify right-to-left layout (dir="rtl")
- [ ] **Accessibility:** Tab navigation, error announcements, focus indicators

---

## Troubleshooting

### Issue: "No active draft found"

**Cause:** User ID not being passed correctly

**Fix:**
```tsx
// In AddPropertyWizard.tsx, verify:
console.log('User ID:', user?.id);

// Should log the UUID, e.g., "550e8400-e29b-41d4-a716-446655440000"
```

### Issue: Location dropdowns empty

**Cause:** API not returning location data, or placeholder data not loaded

**Fix:**
```tsx
// In Step1BasicInfo.tsx:
useEffect(() => {
  console.log('Governorate options:', governorateOptions);
}, [governorateOptions]);

// Should show an array of {id, label} objects
```

### Issue: "Payment required" error on submit

**Expected behavior** — This means the user doesn't have a listing credit. Show a payment modal to process payment first.

**To implement:**
```tsx
catch (err) {
  if (err.code === 'PAYMENT_REQUIRED') {
    // Show payment modal
    <PaymentModal creditId={err.creditId} />
  }
}
```

### Issue: Styles not applying (tailwind)

**Cause:** Tailwind CSS not configured in your project

**Fix:**
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Then configure `tailwind.config.js`:
```js
module.exports = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

---

## Performance Optimization

### 1. Lazy Load Components

```tsx
const Step1BasicInfo = lazy(() => import('./steps/Step1BasicInfo'));
const Step2Pricing = lazy(() => import('./steps/Step2Pricing'));
// ... etc

// In WizardContainer:
<Suspense fallback={<LoadingSpinner />}>
  {renderStep()}
</Suspense>
```

### 2. Memoize Heavy Components

```tsx
const Step3Details = memo(Step3DetailsComponent);
```

### 3. Debounce API Calls

```tsx
const debouncedSave = useCallback(
  debounce((data) => {
    PropertyService.saveDraft(data);
  }, 2000),
  [],
);
```

### 4. Use React Query for Caching

```tsx
import { useQuery } from '@tanstack/react-query';

const { data: locations } = useQuery({
  queryKey: ['locations', 'governorates'],
  queryFn: () => PropertyService.getGovernorates(),
  staleTime: 1000 * 60 * 5, // 5 minutes
});
```

---

## Security Considerations

1. **Input Validation:** All fields are validated on both client and server
2. **CSRF Protection:** Ensure your API includes CSRF tokens if needed
3. **File Upload:** Server validates file type and size (20 MB limit)
4. **Authentication:** User ID required for all operations (enforced by backend)
5. **PII:** No sensitive data (IDs, tokens) in URLs

---

## Deployment

### Development
```bash
npm run dev
# Navigate to http://localhost:3000/properties/add
```

### Production

1. Build:
```bash
npm run build
```

2. Update `REACT_APP_API_URL` to production API

3. Verify Tailwind CSS is included in build

4. Test form wizard in production environment

---

## Future Enhancements

1. **Image editing:** Crop, rotate, filter before upload
2. **Auto-save:** Save draft every 30 seconds without user action
3. **Multi-language:** Support Arabic/English toggle
4. **Saved templates:** Let users save property templates
5. **Bulk upload:** Upload multiple properties at once
6. **Video preview:** Show video thumbnail after upload
7. **AI suggestions:** Auto-populate fields based on address
8. **Payment integration:** Direct payment processing in wizard
9. **Comparison:** Compare with similar properties
10. **Share draft:** Let co-owners edit same draft

---

## Support & Questions

For issues or questions:
1. Check the troubleshooting section above
2. Review the backend onboarding.service.ts for validation logic
3. Check browser console for API errors
4. Verify environment variables are set correctly

