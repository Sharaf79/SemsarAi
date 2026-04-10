import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getPayment, completePayment } from '../api/payments';
import type { PaymentDetail } from '../types';

function formatMoney(val: number | null | undefined): string {
  if (val == null) return '—';
  return val.toLocaleString('ar-EG') + ' ج.م';
}

type PageState = 'loading' | 'confirm' | 'success' | 'error';

/**
 * Mock payment page — simulates a gateway redirect.
 * Route: /payment/:paymentId
 *
 * In production this would be replaced by the real Paymob/Fawry iframe.
 */
export const MockPaymentPage: React.FC = () => {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!paymentId) {
      navigate('/');
      return;
    }
    loadPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  const loadPayment = async () => {
    try {
      const data = await getPayment(paymentId!);
      setPayment(data);
      if (data.status === 'COMPLETED') {
        setPageState('success');
      } else {
        setPageState('confirm');
      }
    } catch {
      setPageState('error');
      setErrorMsg('تعذّر تحميل بيانات الدفع.');
    }
  };

  const handleConfirmPayment = async () => {
    if (!paymentId || !payment) return;
    setLoading(true);
    setErrorMsg('');
    try {
      await completePayment(paymentId, payment.fee);
      setPageState('success');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErrorMsg(msg ?? 'حدث خطأ في تأكيد الدفع.');
    } finally {
      setLoading(false);
    }
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
          💳 صفحة الدفع
        </div>
      </header>

      <div style={{ padding: 20, maxWidth: 480, margin: '0 auto' }}>
        {/* Loading */}
        {pageState === 'loading' && (
          <div className="loading-center">
            <div className="spinner spinner-lg" />
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

        {/* Confirm */}
        {pageState === 'confirm' && payment && (
          <div className="payment-step">
            <div className="payment-step__icon">💳</div>
            <div className="payment-step__title">تأكيد الدفع</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              بوابة دفع تجريبية — اضغط لتأكيد الدفع
            </div>

            <div className="payment-step__fee-row">
              <span className="payment-step__fee-label">سعر العقار</span>
              <span className="payment-step__fee-amount">{formatMoney(payment.amount)}</span>
            </div>

            <div className="payment-step__fee-row">
              <span className="payment-step__fee-label">رسوم الخدمة (0.25%)</span>
              <span className="payment-step__fee-amount" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                {formatMoney(payment.fee)}
              </span>
            </div>

            <div style={{
              background: 'var(--surface-tertiary, #f3f4f6)',
              borderRadius: 8,
              padding: '12px 16px',
              margin: '16px 0',
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}>
              ⚠️ هذه بيئة تجريبية — لن يتم خصم أي مبلغ فعلي
            </div>

            {errorMsg && <div className="alert alert-error" style={{ marginBottom: 12 }}>{errorMsg}</div>}

            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={handleConfirmPayment}
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : '✅ تأكيد الدفع'}
            </button>
          </div>
        )}

        {/* Success */}
        {pageState === 'success' && (
          <div className="owner-contact">
            <div className="owner-contact__icon">🎉</div>
            <div className="owner-contact__title">تم الدفع بنجاح!</div>
            <div className="owner-contact__sub" style={{ marginBottom: 20 }}>
              يمكنك الآن العودة لصفحة التفاوض لكشف بيانات المالك
            </div>

            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={() => window.history.back()}
              style={{ marginBottom: 12 }}
            >
              📱 العودة لكشف بيانات المالك
            </button>

            <Link to="/" className="btn btn-ghost btn-full">
              🏠 العودة للرئيسية
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
