# KIROPRO Backend

هذا هو الـ Backend الخاص بمشروع KIROPRO، مبني باستخدام **Node.js** و **Express** و **TypeScript** ومزود بقاعدة بيانات **SQLite**.

## 🚀 تثبيت وتشغيل الـ Backend

### 1. تثبيت الحزم (Install Dependencies)

تأكد من أنك داخل مجلد `server/`، ثم نفذ أمر التثبيت:

```bash
cd server
npm install
```

### 2. إعداد متغيرات البيئة (Environment Variables)

الـ Backend يقرأ إعداداته من ملف `.env`. لا تقم بوضع أسرار حقيقية في الكود المصدري.
انسخ ملف `.env.example` (إن وجد) أو قم بإنشاء ملف `.env` جديد داخل مجلد `server/`:

```env
PORT=5000
JWT_SECRET=your_secure_random_jwt_secret_min_32_chars
```

### 3. تشغيل في بيئة التطوير (Development)

لتشغيل السيرفر مع ميزة التحديث التلقائي (Hot Reload) أثناء التطوير، استخدم:

```bash
npm run dev
```

هذا الأمر سيقوم بتشغيل `nodemon` و `tsc` في الخلفية ويعمل السيرفر على `http://localhost:5000`.

### 4. تشغيل الإنتاج (Production)

عند رفع المشروع إلى السيرفر الفعلي، قم ببناء المشروع ثم تشغيله كالتالي:

```bash
npm run build
npm start
```

---

## 🗄️ قاعدة البيانات و Seed

يستخدم المشروع **SQLite** عبر مكتبة `better-sqlite3`. 
قاعدة البيانات سيتم إنشاؤها تلقائياً كملف `kiropro.db` في مجلد `server/` عند أول تشغيل للسيرفر.

### إنشاء حساب الأدمن (Admin Seed)
لإنشاء حساب مسؤول جديد، استخدم السكربت التفاعلي الآمن الذي يطلب البيانات مباشرة من الطرفية دون حفظ كلمات مرور في الكود:

```bash
npm run seed:admin
```
سيطلب السكربت إدخال البريد الإلكتروني وكلمة المرور يدوياً ويقوم بتشفيرها بأمان.

---

## 🩺 اختبار الـ Backend (Health Check)

للتأكد من أن الـ Backend يعمل بشكل صحيح وأنه جاهز لاستقبال الطلبات، قمنا بإنشاء Endpoint مخصص.

يمكنك اختباره عبر المتصفح أو عبر Terminal:

```bash
curl http://localhost:5000/api/health
```

النتيجة المتوقعة:
```json
{
  "status": "ok",
  "service": "kiropro-backend"
}
```
