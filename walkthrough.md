# KIROPRO — نظام الأمان ومراقبة المستخدمين والحظر المتقدم (User Security & Monitoring System)

تم بحمد الله الانتهاء من تصميم وتطبيق **نظام أمان ومراقبة مستخدمين متكامل** داخل **KIROPRO**، مبني على أسس هندسية وأمنية صارمة تراعي أعلى معايير الخصوصية وحماية البيانات دون الاعتماد على مجرد زر حظر بسيط أو تقنيات تطفلية غير مشروعة.

---

## 1. البنية التحتية وقاعدة البيانات (Database Architecture - Migration 020)

تم إنشاء وتفعيل الهجرة البرمجية رقم 020 [`server/migrations/020_user_security_system.sql`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/migrations/020_user_security_system.sql) متضمنة الجداول الثلاثية المتكاملة و 23 مؤشر أداء (Indexes):

### 1. جدول جلسات المستخدمين (`user_sessions`)
- **المعرفات والربط**: `id` (UUID), `user_id` (FK إلى `User`), `session_token_hash` (تجزئة SHA-256 للرمز), `device_id` (معرف جهاز KIROPRO المشفر `dvc_...`).
- **بيانات العميل والشبكة**: `ip_address` (مع دعم كامل لخوادم الوكيل Cloudflare / Railway), `user_agent`, `browser`, `os`, `device_type` (Desktop / Mobile / Tablet), `client_timezone`, `client_language`.
- **حالة الجلسة والنشاط**: `is_active` (boolean), `revoked_at`, `revoked_reason` (`USER_LOGOUT`, `ADMIN_REVOKE`, `SECURITY_BAN`, `PASSWORD_CHANGED`, `PASSWORD_RESET`, `SYSTEM_CLEANUP`), `last_activity_at`, `created_at`, `expires_at`.

