import React from 'react';

const STEPS = [
  {
    step: '01',
    title: 'إيداع الرصيد في محفظتك',
    desc: 'اشحن رصيد محفظة KIROPRO مسبقة الدفع لتكون جاهزاً للشراء الفوري لأي لعبة أو بطاقة في أي وقت.'
  },
  {
    step: '02',
    title: 'اختيار المنتج ومعرّف الحساب',
    desc: 'حدد اللعبة أو البطاقة المطلوبة، واختر الباقة، ثم أدخل معرّف حسابك (Player ID) بدقة.'
  },
  {
    step: '03',
    title: 'تأكيد الشراء والتنفيذ التلقائي',
    desc: 'يُخصم المبلغ مباشرة من رصيد محفظتك، وينتقل الطلب آلياً إلى مزود الخدمة لتسليم الشحن فوراً.'
  }
];

export const HowItWorks: React.FC = () => {
  return (
    <section className="section" id="how-it-works">
      <div className="container">
        <div className="section-header text-center">
          <span className="badge-tag badge-delivery">نظام مسبق الدفع</span>
          <h2 className="heading-section">كيف يعمل الشحن في KIROPRO؟</h2>
          <p className="subheading" style={{ maxWidth: 600 }}>
            آلية شراء مباشرة وسلسة تضمن لك تنفيذ طلباتك في ثوانٍ معدودة.
          </p>
        </div>

        <div className="steps-grid">
          {STEPS.map((s, idx) => (
            <div key={idx} className="step-card">
              <div className="step-num-badge">{s.step}</div>
              <h3 className="step-title">{s.title}</h3>
              <p className="step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
