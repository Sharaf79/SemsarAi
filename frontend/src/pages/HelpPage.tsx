import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'كيف أضيف عقاري؟',
    answer:
      'اضغط على زر "اضافة عقار 🏠" في أعلى الصفحة أو من القائمة. سيتحدث معك مساعد AI لجمع بيانات عقارك خطوة بخطوة — نوع العقار، الموقع، التفاصيل، السعر، والصور. بعد المراجعة، يتم نشر إعلانك مباشرة.',
  },
  {
    question: 'كيف أتواصل مع صاحب العقار؟',
    answer:
      'عند الضغط على "تواصل مع المالك" في صفحة العقار، ستبدأ عملية تفاوض مع AI. بعد الاتفاق على السعر وإتمام الدفع، سيظهر لك رقم هاتف المالك للتواصل المباشر.',
  },
  {
    question: 'كيف يعمل التفاوض؟',
    answer:
      'نظام التفاوض يعمل عبر AI — تحدد ميزانيتك، ويبدأ AI في التفاوض نيابة عنك. يمكنك قبول العرض، رفضه، أو تقديم عرض مضاد. عند الاتفاق، تنتقل لخطوة الدفع.',
  },
  {
    question: 'كيف أعدل أو أحذف إعلاني؟',
    answer:
      'اذهب إلى "إعلاناتي" من القائمة. ستجد كل عقاراتك مع خيارات إيقاف/تفعيل الإعلان أو حذفه. يمكنك أيضاً عرض حالة كل إعلان (نشط، غير نشط، مباع، مؤجر).',
  },
  {
    question: 'هل الخدمة مجانية؟',
    answer:
      'إضافة العقارات والبحث مجاني تماماً. يتم احتساب عمولة صغيرة (0.25%) فقط عند إتمام صفقة ناجحة من خلال نظام التفاوض.',
  },
];

export const HelpPage: React.FC = () => {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(null);


  const toggle = (idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <>
      <Header onLoginClick={() => {}} />
      <div className="help-page">
        <button className="profile-back" onClick={() => navigate(-1)}>
          → رجوع
        </button>

        <h1 className="help-page__title">❓ المساعدة</h1>
        <p className="help-page__sub">
          أسئلة شائعة وإجابات سريعة حول استخدام سمسار AI
        </p>

        {FAQ_ITEMS.map((item, idx) => (
          <div key={idx} className="faq-item">
            <button className="faq-item__question" onClick={() => toggle(idx)}>
              <span>{item.question}</span>
              <span
                className={`faq-item__arrow ${openIndex === idx ? 'faq-item__arrow--open' : ''}`}
              >
                ▼
              </span>
            </button>
            {openIndex === idx && (
              <div className="faq-item__answer">{item.answer}</div>
            )}
          </div>
        ))}

        <div className="help-contact">
          <h2 className="help-contact__title">📞 تحتاج مساعدة إضافية؟</h2>
          <div className="help-contact__links">
            <a
              href="mailto:support@semsar-ai.com"
              className="btn btn-ghost btn-sm"
            >
              📧 support@semsar-ai.com
            </a>
            <a
              href="https://wa.me/201000000000"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
              style={{ background: '#25D366' }}
            >
              💬 واتساب
            </a>
          </div>
        </div>
      </div>
    </>
  );
};
