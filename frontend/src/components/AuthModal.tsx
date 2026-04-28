import React, { useState, useRef, useEffect } from 'react';
import { sendOtp, verifyOtp, updateProfile } from '../api/auth';
import { useAuth } from '../store/AuthContext';

type Step = 'phone' | 'otp' | 'profile';

interface AuthModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess }) => {
  const { login } = useAuth();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [channel, setChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [token, setToken] = useState('');
  const [userId, setUserId] = useState('');
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startResendTimer = () => {
    setResendTimer(60);
    timerRef.current = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) { clearInterval(timerRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  // ── Step 1: send OTP ──────────────────────────────────────────
  const handleSendOtp = async () => {
    const fullPhone = `+20${phone.replace(/^0/, '')}`;
    if (!/^\+20[0-9]{10}$/.test(fullPhone)) {
      setError('رقم الهاتف غير صحيح. مثال: 01012345678');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await sendOtp(fullPhone);
      setChannel(res.channel);
      setStep('otp');
      startResendTimer();
      // Dev mode: auto-fill OTP from backend response
      if (res.devOtp) {
        setOtp(res.devOtp.split(''));
      }
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (e: unknown) {
      const raw = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '';
      // Map common backend error messages to user-friendly Arabic
      const errorMap: Record<string, string> = {
        'Rate limit exceeded': 'لقد تجاوزت الحد المسموح. حاول بعد قليل.',
        'Failed to send OTP via WhatsApp': 'فشل إرسال الكود عبر واتساب. تأكد أن رقمك مسجل على واتساب.',
        'Too many OTP requests': 'طلبات كثيرة جداً. انتظر قليلاً ثم حاول مرة أخرى.',
      };
      const matched = Object.entries(errorMap).find(([key]) => raw.includes(key));
      setError(matched ? matched[1] : (raw || 'حدث خطأ. حاول مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  };

  // ── OTP input handling ────────────────────────────────────────
  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (digits.length === 6) {
      setOtp(digits.split(''));
      otpRefs.current[5]?.focus();
    }
  };

  // ── Step 2: verify OTP ────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length < 6) { setError('أدخل الكود المكون من 6 أرقام'); return; }
    const fullPhone = `+20${phone.replace(/^0/, '')}`;
    setLoading(true);
    setError('');
    try {
      const res = await verifyOtp(fullPhone, code);
      setToken(res.token);
      setUserId(res.userId);
      // Persist token immediately so authenticated API calls work (e.g. updateProfile)
      localStorage.setItem('semsar_token', res.token);
      if (res.isNewUser) {
        setStep('profile');
      } else {
        // Existing user — use name/email returned directly from the API
        login(res.token, {
          id: res.userId,
          phone: fullPhone,
          name: res.name,
          email: res.email,
          dateOfBirth: null,
          sexType: null,
          notes: null,
          userType: res.userType as 'ADMIN' | 'USER',
        });
        onSuccess?.();
        onClose();
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'كود خاطئ أو منتهي الصلاحية.');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: update profile ────────────────────────────────────
  const handleProfile = async () => {
    if (!name.trim()) { setError('الاسم مطلوب'); return; }
    setLoading(true);
    setError('');
    const fullPhone = `+20${phone.replace(/^0/, '')}`;
    try {
      const user = await updateProfile(name.trim(), email.trim() || undefined);
      login(token, {
        id: userId,
        phone: fullPhone,
        name: user.name,
        email: user.email,
        dateOfBirth: user.dateOfBirth ?? null,
        sexType: user.sexType ?? null,
        notes: user.notes ?? null,
        userType: user.userType,
      });
      onSuccess?.();
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'حدث خطأ في حفظ البيانات.');
    } finally {
      setLoading(false);
    }
  };

  const stepIndex = { phone: 0, otp: 1, profile: 2 }[step];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal>
        <button className="modal__close" onClick={onClose} aria-label="إغلاق">✕</button>

        {/* Steps indicator */}
        <div className="modal__steps">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`modal__step-dot ${i <= stepIndex ? 'modal__step-dot--active' : ''}`}
            />
          ))}
        </div>

        {/* ── Phone step ── */}
        {step === 'phone' && (
          <>
            <div className="modal__icon">📱</div>
            <h2 className="modal__title">تسجيل الدخول</h2>
            <p className="modal__sub">أدخل رقم هاتفك المصري وسنرسل لك كود التحقق</p>

            <div className="modal__form">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="modal__phone-prefix">
                <span>🇪🇬 +20</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="01012345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                  maxLength={11}
                  autoFocus
                />
              </div>
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={handleSendOtp}
                disabled={loading || phone.length < 10}
              >
                {loading ? <span className="spinner" /> : 'إرسال الكود'}
              </button>
            </div>
          </>
        )}

        {/* ── OTP step ── */}
        {step === 'otp' && (
          <>
            <div className="modal__icon">{channel === 'whatsapp' ? '📱' : '💬'}</div>
            <h2 className="modal__title">كود التحقق</h2>
            <p className="modal__sub">
              {channel === 'whatsapp'
                ? 'تم إرسال كود التحقق على واتساب'
                : 'تم إرسال كود التحقق برسالة SMS'}
              <br />
              <strong dir="ltr">+20{phone}</strong>
            </p>

            <div className="modal__form">
              {error && <div className="alert alert-error">{error}</div>}

              <div className="otp-inputs" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    className={digit ? 'filled' : ''}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKey(i, e)}
                  />
                ))}
              </div>

              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={handleVerifyOtp}
                disabled={loading || otp.join('').length < 6}
              >
                {loading ? <span className="spinner" /> : 'تأكيد'}
              </button>

              <div className="modal__resend">
                {resendTimer > 0 ? (
                  <span>يمكنك إعادة الإرسال بعد {resendTimer} ثانية</span>
                ) : (
                  <>
                    لم تستلم الكود على واتساب؟{' '}
                    <button
                      onClick={() => {
                        setOtp(['', '', '', '', '', '']);
                        setStep('phone');
                        setError('');
                      }}
                    >
                      إرسال مجدداً
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Profile step ── */}
        {step === 'profile' && (
          <>
            <div className="modal__icon">👤</div>
            <h2 className="modal__title">أكمل ملفك الشخصي</h2>
            <p className="modal__sub">سيظهر اسمك للبائع أثناء التفاوض</p>

            <div className="modal__form">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-group">
                <label className="form-label">الاسم *</label>
                <input
                  className="form-input"
                  placeholder="مثال: أحمد محمد"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleProfile()}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">البريد الإلكتروني (اختياري)</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ direction: 'ltr', textAlign: 'right' }}
                />
              </div>
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={handleProfile}
                disabled={loading || !name.trim()}
              >
                {loading ? <span className="spinner" /> : 'ابدأ الاستخدام 🚀'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
