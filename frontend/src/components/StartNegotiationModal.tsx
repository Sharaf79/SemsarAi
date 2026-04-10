import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startNegotiation } from '../api/negotiations';
import type { Property } from '../types/index';

interface StartNegotiationModalProps {
  property: Property;
  onClose: () => void;
}

function formatPrice(price: string): string {
  const n = parseFloat(price);
  if (isNaN(n)) return price;
  return n.toLocaleString('ar-EG');
}

export const StartNegotiationModal: React.FC<StartNegotiationModalProps> = ({
  property,
  onClose,
}) => {
  const navigate = useNavigate();
  const [budget, setBudget] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const listingPrice = parseFloat(property.price);

  const handleStart = async () => {
    const val = parseFloat(budget.replace(/,/g, ''));
    if (!val || val <= 0) {
      setError('أدخل الميزانية القصوى');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await startNegotiation(property.id, val);
      navigate(`/negotiation/${res.data.negotiationId}`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'حدث خطأ. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const firstImage = property.media?.find((m) => m.type === 'IMAGE');

  return (
    <div className="modal-overlay neg-start-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal__close" onClick={onClose}>✕</button>

        <div className="modal__icon">🤝</div>
        <h2 className="modal__title">ابدأ التفاوض</h2>
        <p className="modal__sub">سمسار AI سيتفاوض نيابةً عنك للحصول على أفضل سعر</p>

        {/* Property mini preview */}
        <div className="property-mini" style={{ marginBottom: 16 }}>
          {firstImage ? (
            <img src={firstImage.url} alt={property.title} className="property-mini__image" />
          ) : (
            <div className="property-mini__image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🏠</div>
          )}
          <div>
            <div className="property-mini__title">{property.title}</div>
            <div className="property-mini__price">
              سعر المالك: {formatPrice(property.price)} ج.م
            </div>
          </div>
        </div>

        <div className="modal__form">
          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-group">
            <label className="form-label">أقصى ميزانية لديك (ج.م) *</label>
            <input
              className="form-input"
              type="number"
              inputMode="numeric"
              placeholder={`مثال: ${Math.round(listingPrice * 0.85).toLocaleString('ar-EG')}`}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              style={{ fontSize: 18, fontWeight: 700, direction: 'ltr', textAlign: 'right' }}
              autoFocus
            />
            <div className="modal__budget-note">
              سعر العرض الأول = 85% من ميزانيتك • يتفاوض AI لمدة 6 جولات كحد أقصى
            </div>
          </div>

          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={handleStart}
            disabled={loading || !budget}
          >
            {loading ? <span className="spinner" /> : '🚀 ابدأ التفاوض'}
          </button>

          <button className="btn btn-ghost btn-full" onClick={onClose} disabled={loading}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
};
