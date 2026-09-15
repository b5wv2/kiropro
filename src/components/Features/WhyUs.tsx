import React from 'react';

const FEATURES = [
  {
    title: 'شحن تلقائي',
    desc: 'تنفيذ فوري مباشر عبر الربط الآلي مع مزودي الخدمة دون تأخير أو إجراءات يدوية بمجرد إتمام الشراء.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    )
  },
  {
    title: 'دفع من رصيدك',
    desc: 'نظام رصيد مسبق الدفع داخل محفظة KIROPRO يضمن الشراء بضغطة واحدة وبدون أي تعقيدات Checkout.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M7 15h0M2 9.5h20" />
      </svg>
    )
  },
  {
    title: 'تنفيذ سريع',
    desc: 'ينتقل الطلب فورياً وبشكل مؤتمت إلى مزود الخدمة لتسليم الشدات أو البطاقات دون انتظار.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    )
  },
  {
    title: 'دعم العملاء',
    desc: 'فريق دعم فني مخصص للاعبين لمتابعة حالة الطلبات وتوجيه المساعدة المباشرة في حال واجهتك أي مشكلة.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    )
  }
];

export const WhyUs: React.FC = () => {
  return (
    <section className="section" id="why-us" style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-subtle)' }}>
      <div className="container">
        <div className="section-header text-center">
          <span className="badge-tag badge-brand">معايير المنصة</span>
          <h2 className="heading-section">لماذا يختار اللاعبون منصة KIROPRO؟</h2>
          <p className="subheading" style={{ maxWidth: 620 }}>
            نظام رقمي مصمم لسرعتك وراحتك كلاعب: محفظة مسبقة الدفع وتنفيذ آلي فوري بدون تعقيدات.
          </p>
        </div>

        <div className="features-grid">
          {FEATURES.map((feat, idx) => (
            <div key={idx} className="feature-card">
              <div className="feature-icon-box">
                {feat.icon}
              </div>
              <h3 className="feature-title">{feat.title}</h3>
              <p className="feature-desc">{feat.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
