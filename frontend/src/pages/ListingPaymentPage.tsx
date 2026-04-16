import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { completeListingCredit } from '../api/listingCredits';

type PageState = 'loading' | 'confirm' | 'success' | 'error';

/**
 * Listing Fee Payment page — 100 EGP per property listing.
 * Route: /listing-payment/:creditId
 *
 * After successful payment, redirects to /
 * with ?add_property=1 so ChatWidget auto-starts onboarding.
 */
export const ListingPaymentPage: React.FC = () => {
  const { creditId } = useParams<{ creditId: string }>();
  const navigate = useNavigate();

  const [pageState, setPageState] = useState<PageState>('confirm');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!creditId) navigate('/');
  }, [creditId, navigate]);

  const handlePay = async () => {
    if (!creditId) return;
    setLoading(true);
    setErrorMsg('');
    try {
      await completeListingCredit(creditId);
      setPageState('success');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setErrorMsg(msg ?? 'حدث خطأ في تأكيد الدفع، حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    // Navigate home with flag → ChatWidget picks it up and auto-starts onboarding
    navigate('/?add_property=1');
  };

  return (
    <div className="neg-page">
      {/* Header */}
      <header className="header">
        <Link to="/" className="header__logo">
          <div className="header__logo-icon">🏠</div>
          <span>سمسار AI</span>
        </Link>
        <div className="header__spacer" />
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', padding: '0 16px' }}>
          💳 رسوم الإعلان
        </div>
      </header>

      <div style={{ padding: 20, maxWidth: 480, margin: '0 auto' }}>
        {/* Loading */}
        {pageState === 'loading' && (
          <div className="loading-center">
            <div className="spinner spinner-lg" />
          </div>
        )}

        {/* Confirm payment */}
        {pageState === 'confirm' && (
          <div className="payment-step">
            <div className="payment-step__icon">🏠</div>
            <div className="payment-step__title">رسوم إضافة عقار</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              لإضافة إعلانك العقاري على منصة سمسار AI
            </div>

            <div className="payment-step__fee-row">
              <span className="payment-step__fee-label">رسوم الإعلان</span>
              <span className="payment-step__fee-amount" style={{ color: 'var(--primary)', fontWeight: 800 }}>
                ١٠٠ ج.م
              </span>
            </div>

            <div style={{
              background: 'var(--surface-tertiary, #f3f4f6)',
              borderRadius: 8,
              padding: '12px 16px',
              margin: '16px 0',
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}>
              ✅ سيظهر الإعلان بعد المراجعة<br />
              ✅ يصل إعلانك لآلاف المشترين والمستأجرين<br />
              ⚠️ بيئة تجريبية — لن يتم خصم أي مبلغ فعلي
            </div>

            {errorMsg && (
              <div className="alert alert-error" style={{ marginBottom: 12 }}>
                {errorMsg}
              </div>
            )}

            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={handlePay}
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : '💳 ادفع ١٠٠ جنيه وأضف عقارك'}
            </button>

            <Link
              to="/"
              className="btn btn-ghost btn-full"
              style={{ marginTop: 10 }}
            >
              إلغاء
            </Link>
          </div>
        )}

        {/* Success */}
        {pageState === 'success' && (
          <div className="owner-contact">
            <div className="owner-contact__icon">🎉</div>
            <div className="owner-contact__title">تم الدفع بنجاح!</div>
            <div className="owner-contact__sub" style={{ marginBottom: 20 }}>
              يمكنك الآن إضافة عقارك — ستُحوَّل تلقائياً إلى خطوات الإضافة
            </div>

            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={handleContinue}
            >
              🏠 أضف عقارك الآن
            </button>
          </div>
        )}

        {/* Error */}
        {pageState === 'error' && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
            <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{errorMsg}</p>
            <Link to="/" className="btn btn-primary">العودة للرئيسية</Link>
          </div>
        )}
      </div>
    </div>
  );
};
