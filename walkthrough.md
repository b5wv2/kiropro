# KIROPRO — Multi-Currency Architecture, Customer Wallet, Cashback & Promo Credit Engine

تم بحمد الله الانتهاء من تصميم وتطبيق نظام العملات المتعددة (`USD` و `SDG`)، محفظة العملاء المالية الدقيقة، محرك استرداد الكاش باك التلقائي (Cashback Rewards)، ومحرك الأرصدة الترويجية (Promo Credit) لمتجر **KIROPRO** بالكامل.

---

## 1. التغييرات والإضافات الأساسية (Key Architectural Changes)

### قاعدة البيانات وهيكل الجداول (Migration 011)
- **`User`**: إضافة عمود `preferred_currency` (`USD` أو `SDG`) مع قيد التحقق الصارم `chk_user_preferred_currency`.
- **`Wallet`**: ربط كل محفظة بعملتها (`USD` أو `SDG`) ومزامنتها مع تفضيل حساب المستخدم.
- **`WalletTransaction`**: إضافة أعمدة التدقيق المالي الكامل: `currency`, `source_amount_usd`, `exchange_rate`, `balanceBefore`, `balanceAfter`, `referenceType`, `referenceId`, `createdBy`.
- **`Order`**: حفظ السعر التاريخي الموثوق وسعر الصرف المجمد وقت الشراء: `customerPriceUsd`, `chargedAmount`, `chargedCurrency`, `exchangeRateUsed`, `cashbackAmount`.
- **`promo_codes`**: دعم أكواد `WALLET_CREDIT` بعملات محددة (`USD` أو `SDG`) مع التحويل التلقائي الآمن بناءً على عملة محفظة المستخدم.
- **`topup_requests`**: دعم إيداع بالدولار أو الجنيه السوداني مع تجميد سعر الصرف `requested_currency`, `requested_amount`.
- **`cashback_rules`**: جدول لقواعد الكاش باك المرنة (نسبة مئوية، حد أدنى للطلب، حد أقصى للمستخدم، سقف مالي، نطاق التطبيق لكل المنتجات أو تصنيف أو منتجات محددة، تفعيل التراكم مع الكوبونات).
- **`cashback_redemptions`**: جدول تسليم الكاش باك مع قيد عدم التكرار الصارم `UNIQUE (order_id)` لضمان مبدأ الـ Idempotency وعدم مضاعفة المكافأة.

---

## 2. السيرفر والمنطق البرمجي (Backend Services & APIs)

| المسار / الخدمة | الوظيفة والتنفيذ |
|---|---|
| [`server/src/routes/auth.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/routes/auth.ts) | استقبال واختيار عملة الحساب (`USD`/`SDG`) أثناء التسجيل وقفل تغييرها إذا كان في المحفظة رصيد أو حركات مالية قائمة. |
| [`server/src/services/cashbackService.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/services/cashbackService.ts) | تقييم وتوزيع الكاش باك تلقائياً عند وصول الطلب لحالة `COMPLETED`، وعكس الرصيد تلقائياً في حال الاسترجاع `REFUNDED` مع قفل الصفوف في قاعدة البيانات `FOR UPDATE`. |
| [`server/src/services/orderPollingService.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/services/orderPollingService.ts) | ربط خدمة مراقبة طلبات المزود GamesDrop لتشغيل توزيع الكاش باك بمجرد إتمام الطلب بنجاح. |
| [`server/src/routes/orders.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/routes/orders.ts) | اعتماد التسعير السيادي من قاعدة البيانات بالدولار والخصم من محفظة العميل بعملتها (`USD` أو `SDG`) وحفظ سعر الصرف المجمد في الطلب. إرسال الشراء لـ GamesDrop بالدولار دائماً. |
| [`server/src/routes/promo.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/routes/promo.ts) | شحن المحفظة عبر كروت الرصيد `WALLET_CREDIT` بعملة الكوبون مع تحويل العملة بسعر الصرف الحالي عند الحاجة. |
| [`server/src/routes/wallet.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/routes/wallet.ts) | استعلام رصيد المحفظة وعملتها وسعر الصرف المحدث ديناميكياً من `platform_settings`. |
| [`server/src/routes/cashback.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/routes/cashback.ts) | مسارات CRUD للوحة التحكم لإدارة قواعد الكاش باك ومسار كشف كاش باك العميل `/api/cashback/my-summary`. |

---

## 3. الواجهة الأمامية وتجربة المستخدم (Frontend UI & UX)

1. **شاشة تسجيل الحساب ([`src/pages/Auth/RegisterPage.tsx`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/src/pages/Auth/RegisterPage.tsx))**:
   - إضافة محدد بصري تفاعلي لعملة الحساب (`USD — الدولار الأمريكي` أو `SDG — الجنيه السوداني`) مع توضيح أن جميع المنتجات ستعرض وتخصم بالعملة المختارة.
2. **سياق المحفظة والتنسيق المالي ([`src/context/WalletContext.tsx`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/src/context/WalletContext.tsx) & [`src/lib/formatters.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/src/lib/formatters.ts))**:
   - دعم التنسيق الدقيق: `$1.20` للدولار و `6,000 ج.س` للجنيه السوداني، وتحديث الأسعار وسعر الصرف تلقائياً.