### 2. جدول الأحداث الأمنية (`security_events`)
- **التصنيف**: `id`, `user_id`, `session_id`, `event_type` (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `REGISTER`, `LOGOUT`, `PASSWORD_CHANGED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `BAN_APPLIED`, `BAN_REVOKED`, `SESSION_REVOKED`, `SUSPICIOUS_ACTIVITY`).
- **المستوى والحالة**: `severity` (`INFO`, `WARNING`, `CRITICAL`), `status` (`SUCCESS`, `FAILURE`, `BLOCKED`).
- **البيانات التفصيلية**: `ip_address`, `device_id`, `user_agent`, `metadata` (JSONB مفحوص ومطهر من أي كلمات مرور أو رموز OTP أو مفاتيح سرية)، `created_at`.

### 3. جدول الحظر المتقدم ومتعدد النطاقات (`user_bans`)
- **النطاقات المتعددة**: `scope` (`ACCOUNT`, `IP`, `DEVICE`, `ACCOUNT_IP`, `ACCOUNT_DEVICE`, `ACCOUNT_IP_DEVICE`).
- **المعايير المربوطة**: `user_id`, `ip_address`, `device_id`.
- **المدة والنوع**: `is_permanent` (boolean), `expires_at` (تاريخ انتهاء الصلاحية للحظر المؤقت مع انتهاء صلاحية تلقائي بالكامل دون الحاجة لتدخل يدوي).
- **التدقيق الإداري**: `reason` (سبب الحظر), `admin_notes` (ملاحظات الأدمن الداخلية), `banned_by` (الأدمن المسؤول), `is_active`, `revoked_at`, `revoked_by`, `revoke_reason`.

---

## 2. المنطق البرمجي والخدمات الخلفية (Backend Services)

| الخدمة | الملف | الوظيفة والخصائص الأمنية |
|---|---|---|
| **خدمة معلومات العميل** | [`clientInfoService.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/services/clientInfoService.ts) | - استخراج عنوان الـ IP الحقيقي بأمان من خلف خوادم البروكسي (`cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`).<br>- توليد وإدارة معرف الجهاز المشفر `kiro_dvc` باستخدام `crypto.randomBytes(32)` في كوكي Secure HttpOnly لمدة 365 يوماً.<br>- استخراج نوع الجهاز والمتصفح والنظام التشغيلي بأمان دون أي بصمة تطفلية (No Canvas Fingerprinting, No Hardware UUID).<br>- إخفاء مقنع لمعرف الجهاز في العرض `maskDeviceId` (مثال: `dvc_8f2...91a`). |
| **خدمة الجلسات** | [`sessionService.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/services/sessionService.ts) | - إنشاء الجلسة وربط الـ `sessionId` مع الـ JWT الصادر.<br>- فحص الجلسة والتحقق من كونها نشطة مع كل طلب.<br>- تحديث وقت آخر نشاط للجلسة `touchSession` بمعدل مقنن (Throttle كل 5 دقائق) لتفادي الحمل على قاعدة البيانات.<br>- إبطال فوري للجلسات الفردية أو جميع جلسات المستخدم عند الحظر أو تغيير كلمة المرور. |
| **خدمة الحظر المتقدم** | [`banService.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/services/banService.ts) | - فحص نطاقات الحظر (`checkBan`): مطابقة الحساب، عنوان IP، ومعرف الجهاز.<br>- انتهاء الصلاحية التلقائي `expireOverdueBans` لرفع الحظر المؤقت المنتهي تلقائياً.<br>- إنشاء الحظر وإبطال جميع الجلسات النشطة للمستخدم فوراً.<br>- فك الحظر الآمن `revokeBan` الذي **لا يعيد الجلسات القديمة الملغاة إطلاقاً** (يجب على المستخدم تسجيل الدخول من جديد). |
| **خدمة سجل الأمان** | [`securityEventService.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/services/securityEventService.ts) | - تسجيل وتخزين الأحداث الأمنية مع تنظيف شامل وتطهير `sanitizeMetadata` لأي حقول حساسة (كلمات مرور، رموز تحقق OTP، توكنات JWT، بطاقات بنكية).<br>- استعلامات متقدمة مفلترة للأدمن مع ترقيم صفحات مرن (Pagination). |

---

## 3. طبقات الحماية والوسائط (Middlewares & Protections)

1. **`banCheckMiddleware` ([`banCheckMiddleware.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/middlewares/banCheckMiddleware.ts))**:
   - وسيط حماية يسبق مسارات العمليات الحساسة (الطلبات، المحفظة، الإيداع، العملات الرقمية، الإحالات).
   - يفحص الحساب والـ IP ومعرف الجهاز معاً، ويعيد كود `403 Forbidden` برسالة عربية عامة وآمنة لا تكشف البنية التحتية.

