import React, { useState } from 'react';
import { simulateNegotiation } from '../api/negotiations';
import type { SimulationResult } from '../api/negotiations';
import type { Property } from '../types/index';

interface Props {
  property: Property;
  onClose: () => void;
}

function fmt(n: number): string {
  return n.toLocaleString('ar-EG');
}

const outcomeLabel: Record<string, { label: string; color: string }> = {
  INITIAL: { label: 'عرض مبدئي', color: '#0ea5e9' },
  COUNTER: { label: 'عرض مقابل', color: '#f59e0b' },
  AGREED: { label: '✅ تم الاتفاق', color: '#10b981' },
  ESCALATE_TO_OWNER: { label: '📢 إحالة للمالك', color: '#ef4444' },
};

export const SimulateNegotiationModal: React.FC<Props> = ({ property, onClose }) => {
  const listingPrice = parseFloat(property.price) || 0;
  const defaultMin = Math.round(listingPrice * 0.85);

  const [offer, setOffer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SimulationResult | null>(null);

  const handleStart = async () => {
    const buyerOffer = parseFloat(offer.replace(/,/g, ''));
    if (!buyerOffer || buyerOffer <= 0) {
      setError('من فضلك أدخل عرضك');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await simulateNegotiation(listingPrice, defaultMin, buyerOffer);
      setResult(res.data);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'حدث خطأ في الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-overlay neg-start-modal"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" style={{ maxWidth: 560 }}>
        <button className="modal__close" onClick={onClose}>✕</button>

        {!result ? (
          <>
            <div className="modal__icon">🤝</div>
            <h2 className="modal__title">تواصل مع سمسار AI</h2>
            <p className="modal__sub">
              أدخل عرضك وسيتفاوض الذكاء الاصطناعي نيابةً عن المالك
            </p>

            <div className="property-mini" style={{ marginBottom: 16 }}>
              <div>
                <div className="property-mini__title">{property.adTitle || property.title}</div>
                <div className="property-mini__price">سعر المالك: {fmt(listingPrice)} ج.م</div>
              </div>
            </div>

            <div className="modal__form">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-group">
                <label className="form-label">عرضك (ج.م) *</label>
                <input
                  className="form-input"
                  type="number"
                  inputMode="numeric"
                  placeholder={`مثال: ${fmt(defaultMin)}`}
                  value={offer}
                  onChange={(e) => setOffer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                  style={{ fontSize: 18, fontWeight: 700, direction: 'ltr', textAlign: 'right' }}
                  autoFocus
                />
              </div>

              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={handleStart}
                disabled={loading || !offer}
              >
                {loading ? <span className="spinner" /> : '🚀 ابدأ التفاوض'}
              </button>
              <button className="btn btn-ghost btn-full" onClick={onClose} disabled={loading}>
                إلغاء
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal__icon">{result.finalOutcome === 'AGREED' ? '✅' : '📢'}</div>
            <h2 className="modal__title">
              {result.finalOutcome === 'AGREED' ? 'تم الاتفاق' : 'تم إرسال عرضك للمالك'}
            </h2>

            <div style={{ background: '#f9fafb', padding: 12, borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                نطاق المالك: {fmt(result.sellerMinPrice)} - {fmt(result.sellerMaxPrice)} ج.م
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                الجدول: {result.schedule.map(fmt).join(' ← ')}
              </div>
            </div>

            <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 12 }}>
              {result.steps.map((step) => {
                const o = outcomeLabel[step.outcome];
                return (
                  <div
                    key={step.round}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRight: `4px solid ${o.color}`,
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 8,
                      background: '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong>الجولة {step.round}</strong>
                      <span style={{ color: o.color, fontWeight: 700 }}>{o.label}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>
                      عرض البائع: {fmt(step.sellerOffer)} • عرضك: {fmt(step.buyerOffer)} ج.م
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.7 }}>{step.message}</div>
                  </div>
                );
              })}
            </div>

            {result.ownerNotice && (
              <div
                className="alert alert-info"
                style={{ marginBottom: 12, lineHeight: 1.7, fontSize: 14 }}
              >
                <strong>📨 رسالة للمالك: </strong>
                {result.ownerNotice}
              </div>
            )}

            <button className="btn btn-primary btn-full" onClick={onClose}>تم</button>
          </>
        )}
      </div>
    </div>
  );
};
