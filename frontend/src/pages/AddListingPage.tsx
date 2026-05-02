import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../store/AuthContext';
import { Header } from '../components/Header';
import {
  startDraft,
  submitAnswer,
  getReview,
  editField,
  finalSubmit,
  uploadFile,
  attachMedia,
  type Draft,
  type QuestionEnvelope,
  type LocationOption,
  type OnboardingStep,
  type ReviewResponse,
} from '../api/onboarding';

const PROGRESS_STEPS: { step: OnboardingStep; label: string }[] = [
  { step: 'GOVERNORATE', label: 'الموقع' },
  { step: 'PROPERTY_TYPE', label: 'النوع' },
  { step: 'DETAILS', label: 'التفاصيل' },
  { step: 'PRICE', label: 'السعر' },
  { step: 'MEDIA', label: 'الصور' },
  { step: 'REVIEW', label: 'المراجعة' },
];

const PROGRESS_INDEX: Record<string, number> = {
  GOVERNORATE: 0,
  CITY: 0,
  DISTRICT: 0,
  PROPERTY_TYPE: 1,
  DETAILS: 2,
  PRICE: 3,
  MEDIA: 4,
  REVIEW: 5,
  COMPLETED: 5,
};

function isLocationOptions(opts: unknown): opts is LocationOption[] {
  return Array.isArray(opts) && opts.length > 0 && typeof opts[0] === 'object' && opts[0] !== null && 'id' in (opts[0] as object);
}

function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join('، ');
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'حدث خطأ غير متوقع';
}

