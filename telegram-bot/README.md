# KIROPRO USDT Telegram Bot (Standalone Service)

هذا هو خادم بوت تيليجرام المستقل لإدارة وإشعارات خدمة **USDT Instant Transfer** الخاصة بمنصة **KIROPRO**.
تم تصميم البوت ليعمل كـ Microservice مستقل تماماً وقابل للاستضافة على أي خادم أو VPS خارجي منفصل عن الـ Backend.

---

## الميزات الرئيسية
1. **تنبيه فوري لطلبات USDT:** إرسال إشعار فوري عند إنشاء أي طلب جديد بحالة `AWAITING_TRANSFER`.
2. **تذكيرات كل 10 ثوانٍ:** تذكير ذكي دوري كل 10 ثوانٍ طالما أن الطلب في انتظار التحويل.
3. **أزرار تفاعلية فورية:**
   - `[✅ تم التحويل]`
   - `[❌ إلغاء الطلب]`
4. **تأكيد قبل التنفيذ:** رسالة تأكيد صريحة قبل الإتمام لمنع أي ضغط خاطئ.
5. **تحديث السجلات وإيقاف التذكيرات:** بمجرد التأكيد، يتم إيقاف جميع التذكيرات فوراً وإشعار العميل وإرسال البريد الإلكتروني.
6. **اتصال مشفر وآمن:** يتواصل البوت مع سيرفر KIROPRO عبر Header المصادقة السري `X-Bot-Secret`.

---

## متطلبات التشغيل
- Node.js (v18+)
- رمز توكن البوت من [@BotFather](https://t.me/botfather).
- معرف محادثة التيليجرام للأدمن أو القروب (`ADMIN_TELEGRAM_CHAT_ID`).

---

## خطوات التثبيت والتشغيل

### 1. تثبيت الحزم
```bash
cd telegram-bot
npm install
```

### 2. إعداد ملف البيئة
انسخ ملف `.env.example` إلى `.env`:
```bash
cp .env.example .env
```
وقم بملء البيانات:
```env
BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
ADMIN_TELEGRAM_CHAT_ID=-1001234567890
KIROPRO_BACKEND_URL=https://api.kiropro.store
BOT_API_SECRET=your_secure_random_bot_api_secret_token_here
REMINDER_INTERVAL_MS=10000
```

### 3. تشغيل البوت في بيئة التطوير
```bash
npm run dev
```

### 4. بناء وتشغيل البوت في الإنتاج (Production / PM2 / Docker)
```bash
npm run build
npm start
```
أو عبر PM2:
```bash
pm2 start dist/index.js --name kiropro-telegram-bot
```