3. **نوافذ الإيداع والشحن السريع ([`src/components/Modal/DepositModal.tsx`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/src/components/Modal/DepositModal.tsx) & [`QuickTopUpModal.tsx`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/src/components/Modal/QuickTopUpModal.tsx))**:
   - تخصيص مبالغ الشحن مسبقة التحديد (Presets) بحسب العملة (25k, 50k, 100k, 250k, 500k SDG للجنيه، و $5, $10, $20, $50, $100 للدولار).
   - توضيح المبالغ المحولة وسعر الصرف اللحظي ووسائل الدفع المناسبة للعملة.
4. **لوحة حساب العميل ([`src/pages/Account/AccountPage.tsx`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/src/pages/Account/AccountPage.tsx))**:
   - عرض شارة الكاش باك التراكمي المكتسب في رأس الصفحة (Header Badge).
   - عرض وسم الكاش باك الأخضر `+X ج.س / +$X كاش باك` في بطاقات الطلبات المكتملة.
   - تبويب جديد لكشف الحساب وحركات المحفظة بالتفصيل مع عرض الأرصدة قبل وبعد كل حركة.
   - تبويب جديد لسجل الكاش باك المكتسب وتفاصيل القواعد المطبقة.
5. **لوحة تحكم الأدمن ([`src/pages/Admin/AdminCashback.tsx`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/src/pages/Admin/AdminCashback.tsx), [`AdminPromoCodes.tsx`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/src/pages/Admin/AdminPromoCodes.tsx), [`AdminOrders.tsx`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/src/pages/Admin/AdminOrders.tsx))**:
   - شاشة كاملة لإدارة قواعد الكاش باك (إنشاء، تعديل، إيقاف، وحذف) وسجل عمليات صرف الكاش باك.
   - اختيار عملة كود الرصيد الترويجي (`USD` أو `SDG`).
   - كارت التحليل المالي في تفاصيل الطلب يوضح: المبلغ المخصوم من العميل، سعر البيع بالدولار، سعر الصرف المعتمد، خصم الكوبون، الكاش باك الممنوح، تكلفة المزود GamesDrop، وصافي الربح.

---

## 4. الفحص والتحقق (Verification Results)

- **فحص TypeScript للفرونت إند (`npx tsc --noEmit`)**: نجاح تام بنسبة 100% مع **0 أخطاء**.
- **فحص TypeScript للباك إند (`server/npx tsc --noEmit`)**: نجاح تام بنسبة 100% مع **0 أخطاء**.
- **فحص جداول قاعدة البيانات والقيود**:
  - جداول `cashback_rules` و `cashback_redemptions` مفهرسة ومربوطة بنجاح.
  - قيود الأعمدة على `User.preferred_currency`, `Wallet.currency`, `Order` أصبحت نشطة ومتحقق منها.
- **فحص سعر الصرف اللحظي**:
  - `GET http://localhost:5000/api/wallet/rate` يعيد بنجاح `exchangeRate: 7200` مباشرة من إعدادات المنصة `platform_settings`.
- **فحص خادم الواجهة الأمامية**:
  - استجابة `200 OK` على المنفذ `5173`.
