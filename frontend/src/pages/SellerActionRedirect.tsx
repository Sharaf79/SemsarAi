import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSellerEscalation } from '../api/negotiations';

/**
 * SellerActionRedirect — handles the legacy `/seller-action/:token` deep-link
 * from seller-side notifications.
 *
 * The standalone seller action UI is retired (spec negotaiation_enhane001 §A5).
 * This page resolves the escalation token to its negotiationId and forwards to
 * the unified `/negotiation/:id?escalation=<token>` page.
 */
export const SellerActionRedirect: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('رابط غير صالح');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const summary = await getSellerEscalation(token);
        if (cancelled) return;
        navigate(
          `/negotiation/${summary.negotiationId}?escalation=${encodeURIComponent(token)}`,
          { replace: true },
        );
      } catch (e) {
        if (cancelled) return;
        setError(
          (e as Error)?.message ?? 'تعذر فتح صفحة التفاوض، حاول مرة أخرى',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <div
      dir="rtl"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '1.5rem',
        textAlign: 'center',
        gap: '0.75rem',
      }}
    >
      {error ? (
        <>
          <h2 style={{ margin: 0 }}>تعذر فتح المحادثة</h2>
          <p style={{ color: '#666' }}>{error}</p>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: 8,
              border: 'none',
              background: '#1d4ed8',
              color: '#fff',
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            الرجوع للصفحة الرئيسية
          </button>
        </>
      ) : (
        <>
          <div
            aria-hidden
            style={{
              width: 28,
              height: 28,
              border: '3px solid #cbd5e1',
              borderTopColor: '#1d4ed8',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <p style={{ color: '#475569', margin: 0 }}>
            جاري فتح صفحة التفاوض…
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
      )}
    </div>
  );
};
