import React, { useEffect, useState } from 'react';
import { 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  FileText
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/formatters';
import { StatusBadge } from '../../components/admin/StatusBadge';

interface AuditItem {
  id: string;
  adminId: string;
  admin?: {
    name?: string;
    email?: string;
  };
  action: string;
  targetUserId?: string;
  targetOrderId?: string;
  amount?: number;
  reason?: string;
  metadata?: any;
  ip?: string;
  createdAt: string;
}

export const AdminAudit: React.FC = () => {
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    try {
      const data = await api.get('/api/admin/audit');
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(l => {
    const term = search.toLowerCase();
    return (
      l.action.toLowerCase().includes(term) ||
      (l.admin?.name || '').toLowerCase().includes(term) ||
      (l.admin?.email || '').toLowerCase().includes(term) ||
      (l.reason || '').toLowerCase().includes(term) ||
      (l.targetUserId || '').toLowerCase().includes(term) ||
      (l.targetOrderId || '').toLowerCase().includes(term)
    );
  });

  return (
    <>
      {/* Top Filter & Search Bar */}
      <div className="admin-filter-bar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input admin-search-input"
            placeholder="ابحث بالإجراء، اسم المشرف، أو السبب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="admin-filter-group">
          <button 
            onClick={fetchLogs}
            className="admin-btn admin-btn-secondary admin-btn-sm"
            title="تحديث السجل"
          >
            <RefreshCw size={14} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* Audit Log Card */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <ShieldAlert size={18} color="#f59e0b" />
            <span>سجل الرقابة وتتبع العمليات (Audit Log) ({filteredLogs.length})</span>
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            سجل غير قابل للتعديل مسجل في قاعدة بيانات PostgreSQL
          </span>
        </div>

        <div className="admin-table-container">
          {loading ? (
            <div style={{ padding: '32px' }}>
              <div className="admin-skeleton" style={{ height: '40px', marginBottom: '12px' }} />
              <div className="admin-skeleton" style={{ height: '40px' }} />
            </div>
          ) : filteredLogs.length > 0 ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>المشرف (Admin)</th>
                  <th>نوع الإجراء (Action)</th>
                  <th>المستهدف</th>
                  <th>المبلغ</th>
                  <th>السبب والملاحظات</th>
                  <th>التاريخ والوقت</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>
                        {log.admin?.name || 'مشرف النظام'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {log.admin?.email || '—'}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={log.action} />
                    </td>
                    <td>
                      {log.targetUserId ? (
                        <div style={{ fontSize: '0.8rem' }}>
                          <span style={{ color: '#64748b' }}>عميل: </span>
                          <span style={{ fontFamily: 'monospace' }}>#{log.targetUserId.slice(0, 8)}</span>
                        </div>
                      ) : log.targetOrderId ? (
                        <div style={{ fontSize: '0.8rem' }}>
                          <span style={{ color: '#64748b' }}>طلب: </span>
                          <span style={{ fontFamily: 'monospace' }}>#{log.targetOrderId.slice(0, 8)}</span>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>-</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 800 }}>
                      {log.amount ? (() => {
                        let cur = 'USD';
                        if (log.metadata) {
                          try {
                            const parsed = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
                            if (parsed?.currency) cur = parsed.currency;
                          } catch (_) {}
                        }
                        if (cur === 'USD' && (log.reason?.includes('SDG') || log.reason?.includes('ج.س'))) {
                          cur = 'SDG';
                        }
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: log.amount > 0 ? '#10b981' : '#dc2626' }}>
                              {log.amount > 0 ? `+${formatCurrency(log.amount, cur)}` : formatCurrency(log.amount, cur)}
                            </span>
                            <span className="admin-badge admin-badge-neutral" style={{ fontSize: '0.675rem', padding: '1px 5px' }}>
                              {cur}
                            </span>
                          </div>
                        );
                      })() : (
                        <span style={{ color: '#94a3b8' }}>-</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: '#334155' }}>
                      {log.reason || '-'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {new Date(log.createdAt).toLocaleString('ar-EG')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty-state">
              <div className="admin-empty-icon">
                <FileText size={28} />
              </div>
              <h4 className="admin-empty-title">لا توجد سجلات رقابة مطابقة</h4>
              <p className="admin-empty-text">جميع الإجراءات الإدارية مثل تعديل الأرصدة والطلبات ستوثق هنا آلياً.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
