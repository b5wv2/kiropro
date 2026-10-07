import React, { useState, useEffect } from 'react';
import { 
  wheelApi, 
  AdminWheelPrize, 
  AdminWheelStats 
} from '../../services/wheelApi';
import { 
  Trophy, 
  RefreshCw, 
  Plus, 
  Edit2, 
  Trash2, 
  DollarSign, 
  Users, 
  Sparkles, 
  Percent 
} from 'lucide-react';

export const AdminWheel: React.FC = () => {
  const [stats, setStats] = useState<AdminWheelStats | null>(null);
  const [prizes, setPrizes] = useState<AdminWheelPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit/Create Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPrize, setEditingPrize] = useState<Partial<AdminWheelPrize> | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      const [statsData, prizesData] = await Promise.all([
        wheelApi.getStats(),
        wheelApi.getPrizes()
      ]);
      setStats(statsData);
      setPrizes(prizesData);
    } catch (err: any) {
      console.error('Failed to load admin wheel data:', err);
      setError(err?.message || 'فشل تحميل بيانات عجلة الحظ.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleToggle = async (id: string) => {
    try {
      await wheelApi.togglePrize(id);
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'تعذر تعديل حالة الجائزة.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف أو تعطيل الجائزة "${name}"؟`)) return;
    try {
      const res = await wheelApi.deletePrize(id);
      alert(res.message);
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'فشل حذف الجائزة.');
    }
  };

  const handleOpenCreate = () => {
    setEditingPrize({
      name: '',
      type: 'DISCOUNT_FIXED',
      value: 100,
      weight: 100,
      color: '#F59E0B',
      icon: 'Gift',
      is_active: true,
      max_winners: null,
      max_total_cost: null,
      display_order: prizes.length + 1
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (prize: AdminWheelPrize) => {
    setEditingPrize({ ...prize });
    setModalOpen(true);
  };

  const handleSavePrize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPrize) return;

    if (!editingPrize.name?.trim()) {
      alert('اسم الجائزة مطلوب.');
      return;
    }

    setSaving(true);
    try {
      if (editingPrize.id) {
        await wheelApi.updatePrize(editingPrize.id, editingPrize);
      } else {
        await wheelApi.createPrize(editingPrize);
      }
      setModalOpen(false);
      setEditingPrize(null);
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'فشل حفظ الجائزة.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
        <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 12px' }} />
        <div>جاري تحميل إعدادات وإحصائيات عجلة الحظ...</div>
      </div>
    );
  }

  const overview = stats?.overview;

  return (
    <div style={{ direction: 'rtl', paddingBottom: 60 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trophy size={28} color="#D97706" />
            <span>إدارة عجلة الحظ اليومية (Lucky Wheel)</span>
          </h1>
          <p style={{ color: '#64748B', fontSize: '0.9rem', margin: '4px 0 0 0' }}>
            التحكم الكامل في نسب الجوائز، أوزان الاحتمالات، حدود الفائزين والميزانية، ومراقبة التكاليف الاقتصادية.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>تحديث البيانات</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleOpenCreate}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#D97706', borderColor: '#D97706' }}
          >
            <Plus size={16} />
            <span>إضافة جائزة جديدة</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* Top Analytics Metrics */}
      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
          <div style={{ background: '#FFFFFF', padding: 18, borderRadius: 16, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', fontSize: '0.82rem', fontWeight: 700, marginBottom: 8 }}>
              <span>إجمالي السحوبات</span>
              <Users size={16} color="#6366F1" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0F172A' }}>
              {overview.totalSpins.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>
              1 حساب = 1 سحب يومياً
            </div>
          </div>

          <div style={{ background: '#FFFFFF', padding: 18, borderRadius: 16, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', fontSize: '0.82rem', fontWeight: 700, marginBottom: 8 }}>
              <span>إجمالي تكلفة الجوائز</span>
              <DollarSign size={16} color="#059669" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#059669' }}>
              {overview.totalRewardCost.toLocaleString()} <span style={{ fontSize: '0.9rem' }}>ج.س</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>
              معدل: {overview.averageRewardCost} ج.س / سحب
            </div>
          </div>

          <div style={{ background: '#FFFFFF', padding: 18, borderRadius: 16, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', fontSize: '0.82rem', fontWeight: 700, marginBottom: 8 }}>
              <span>نسبة (بدون جائزة)</span>
              <Percent size={16} color="#D97706" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#D97706' }}>
              {overview.noPrizePercentage}%
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>
              {overview.noPrizeCount} مرة حظ أوفر (حماية اقتصادية)
            </div>
          </div>

          <div style={{ background: '#FFFFFF', padding: 18, borderRadius: 16, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', fontSize: '0.82rem', fontWeight: 700, marginBottom: 8 }}>
              <span>الجوائز العالية (&gt; 500)</span>
              <Sparkles size={16} color="#DC2626" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#DC2626' }}>
              {overview.highRewardsPercentage}%
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>
              {overview.highRewardsCount} فائز بالجوائز الكبرى فقط
            </div>
          </div>
        </div>
      )}

      {/* Prizes Management Table */}
      <div style={{ background: '#FFFFFF', borderRadius: 18, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 32 }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              قائمة الجوائز والأوزان (Prizes &amp; Weights Matrix)
            </h2>
            <p style={{ color: '#64748B', fontSize: '0.8rem', margin: '3px 0 0 0' }}>
              الأوزان تحدد الاحتمالية النسبية للاختيار (Weighted Random Selection). الجائزة المعطلة أو التي استنفدت حد الفائزين تستبعد تلقائياً.
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>الترتيب</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>اسم الجائزة</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>النوع</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>القيمة</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>الوزن (Weight)</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>الفائزين / الحد</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>التكلفة / السقف</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>الحالة</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {prizes.map((prize) => {
                const isCappedWinners = prize.max_winners != null && prize.current_winners >= prize.max_winners;
                const isCappedBudget = prize.max_total_cost != null && prize.current_total_cost >= prize.max_total_cost;

                return (
                  <tr key={prize.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#64748B' }}>
                      {prize.display_order}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            background: prize.color || '#D97706',
                            display: 'inline-block'
                          }}
                        />
                        <div>
                          <strong style={{ color: '#0F172A', display: 'block' }}>{prize.name}</strong>
                          {prize.description && (
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{prize.description}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        background: prize.type === 'NO_PRIZE' ? '#F1F5F9' : '#ECFDF5',
                        color: prize.type === 'NO_PRIZE' ? '#475569' : '#059669',
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}>
                        {prize.type}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 800, color: '#0F172A' }}>
                      {prize.type === 'DISCOUNT_PERCENT' ? `${prize.value}%` : `${prize.value.toLocaleString()} ج.س`}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontWeight: 800, color: '#D97706' }}>{prize.weight}</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ color: isCappedWinners ? '#DC2626' : '#0F172A', fontWeight: isCappedWinners ? 800 : 500 }}>
                        {prize.current_winners} {prize.max_winners ? `/ ${prize.max_winners}` : '(بلا سقف)'}
                      </span>
                      {isCappedWinners && (
                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#DC2626' }}>وصل الحد الأقصى ⚠️</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ color: isCappedBudget ? '#DC2626' : '#0F172A' }}>
                        {prize.current_total_cost.toLocaleString()} {prize.max_total_cost ? `/ ${prize.max_total_cost.toLocaleString()} ج.س` : ''}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <button
                        type="button"
                        onClick={() => handleToggle(prize.id)}
                        style={{
                          background: prize.is_active ? '#DCFCE7' : '#FEE2E2',
                          color: prize.is_active ? '#166534' : '#991B1B',
                          border: 'none',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {prize.is_active ? 'نشط' : 'معطل'}
                      </button>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenEdit(prize)}
                          style={{ padding: '4px 8px' }}
                          title="تعديل الجائزة"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleDelete(prize.id, prize.name)}
                          style={{ padding: '4px 8px', color: '#DC2626' }}
                          title="حذف / تعطيل"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Live Spins Log */}
      {stats?.recentSpins && stats.recentSpins.length > 0 && (
        <div style={{ background: '#FFFFFF', borderRadius: 18, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid #E2E8F0' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              سجل السحوبات المباشرة (Live Spins Audit Log)
            </h2>
            <p style={{ color: '#64748B', fontSize: '0.8rem', margin: '3px 0 0 0' }}>
              آخر 50 عملية سحب مع تفاصيل المستخدم والجوائز وأكواد الخصم المصروفة.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>المستخدم</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>تاريخ السحب</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>الجائزة المستلمة</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>القيمة</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>كود الخصم / التفاصيل</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>الوقت الدقيق</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentSpins.map((spin) => (
                  <tr key={spin.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <strong style={{ color: '#0F172A', display: 'block' }}>{spin.user_name}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{spin.user_email}</span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#0F172A', fontWeight: 600 }}>
                      {spin.spin_date}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        background: spin.reward_type === 'NO_PRIZE' ? '#F1F5F9' : '#FEF3C7',
                        color: spin.reward_type === 'NO_PRIZE' ? '#64748B' : '#B45309',
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontWeight: 700,
                        fontSize: '0.8rem'
                      }}>
                        {spin.prize_name || spin.reward_type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#059669' }}>
                      {spin.reward_value > 0 ? `${spin.reward_value} ج.س` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {spin.reward_details?.promoCode ? (
                        <code style={{ background: '#0F172A', color: '#FBBF24', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem' }}>
                          {spin.reward_details.promoCode}
                        </code>
                      ) : (
                        <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>{spin.reward_details?.message || '—'}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748B', fontSize: '0.8rem' }}>
                      {new Date(spin.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && editingPrize && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 20,
            maxWidth: 540,
            width: '100%',
            padding: 24,
            boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: '0 0 16px 0' }}>
              {editingPrize.id ? 'تعديل بيانات الجائزة' : 'إضافة جائزة جديدة'}
            </h3>

            <form onSubmit={handleSavePrize} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  اسم الجائزة (يظهر في العجلة)
                </label>
                <input
                  type="text"
                  required
                  value={editingPrize.name || ''}
                  onChange={e => setEditingPrize({ ...editingPrize, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  placeholder="مثال: خصم 200 ج.س أو حظ أوفر"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  وصف توضيحي للعميل
                </label>
                <input
                  type="text"
                  value={editingPrize.description || ''}
                  onChange={e => setEditingPrize({ ...editingPrize, description: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  placeholder="مثال: كود خصم فوري يطبق عند إتمام الطلب"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    نوع الجائزة (Type)
                  </label>
                  <select
                    value={editingPrize.type || 'DISCOUNT_FIXED'}
                    onChange={e => setEditingPrize({ ...editingPrize, type: e.target.value as any })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  >
                    <option value="NO_PRIZE">NO_PRIZE (بدون جائزة)</option>
                    <option value="DISCOUNT_FIXED">DISCOUNT_FIXED (خصم بمبلغ ثابت SDG)</option>
                    <option value="DISCOUNT_PERCENT">DISCOUNT_PERCENT (خصم نسبة مئوية %)</option>
                    <option value="WALLET_CREDIT">WALLET_CREDIT (إيداع مباشر بالمحفظة)</option>
                    <option value="FREE_ATTEMPT">FREE_ATTEMPT (محاولة مجانية)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    القيمة (Value)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editingPrize.value ?? 0}
                    onChange={e => setEditingPrize({ ...editingPrize, value: Number(e.target.value) })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    الوزن النسبي (Weight)
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editingPrize.weight ?? 100}
                    onChange={e => setEditingPrize({ ...editingPrize, weight: Number(e.target.value) })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>كلما زاد الوزن زادت نسبة الفوز</span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    لون شريحة العجلة
                  </label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={editingPrize.color || '#F59E0B'}
                      onChange={e => setEditingPrize({ ...editingPrize, color: e.target.value })}
                      style={{ width: 44, height: 42, padding: 0, borderRadius: 8, border: '1px solid #CBD5E1', cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      value={editingPrize.color || '#F59E0B'}
                      onChange={e => setEditingPrize({ ...editingPrize, color: e.target.value })}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    أقصى عدد فائزين (اختياري)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="بدون سقف"
                    value={editingPrize.max_winners ?? ''}
                    onChange={e => setEditingPrize({ ...editingPrize, max_winners: e.target.value ? Number(e.target.value) : null })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    أقصى ميزانية تكلفة ج.س (اختياري)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="بدون سقف"
                    value={editingPrize.max_total_cost ?? ''}
                    onChange={e => setEditingPrize({ ...editingPrize, max_total_cost: e.target.value ? Number(e.target.value) : null })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalOpen(false)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ background: '#D97706', borderColor: '#D97706' }}
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ الجائزة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminWheel;