export const AddListingPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [question, setQuestion] = useState<QuestionEnvelope | null>(null);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
      return;
    }
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    startDraft(user.id, false)
      .then((res) => {
        if (cancelled) return;
        setDraft(res.draft);
        setQuestion(res.question);
        setError('');
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, navigate]);

  // When we land on REVIEW, fetch the review payload
  useEffect(() => {
    if (!user || draft?.currentStep !== 'REVIEW') {
      setReview(null);
      return;
    }
    getReview(user.id)
      .then(setReview)
      .catch((err) => setError(errorMessage(err)));
  }, [user, draft?.currentStep]);

  // When we hit COMPLETED, redirect
  useEffect(() => {
    if (draft?.currentStep === 'COMPLETED') {
      navigate('/my-listings');
    }
  }, [draft?.currentStep, navigate]);

  async function answer(step: OnboardingStep, value: unknown) {
    if (!user) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await submitAnswer(user.id, step, value);
      setDraft(res.draft);
      setQuestion(res.question);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function jumpToEdit(step: OnboardingStep) {
    if (!user) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await editField(user.id, step);
      // editField returns the question envelope plus draft inside data
      const r = res as QuestionEnvelope & { draft?: Draft };
      setQuestion(r);
      if (r.draft) setDraft(r.draft);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function publish() {
    if (!user) return;
    setSubmitting(true);
    setError('');
    try {
      await finalSubmit(user.id);
      navigate('/my-listings');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  async function restart() {
    if (!user) return;
    if (!confirm('هتبدأ من الأول وتمسح اللي اتجمع لحد دلوقتي. متأكد؟')) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await startDraft(user.id, true);
      setDraft(res.draft);
      setQuestion(res.question);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const progressIdx = draft ? PROGRESS_INDEX[draft.currentStep] ?? 0 : 0;

  return (
    <>
      <Header onLoginClick={() => {}} />
      <div className="add-listing-page">
        <div className="add-listing-page__inner">
          <h1 className="add-listing-page__title">📝 إضافة إعلان جديد</h1>

          {/* Progress */}
          <div className="add-listing-progress">
            {PROGRESS_STEPS.map((s, i) => (
              <div
                key={s.step}
                className={
                  'add-listing-progress__step' +
                  (i < progressIdx ? ' add-listing-progress__step--done' : '') +
                  (i === progressIdx ? ' add-listing-progress__step--active' : '')
                }
              >
                <span className="add-listing-progress__num">{i + 1}</span>
                <span className="add-listing-progress__label">{s.label}</span>
              </div>
            ))}
          </div>

          {error && <div className="alert-error" style={{ padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

          {loading && (
            <div className="loading-center"><div className="spinner spinner-lg" /></div>
          )}

          {!loading && draft && question && draft.currentStep !== 'REVIEW' && draft.currentStep !== 'COMPLETED' && (
            <StepRenderer
              draft={draft}
              question={question}
              submitting={submitting}
              onAnswer={(v) => answer(draft.currentStep, v)}
            />
          )}

          {!loading && draft?.currentStep === 'REVIEW' && review && (
            <ReviewPanel
              review={review}
              submitting={submitting}
              onEdit={jumpToEdit}
              onPublish={publish}
            />
          )}

          {!loading && draft && (
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={restart}
                disabled={submitting}
              >
                ↺ إعادة البدء
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ─── Step renderer ──────────────────────────────────────────────

interface StepProps {
  draft: Draft;
  question: QuestionEnvelope;
  submitting: boolean;
  onAnswer: (value: unknown) => void;
}

const StepRenderer: React.FC<StepProps> = ({ draft, question, submitting, onAnswer }) => {
  switch (draft.currentStep) {
    case 'GOVERNORATE':
    case 'CITY':
    case 'DISTRICT':
      return <LocationStep question={question} submitting={submitting} onAnswer={onAnswer} />;
    case 'PROPERTY_TYPE':
      return <PropertyTypeStep question={question} submitting={submitting} onAnswer={onAnswer} />;
    case 'DETAILS':
      return <DetailsStep submitting={submitting} onAnswer={onAnswer} />;
    case 'PRICE':
      return <PriceStep question={question} submitting={submitting} onAnswer={onAnswer} />;
    case 'MEDIA':
      return <MediaStep userId={draft.userId} submitting={submitting} onAnswer={onAnswer} />;
    default:
      return <p>{question.question}</p>;
  }
};

// ─── Location step ──────────────────────────────────────────────

const LocationStep: React.FC<Omit<StepProps, 'draft'>> = ({ question, submitting, onAnswer }) => {
  if (!isLocationOptions(question.options)) {
    return <p className="alert-error" style={{ padding: 12 }}>لا توجد خيارات متاحة. حاول مرة أخرى.</p>;
  }
  return (
    <div>
      <h2 className="add-listing-page__question">{question.question}</h2>
      <div className="add-listing-options">
        {question.options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className="btn btn-secondary btn-lg"
            onClick={() => onAnswer({ id: opt.id, label: opt.label })}
            disabled={submitting}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Property type step ─────────────────────────────────────────

const PropertyTypeStep: React.FC<Omit<StepProps, 'draft'>> = ({ question, submitting, onAnswer }) => {
  const options = (question.options as string[]) ?? [];
  return (
    <div>
      <h2 className="add-listing-page__question">{question.question}</h2>
      <div className="add-listing-options">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className="btn btn-secondary btn-lg"
            onClick={() => onAnswer(opt)}
            disabled={submitting}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Details step (multi-field form) ────────────────────────────

const DetailsStep: React.FC<{ submitting: boolean; onAnswer: (value: unknown) => void }> = ({
  submitting,
  onAnswer,
}) => {
  const [areaM2, setAreaM2] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [localError, setLocalError] = useState('');

  function submit() {
    const area = Number(areaM2);
    if (!area || area <= 0) {
      setLocalError('المساحة لازم تكون رقم أكبر من صفر');
      return;
    }
    setLocalError('');
    onAnswer({
      area_m2: area,
      bedrooms: bedrooms === '' ? null : Number(bedrooms),
      bathrooms: bathrooms === '' ? null : Number(bathrooms),
    });
  }

  return (
    <div>
      <h2 className="add-listing-page__question">تفاصيل العقار</h2>
      <div className="form-group" style={{ gap: 14 }}>
        <div className="form-group">
          <label className="form-label">المساحة (م²) *</label>
          <input
            type="number"
            min="1"
            className="form-input"
            value={areaM2}
            onChange={(e) => setAreaM2(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="form-group">
          <label className="form-label">عدد الغرف</label>
          <input
            type="number"
            min="0"
            className="form-input"
            value={bedrooms}
            onChange={(e) => setBedrooms(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="form-group">
          <label className="form-label">عدد الحمامات</label>
          <input
            type="number"
            min="0"
            className="form-input"
            value={bathrooms}
            onChange={(e) => setBathrooms(e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>
      {localError && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{localError}</p>}
      <button
        type="button"
        className="btn btn-primary btn-lg btn-full"
        style={{ marginTop: 16 }}
        onClick={submit}
        disabled={submitting}
      >
        متابعة
      </button>
    </div>
  );
};

// ─── Price step ─────────────────────────────────────────────────

const PriceStep: React.FC<Omit<StepProps, 'draft'>> = ({ question, submitting, onAnswer }) => {
  const [value, setValue] = useState('');
  const presets = (question.options as string[] | undefined)?.filter((o) => !o.includes('تخطي')) ?? [];

  function submit() {
    const numeric = Number(value.replace(/,/g, ''));
    if (!numeric || numeric < 0) return;
    onAnswer(numeric);
  }

  return (
    <div>
      <h2 className="add-listing-page__question">{question.question}</h2>
      {presets.length > 0 && (
        <div className="add-listing-options">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className="btn btn-secondary"
              onClick={() => onAnswer(p)}
              disabled={submitting}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      <div className="form-group" style={{ marginTop: 16 }}>
        <label className="form-label">أو اكتب السعر بالأرقام</label>
        <input
          type="text"
          inputMode="numeric"
          className="form-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="مثلاً: 1500000"
          disabled={submitting}
        />
      </div>
      <button
        type="button"
        className="btn btn-primary btn-lg btn-full"
        style={{ marginTop: 12 }}
        onClick={submit}
        disabled={submitting || !value}
      >
        متابعة
      </button>
    </div>
  );
};

// ─── Media step ─────────────────────────────────────────────────

const MediaStep: React.FC<{
  userId: string;
  submitting: boolean;
  onAnswer: (value: unknown) => void;
}> = ({ userId, submitting, onAnswer }) => {
  const [uploaded, setUploaded] = useState<{ url: string; type: 'IMAGE' | 'VIDEO' }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState('');

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setLocalError('');
    try {
      for (const f of files) {
        const isVideo = f.type.startsWith('video/');
        const type: 'IMAGE' | 'VIDEO' = isVideo ? 'VIDEO' : 'IMAGE';
        const res = await uploadFile(f);
        await attachMedia(userId, res.url, type);
        setUploaded((prev) => [...prev, { url: res.url, type }]);
      }
    } catch (err) {
      setLocalError(errorMessage(err));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div>
      <h2 className="add-listing-page__question">صور وفيديوهات العقار (اختياري)</h2>
      <label
        className="btn btn-secondary btn-lg btn-full"
        style={{ cursor: 'pointer', display: 'inline-flex', justifyContent: 'center' }}
      >
        {uploading ? 'جاري الرفع...' : '📷 ارفع صور أو فيديوهات'}
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFiles}
          disabled={uploading || submitting}
        />
      </label>

      {uploaded.length > 0 && (
        <div className="add-listing-media-grid" style={{ marginTop: 12 }}>
          {uploaded.map((m, i) => (
            <div key={i} className="add-listing-media-grid__item">
              {m.type === 'IMAGE' ? (
                <img src={m.url} alt="" />
              ) : (
                <video src={m.url} muted />
              )}
            </div>
          ))}
        </div>
      )}

      {localError && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{localError}</p>}

      <button
        type="button"
        className="btn btn-primary btn-lg btn-full"
        style={{ marginTop: 16 }}
        onClick={() => onAnswer(null)}
        disabled={submitting || uploading}
      >
        {uploaded.length > 0 ? 'متابعة' : 'تخطي'}
      </button>
    </div>
  );
};

// ─── Review panel ───────────────────────────────────────────────

const REVIEW_ROWS: { key: string; label: string; step?: OnboardingStep }[] = [
  { key: 'governorate_name', label: 'المحافظة', step: 'GOVERNORATE' },
  { key: 'city_name', label: 'المدينة', step: 'CITY' },
  { key: 'district_name', label: 'الحي', step: 'DISTRICT' },
  { key: 'property_type', label: 'نوع العقار', step: 'PROPERTY_TYPE' },
  { key: 'listing_type', label: 'البيع/الإيجار', step: 'PROPERTY_TYPE' },
  { key: 'price', label: 'السعر', step: 'PRICE' },
];

const ReviewPanel: React.FC<{
  review: ReviewResponse;
  submitting: boolean;
  onEdit: (step: OnboardingStep) => void;
  onPublish: () => void;
}> = ({ review, submitting, onEdit, onPublish }) => {
  const data = review.data;
  const details = useMemo(
    () => (data.details as Record<string, unknown> | undefined) ?? {},
    [data],
  );

  function val(key: string): string {
    const v = data[key];
    if (v === null || v === undefined || v === '') return '—';
    return String(v);
  }

  return (
    <div>
      <h2 className="add-listing-page__question">راجع البيانات قبل النشر</h2>

      <div className="add-listing-review">
        {REVIEW_ROWS.map((row) => (
          <div key={row.key} className="add-listing-review__row">
            <span className="add-listing-review__label">{row.label}</span>
            <span className="add-listing-review__value">{val(row.key)}</span>
            {row.step && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onEdit(row.step!)}
                disabled={submitting}
              >
                تعديل
              </button>
            )}
          </div>
        ))}
        {details.area_m2 != null && (
          <div className="add-listing-review__row">
            <span className="add-listing-review__label">المساحة</span>
            <span className="add-listing-review__value">{String(details.area_m2)} م²</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onEdit('DETAILS')}
              disabled={submitting}
            >
              تعديل
            </button>
          </div>
        )}
        {details.bedrooms != null && (
          <div className="add-listing-review__row">
            <span className="add-listing-review__label">عدد الغرف</span>
            <span className="add-listing-review__value">{String(details.bedrooms)}</span>
          </div>
        )}
        {details.bathrooms != null && (
          <div className="add-listing-review__row">
            <span className="add-listing-review__label">عدد الحمامات</span>
            <span className="add-listing-review__value">{String(details.bathrooms)}</span>
          </div>
        )}
      </div>

      {!review.isComplete && (
        <div className="alert-error" style={{ padding: 12, borderRadius: 8, marginTop: 16 }}>
          البيانات الناقصة: {review.missingFields.join('، ')}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-lg btn-full"
        style={{ marginTop: 16 }}
        onClick={onPublish}
        disabled={submitting || !review.isComplete}
      >
        ✅ تأكيد ونشر الإعلان
      </button>
    </div>
  );
};
