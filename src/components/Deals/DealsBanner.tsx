import React from 'react';

export const DealsBanner: React.FC = () => {
  return (
    <section className="section" id="deals">
      <div className="container">
        <div className="deal-banner">
          <div className="deal-grid">
            <div>
              <span className="badge-tag" style={{ background: 'var(--accent-yellow)', color: '#0B0F19', marginBottom: 12, fontWeight: 800 }}>
                عروض خاصة مستمرة 🔥
              </span>
              <h3 style={{ fontSize: 'clamp(1.7rem, 3vw, 2.3rem)', fontWeight: 900, lineHeight: 1.25, marginBottom: 14, color: '#FFFFFF' }}>
                خصومات حصرية على باقات شدات ببجي وجواهر فري فاير
              </h3>
              <p style={{ color: '#CBD5E1', fontSize: '1rem', lineHeight: 1.7, marginBottom: 24, maxWidth: 520 }}>
                وفر رصيدك واستمتع بأسعار منافسة يتم تنفيذها تلقائياً من محفظتك إلى حسابك داخل اللعبة مباشرة.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1.5px dashed var(--accent-yellow)', borderRadius: 'var(--radius-md)', padding: '10px 18px', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>كود التفعيل:</span>
                  <span className="latin-num" style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--accent-yellow)', letterSpacing: 1 }}>KIROPRO</span>
                </div>
                <a href="#games" className="btn btn-primary btn-sm">
                  <span>تصفح العروض الآن</span>
                </a>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 'var(--radius-xl)', padding: 26, width: '100%', maxWidth: 320, textAlign: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#94A3B8', display: 'block', marginBottom: 8 }}>جاهز للتنفيذ التلقائي</span>
                <div style={{ padding: 16, background: 'rgba(0,0,0,0.4)', borderRadius: 12, marginBlock: 12 }}>
                  <span style={{ fontSize: '0.85rem', color: '#CBD5E1' }}>الطلبات تُرسل مباشرة عبر مزود الخدمة</span>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#4ADE80', fontWeight: 700 }}>✓ تنفيذ الطلب فور توفر الرصيد</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
