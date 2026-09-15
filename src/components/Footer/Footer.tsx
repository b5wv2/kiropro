import React from 'react';
import headerStyles from '../Header/Header.module.css';

export const Footer: React.FC = () => {
  return (
    <footer className="site-footer" id="footer">
      <div className="container">
        <div className="footer-grid">
          {/* Col 1: Brand Info */}
          <div className="footer-brand">
            <a href="#" className={headerStyles.logoWrapper} dir="ltr" aria-label="KIROPRO">
              <div className={headerStyles.logoMark}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div className={headerStyles.logoText}>
                <span className={headerStyles.brandName}>KIRO</span>
                <span className={headerStyles.brandBadge}>PRO</span>
              </div>
            </a>
            <p className="footer-desc">
              منصة KIROPRO الرقمية لشحن الألعاب والمنتجات الرقمية. نظام رصيد مسبق الدفع وتنفيذ مؤتمت وسريع لجميع ألعابك المفضلة.
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--bg-tertiary)', padding: '8px 14px', borderRadius: 'var(--radius-pill)', fontSize: '0.8rem', fontWeight: 700, width: 'fit-content' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>نظام محفظة رقمية مسبقة الدفع</span>
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div>
            <h4 className="footer-col-title">روابط سريعة</h4>
            <div className="footer-links">
              <a href="#games" className="footer-link">الألعاب الأكثر طلباً</a>
              <a href="#how-it-works" className="footer-link">آلية الشحن والتنفيذ</a>
              <a href="#why-us" className="footer-link">معايير المنصة</a>
              <a href="#deals" className="footer-link">العروض الخاصة</a>
              <a href="#" className="footer-link">سجل العمليات</a>
            </div>
          </div>

          {/* Col 3: Legal & Policies */}
          <div>
            <h4 className="footer-col-title">السياسات والضمان</h4>
            <div className="footer-links">
              <a href="#" className="footer-link">شروط استخدام المنصة</a>
              <a href="#" className="footer-link">سياسة الخصوصية</a>
              <a href="#" className="footer-link">سياسة الرصيد والمحفظة</a>
              <a href="#" className="footer-link">آلية معالجة الطلبات</a>
              <a href="#" className="footer-link">الأسئلة الشائعة (FAQ)</a>
            </div>
          </div>

          {/* Col 4: Support & System */}
          <div>
            <h4 className="footer-col-title">الدعم ومزودو الخدمة</h4>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
              دعم فني مخصص للاعبين لمتابعة حالة شحناتك وتوجيه المساعدة الفورية.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
                <span>تنفيذ تلقائي عبر واجهات برمجة التطبيقات (APIs)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-yellow)' }} />
                <span>رصيد KIROPRO Wallet مسبق الدفع</span>
              </div>
            </div>
            <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: 14 }}>
              البريد: support@kiropro.com
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div>
            جميع الحقوق محفوظة © 2026 <strong>KIROPRO</strong>. منصة ألعاب رقمية عالمية.
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <a href="#" style={{ color: 'var(--text-muted)', fontSize: '0.825rem' }}>الشروط</a>
            <a href="#" style={{ color: 'var(--text-muted)', fontSize: '0.825rem' }}>الخصوصية</a>
            <a href="#" style={{ color: 'var(--text-muted)', fontSize: '0.825rem' }}>الدعم الفني</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
