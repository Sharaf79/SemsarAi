import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { updateProfile } from '../api/auth';
import { Header } from '../components/Header';
import { DatePicker } from '../components/DatePicker';

const SEX_OPTIONS = [
  { value: 'MALE',   label: '👨 ذكر' },
  { value: 'FEMALE', label: '👩 أنثى' },
];

export const ProfilePage: React.FC = () => {
  const { isAuthenticated, user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [name,        setName]        = useState(user?.name ?? '');
  const [email,       setEmail]       = useState(user?.email ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(
    user?.dateOfBirth ? user.dateOfBirth.slice(0, 10) : '',
  );
  const [sexType,     setSexType]     = useState(user?.sexType ?? '');
  const [notes,       setNotes]       = useState(user?.notes ?? '');

  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('الاسم مطلوب');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const updated = await updateProfile(
        name.trim(),
        email.trim() || undefined,
        dateOfBirth || null,
        sexType || null,
        notes.trim() || null,
      );
      updateUser(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <Header onLoginClick={() => {}} />
      <div className="profile-page">
        <div className="profile-card">
          <button className="profile-back" onClick={() => navigate(-1)}>
            → رجوع
          </button>

          <div className="profile-card__header">
            <div className="profile-card__avatar">
              {user.name ? user.name[0].toUpperCase() : '👤'}
            </div>
            <h1 className="profile-card__title">الملف الشخصي</h1>
          </div>

          <form className="profile-form" onSubmit={handleSubmit}>

            {/* Phone — read only */}
            <div className="form-group">
              <label className="form-label">📱 رقم الهاتف</label>
              <input
                className="form-input"
                value={user.phone}
                readOnly
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', direction: 'ltr', textAlign: 'right' }}
              />
            </div>

            {/* Name */}
            <div className="form-group">
              <label className="form-label">👤 الاسم</label>
              <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="أدخل اسمك"
              />
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label">📧 البريد الإلكتروني</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                style={{ direction: 'ltr', textAlign: 'right' }}
              />
            </div>

            {/* Date of Birth — calendar picker */}
            <DatePicker
              label="🎂 تاريخ الميلاد"
              value={dateOfBirth}
              onChange={setDateOfBirth}
              maxDate={new Date().toISOString().slice(0, 10)}
            />

            {/* Sex Type */}
            <div className="form-group">
              <label className="form-label">⚧ الجنس</label>
              <select
                className="form-input"
                value={sexType}
                onChange={(e) => setSexType(e.target.value)}
              >
                <option value="">— اختر —</option>
                {SEX_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="form-group">
              <label className="form-label">📝 ملاحظات</label>
              <textarea
                className="form-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي معلومات إضافية..."
                rows={3}
                maxLength={2000}
                style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' }}
              />
            </div>

            {error   && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">✅ تم حفظ التعديلات بنجاح</div>}

            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={saving}
            >
              {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};
