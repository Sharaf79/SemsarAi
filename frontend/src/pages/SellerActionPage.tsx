import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getSellerEscalation,
  submitSellerAction,
  type SellerEscalationSummary,
} from '../api/negotiations';

type Phase = 'loading' | 'ready' | 'submitting' | 'done' | 'error';

function fmt(n: number): string {
  return n.toLocaleString('ar-EG') + ' ج.م';
}

export const SellerActionPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<SellerEscalationSummary | null>(null);
  const [error, setError] = useState<string>('');
  const [showCounter, setShowCounter] = useState(false);
  const [counter, setCounter] = useState('');
  const [outcome, setOutcome] = useState<string>('');

  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      try {
        const res = await getSellerEscalation(token);
        if (!alive) return;
        setData(res);
        setPhase('ready');
      } catch (e: unknown) {
        if (!alive) return;
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'تعذّر تحميل الطلب — قد يكون الرابط منتهي الصلاحية.';
        setError(msg);
        setPhase('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = async (
    action: 'ACCEPT' | 'REJECT' | 'COUNTER',
    counterPrice?: number,
  ) => {
    if (!token) return;
    setPhase('submitting');
    try {
      await submitSellerAction(token, action, counterPrice);
      setOutcome(
        action === 'ACCEPT'
          ? 'تم إرسال موافقتك للمشتري. هيتم التواصل معاك قريبًا.'
          : action === 'REJECT'
            ? 'تم تسجيل رفضك. شكرًا لوقتك.'
            : `تم إرسال عرضك المضاد (${fmt(counterPrice ?? 0)}) للمشتري.`,
      );
      setPhase('done');
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'تعذّر إرسال الإجراء.';
      setError(msg);
      setPhase('error');
    }
  };

  if (phase === 'loading') {
    return (
      <div className="seller-action-page">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="seller-action-page">
        <div className="seller-action__card">
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
          <p style={{ color: 'var(--danger, #c00)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="seller-action-page">
        <div className="seller-action__card">
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <h2>تم الإرسال</h2>
          <p>{outcome}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="seller-action-page">
      <div className="seller-action__card">
        <h2>عرض جديد على عقارك</h2>
        {data.property.media?.[0]?.url && (
          <img
            className="seller-action__photo"
            src={data.property.media[0].url}
            alt={data.property.title}
          />
        )}
        <h3>{data.property.title}</h3>
        <div className="seller-action__row">
          <span>السعر المعروض</span>
          <strong>{fmt(data.property.price)}</strong>
        </div>
        <div className="seller-action__row seller-action__row--highlight">
          <span>عرض المشتري</span>
          <strong>{fmt(data.buyerOffer)}</strong>
        </div>

        {!showCounter ? (
          <div className="seller-action__buttons">
            <button
              className="btn btn-primary"
              disabled={phase === 'submitting'}
              onClick={() => submit('ACCEPT')}
            >
              ✅ قبول
            </button>
            <button
              className="btn btn-ghost"
              disabled={phase === 'submitting'}
              onClick={() => setShowCounter(true)}
            >
              🔄 عرض مضاد
            </button>
            <button
              className="btn btn-danger"
              disabled={phase === 'submitting'}
              onClick={() => submit('REJECT')}
            >
              ❌ رفض
            </button>
          </div>
        ) : (
          <div className="seller-action__counter">
            <input
              type="number"
              className="form-input"
              placeholder="السعر المضاد بالجنيه"
              value={counter}
              onChange={(e) => setCounter(e.target.value)}
            />
            <div className="seller-action__buttons">
              <button
                className="btn btn-primary"
                disabled={!counter || phase === 'submitting'}
                onClick={() => submit('COUNTER', Number(counter))}
              >
                إرسال
              </button>
              <button
                className="btn btn-muted"
                onClick={() => {
                  setShowCounter(false);
                  setCounter('');
                }}
              >
                ✕ إلغاء
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