2. **`authMiddleware` المحدث ([`authMiddleware.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/middlewares/authMiddleware.ts))**:
   - التحقق من الـ `sessionId` المضمن في الـ JWT ومطابقته مع جدول الجلسات الحية `user_sessions`.
   - رفض فوري بكود `401 Unauthorized` لأي جلسة تم إبطالها إدارياً أو بسبب الحظر أو تغيير كلمة المرور.
   - فحص الحظر النشط على المستخدم لمنع أي نشاط.

3. **مسارات المصادقة المحصنة ([`routes/auth.ts`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src/routes/auth.ts))**:
   - فحص الحظر قبل تسجيل الدخول ورفضه برسالة عربية آمنة: `"لا يمكن تسجيل الدخول إلى هذا الحساب."`.
   - تسجيل أحداث `LOGIN_SUCCESS`, `LOGIN_FAILED`, `REGISTER`, `LOGOUT`, `PASSWORD_CHANGED`.
   - إنشاء جلسة جديدة مع كل تسجيل دخول ناجح وإرسال كوكي `kiro_dvc` المشفرة.
   - إبطال الجلسة عند تسجيل الخروج، وإبطال كافة الجلسات عند إعادة تعيين أو تغيير كلمة المرور.

---

## 4. واجهة المستخدم ولوحة تحكم الأدمن (Frontend Admin UI)

### 1. مركز أمان المستخدم ([`UserSecurityModal.tsx`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/src/components/admin/UserSecurityModal.tsx))
نافذة تفاعلية منبثقة غنية وسريعة تفتح بضغطة زر من جدول العملاء أو بطاقة العميل وتحتوي على:
- **شريط الإحصائيات العلوي**: عدد الجلسات النشطة، إجمالي الأجهزة المسجلة، إجمالي عناوين IP، حالة الحظر الحالية مع شارة ملونة.
- **أزرار الإجراءات السريعة**:
  - `حظر المستخدم` (اختيار النطاق: حساب، جهاز، IP، أو الكل معاً + اختيار دائم أو مؤقت بساعات/أيام محددة + سبب الحظر وملاحظات الأدمن).
  - `فك الحظر` (تأكيد فك الحظر مع توضيح أن الجلسات القديمة لن تعود وعليه تسجيل الدخول مجدداً).
  - `إنهاء كل الجلسات` (تسجيل خروج فوري من جميع الأجهزة).
- **6 تبويبات تفصيلية**:
  1. **الجلسات الحالية (Sessions)**: عرض تفصيلي لكل جلسة (الجهاز، النظام، المتصفح، IP، الدولة، وقت البدء، آخر نشاط، زر إنهاء الجلسة الفردية).
  2. **سجل الدخول (Login History)**: كشف تاريخي لكل محاولات الدخول الناجحة والملغاة.
  3. **الأجهزة المرتبطة (Devices)**: استعراض الأجهزة المميزة المشفرة ومستوى موثوقيتها.
  4. **عناوين IP المستخدمة (IP Addresses)**: كشف العناوين ومرات الظهور وتاريخ آخر استخدام.
  5. **الأحداث الأمنية (Security Events)**: سجل زمني للأحداث والمخاطر ومستوى خطورتها.
  6. **سجل الحظر (Bans History)**: تاريخ قرارات الحظر وفك الحظر والأسباب والمشرف المنفذ وتاريخ الانتهاء.

### 2. جدول العملاء المحسن ([`AdminCustomers.tsx`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/src/pages/Admin/AdminCustomers.tsx))
- إضافة عمود **"حالة الأمان"** في الجدول الرئيسي: شارة خضراء `نشط (X جلسات)` أو شارة حمراء `محظور (نطاق الحظر)`.
- إضافة زر **"الأمان"** مع أيقونة الدرع في قائمة الإجراءات لكل عميل لفتح مركز الأمان بلمسة واحدة.

### 3. صفحة سجل الأمان المركزي ([`AdminSecurityAudit.tsx`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/src/pages/Admin/AdminSecurityAudit.tsx))
- شاشة مركزية متكاملة لمدير النظام لمراقبة أمن المنصة بالكامل.
- فلاتر متقدمة: البحث باسم المستخدم، البريد، الـ IP، نوع الحدث، مستوى الخطورة (`INFO`, `WARNING`, `CRITICAL`)، النطاق الزمني.
- عدادات إحصائية لأحداث اليوم والعمليات الحرجة.
- نافذة فحص البيانات الوصفية (Metadata Viewer) بتنسيق JSON منسق للأحداث الأمنية المعقدة.

### 4. القائمة الجانبية للأدمن ([`AdminSidebar.tsx`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/src/components/admin/AdminSidebar.tsx))
- تبويب جديد **"سجل الأمان" (Security Audit)** بأيقونة الدرع `ShieldCheck`.

---

## 5. نتائج الفحص والاختبارات الآلية (Verification & Test Results)

### أ. مجموعة اختبارات الأمان الآلية (Security Test Suite - 30 اختبار)
تم تشغيل الاختبار الشامل [`testSecuritySuite.js`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/scripts/testSecuritySuite.js) محققاً نسبة نجاح **100% (30 / 30)**:
```text
============================================================
      KIROPRO USER SECURITY SYSTEM TEST SUITE
============================================================
✅ [PASS] 1. Device ID has valid dvc_ prefix and format
✅ [PASS] 2. isValidDeviceId correctly validates format
✅ [PASS] 3. isValidDeviceId rejects malicious strings
✅ [PASS] 4. maskDeviceId hides middle characters
✅ [PASS] 5. parseBrowser detects Chrome correctly
✅ [PASS] 6. parseOS detects Windows correctly
✅ [PASS] 7. parseDeviceType identifies desktop
✅ [PASS] 8. extractClientIp prefers cf-connecting-ip
✅ [PASS] 9. extractClientIp parses x-forwarded-for first IP
✅ [PASS] 10. sanitizeMetadata removes password fields
✅ [PASS] 11. sanitizeMetadata removes token fields
✅ [PASS] 12. sanitizeMetadata removes otp fields
✅ [PASS] 13. sanitizeMetadata preserves safe fields
✅ [PASS] 14. createSession returns active session with ID
✅ [PASS] 15. validateSession succeeds for active session
✅ [PASS] 16. getUserSessions returns newly created session
✅ [PASS] 17. revokeSession sets session inactive and sets reason
✅ [PASS] 18. validateSession fails for revoked session
✅ [PASS] 19. revokeAllUserSessions revokes both test sessions
✅ [PASS] 20. logSecurityEvent successfully inserts record
✅ [PASS] 21. querySecurityEvents finds logged event
✅ [PASS] 22. createBan creates ACCOUNT_IP_DEVICE ban
✅ [PASS] 23. checkBan detects banned user ID
✅ [PASS] 24. checkBan detects banned IP
✅ [PASS] 25. checkBan detects banned Device ID
✅ [PASS] 26. checkBan does NOT trigger on unrelated IP/device
✅ [PASS] 27. createBan revokes all existing user sessions
✅ [PASS] 28. revokeBan removes ban active status
✅ [PASS] 29. Unbanning does NOT revive previously revoked sessions
✅ [PASS] 30. Expired temporary bans automatically do not match checkBan
============================================================
🎉 ALL 30 SECURITY TESTS PASSED PERFECTLY!
============================================================
```

### ب. اختبار صلاحيات الوصول (RBAC Test)
تم تشغيل سكربت التحقق من الصلاحيات [`testNormalUserForbidden.js`](file:///c:/Users/Ay166/OneDrive/Desktop/kiropro/server/scripts/testNormalUserForbidden.js):
```text
Customer accessing /api/admin/security/events status: 403
Customer accessing /api/admin/users/:id/ban status: 403
✅ RBAC check passed: Customers are strictly forbidden from all admin security actions (403).
```

### ج. فحص البناء البرمجي (Build Verification)
- **السيرفر الخلفي (Backend)**: `npm run build` في مجلد `server/` تم بنجاح بدون أي أخطاء (0 Errors).
- **الواجهة الأمامية (Frontend)**: `npm run build` تم بنجاح مع إنشاء حزم الإنتاج لـ Vite بنجاح تام (0 Errors).

---

## 6. الامتثال للخصوصية وعدم التتبع التطفلي (Privacy Compliance)

- **لا يتم إطلاقاً جمع أي من**:
  - MAC Address (غير متاح تقنياً وبشكل موثوق من المتصفحات).
  - IMEI أو Hardware Serial Numbers.
  - أي مكتبات فحص تطفلية مثل Canvas / WebGL fingerprinting.
- **البيانات المعتمدة للحماية حصرياً**:
  - Account ID (معرف حساب المستخدم في النظام).
  - Session ID (معرف الجلسة المشفر المربوط بالرمز).
  - KIROPRO Device ID (معرف جهاز مشفر عشوائي `dvc_...` مخزن في كوكي مشفرة).
  - IP Address (عنوان بروتوكول الإنترنت للاتصال).
  - User-Agent و لغة وتوقيت العميل المعتمدة قياسياً.
