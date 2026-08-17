# 404 Coffee — ملخص المشروع والحالة الحالية

> آخر تحديث: 16 أغسطس 2026 (v2.0)

---

## 1) نظرة عامة

- **نظام إدارة كافيه** بواجهة عربية RTL.
- **Backend**: Node.js + Express 5 + Prisma 7 + **SQLite (WAL)** — مفيش server قاعدة بيانات خارجي.
- **Frontend**: React + Vite SPA منشور على https://404-project-2.vercel.app/ — **لسه prototype**.
- **الصلاحيات**: RBAC — `OWNER / MANAGER / CASHIER / DELEGATE`.
- **البنية**: `routes → controllers → services → prisma` + ميدلوير واحد `requirePermission(page, action?)`.

---

## 2) نسخة 2.0 — اللي اتغير (أغسطس 2026)

### قاعدة البيانات: PostgreSQL → SQLite (WAL) ✅
- `prisma/schema.prisma`: `provider = sqlite` + حذف كل `@db.Decimal(12,2)`.
- الاتصال: `@prisma/adapter-better-sqlite3` (Node 22.5+ بيستخدم `node:sqlite`).
- تفعيل WAL تلقائيًا من `src/lib/prisma.js` (`PRAGMA journal_mode=WAL` + `busy_timeout`).
- الـ migrations اتدمجت في ملف واحد: `20260816170101_init`.
- إصلاح `mode: insensitive` في `sale.service.js` (غير مدعوم على SQLite).

### الصلاحيات: تفصيلية → RBAC بالدور ✅
- حذف `UserPagePermission` + `UserActionPermission` نهائيًا.
- `User.role` (OWNER/MANAGER/CASHIER/DELEGATE) + `src/config/roles.config.js`.
- استبدال middleware الثلاثة بميدلوير واحد: `requirePermission(page, action?)`.
- حذف موديول الفوضى القديمة والـ seed القديم.
- حمايات ملكية: ممنوع حذف/تعليق آخر OWNER، ممنوع تغيير دورك لنفسك، فقط OWNER يعمل OWNER.
- الصلاحيات الفعلية (ملموسة): `GET /api/users/:id/permissions`.

### ميزات جديدة ✅
- **Backup**: `GET /api/backup/download` (OWNER فقط) — نسخة SQLite متسقة.
- **Pagination** على كل القوائم: `page` + `pageSize` (أقصى 100) → `pagination`.
- **Swagger UI**: `GET /api/docs` + `GET /api/docs.json`.
- **Rate limiting سخي**: عام 600/15د، login 60/15د، chat 30/15د لكل IP.
- **Logger**: pino + pino-http؛ error middleware يخفي التفاصيل الخام في production.
- **أمان**: helmet.

### إصلاحات سلوكية هذه الجولة ✅
- `DELETE /api/sales/:id` أصبح **soft-cancel** (status → `CANCELLED`) بدل الحذف الفعلي + إرجاع المخزون — سجل مالي محفوظ.
- حذف مشروع: مسموح لـ `DRAFT` و `CANCELLED` (بس الإصلاح مش `APPROVED`).

### اختبارات ✅
- `npm test` — **61 اختبار** (node:test + supertest) على قاعدة منفصلة `prisma/test.db`.
- تغطية: auth، RBAC، users (حمايات الـ Owner)، catalog، المبيعات (حسابات الفلوس + خصم المخزون + الإلغاء)، مشتريات (Draft→Approve)، مرتجعات، طلبات، ورديات، تقارير، warnings، audit، settings، backup، pagination.

---

## 3) الموديولز الحالية (مكتملة CRUD + صلاحيات)

| الموديول | المسار | الحالة |
|---|---|---|
| Auth / Users | `/api/auth`, `/api/users` | ✅ مكتمل (RBAC + حمايات Owner) |
| Backup | `/api/backup` | ✅ مكتمل (OWNER فقط) |
| Raw Materials + Batches | `/api/raw-materials` | ✅ مكتمل + pagination |
| Products (Types/Sizes/Addons/Ingredients) | `/api/products` | ✅ مكتمل (كل الفلوس Decimal) |
| Customers | `/api/customers` | ✅ مكتمل |
| Suppliers | `/api/suppliers` | ✅ مكتمل |
| Purchases (Draft/Approve/Cancel) | `/api/purchases` | ✅ مكتمل (approve يضيف للمخزون) |
| Sales | `/api/sales` | ✅ مكتمل (يخصم من المخزون + soft-cancel + بحث/فلترة/pagination) |
| Orders (Dine-in/Takeaway/Online) | `/api/orders` | ✅ مكتمل |
| Returns | `/api/returns` | ✅ مكتمل |
| Delegates | `/api/delegates` | ✅ مكتمل |
| Cash Drawer / Shifts | `/api/cash-drawer-shifts` | ✅ مكتمل |
| Financial Reports | `/api/financial-reports` | ✅ مكتمل |
| Audit Log | `/api/audit-logs` | ✅ مكتمل + pagination |
| Settings | `/api/settings` | ✅ مكتمل |
| Warnings | `/api/warnings` | ✅ مكتمل |
| Dashboard | `/api/dashboard` | ✅ مكتمل |
| AI Chat (OpenAI) | `/api/chat` | ✅ موجود (خلف rate limit) — محتاج `OPENAI_API_KEY` |

---

## 4) أفكار للجولة الجاية (مقترحات)

- ربط الفرونت الفعلي بالـ backend الحالي (الفرونت لسه prototype — ده أكبر شغل متبقي).
- زود الـ tests حسب الحاجة بعد أي ميزة جديدة.
- اضبط `OPENAI_API_KEY` في `.env` إذا هتفعّل البوت.

## 5) تشغيل سريع

```bash
npm install
cp .env.example .env
npm run db:reset
npm run dev
# Swagger UI → http://localhost:5000/api/docs
```

- Admin افتراضي: `Admin` / `root123`