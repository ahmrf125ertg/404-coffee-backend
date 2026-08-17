# 404 Coffee Backend

نظام إدارة كافيه متكامل — Backend بـ Node.js + Express 5 + Prisma 7 + **SQLite (WAL)** + **RBAC**.

## المتطلبات

- Node.js 22.5+ (بيستخدم `node:sqlite` المدمج)
- npm

## التشغيل السريع

```bash
npm install
cp .env.example .env        # عدّل JWT_SECRET
npm run db:reset            # يبني dev.db + migrations + seed (Admin/root123)
npm run dev                 # http://localhost:5000
```

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | تشغيل بـ nodemon |
| `npm start` | تشغيل الإنتاج |
| `npm test` | كل الاختبارات (node:test + supertest — قاعدة منفصلة) |
| `npm run db:reset` | ⚠️ إعادة بناء الداتابيز من الصفر (يمسح البيانات) |
| `npm run db:seed` | زرع البيانات الافتراضية فقط |
| `npm run prisma:studio` | فحص الداتابيز في المتصفح |
| `npm run prisma:migrate` | migration جديدة |

## نقاط الوصول

- API: `http://localhost:5000/api/...`
- **Swagger UI**: `http://localhost:5000/api/docs`
- **Health**: `http://localhost:5000/api/health`

## التوثيق

- [دليل API الكامل](docs/API.md)
- [اختبار كل الـ endpoints بـ curl بالترتيب](docs/CURL_GUIDE.md)
- [ملخص التحقق الشامل بالـ endpoints (English)](docs/VERIFICATION_REPORT.md)
- [المراجعة التقنية](docs/SENIOR_REVIEW.md) (من الجولة السابقة — أرشيفي)

## بنية المشروع

```
src/
├── app.js                     # Express app (security → logging → routes → errors)
├── server.js                  # نقطة التشغيل
├── config/
│   ├── env.js
│   └── roles.config.js       # RBAC: الأدوار + الصفحات + الـ actions
├── lib/
│   ├── prisma.js             # Prisma + adapter SQLite (better-sqlite3) + تفعيل WAL
│   └── logger.js             # pino
├── middlewares/
│   ├── auth.middleware.js    # JWT + إعادة التحقق من الحالة/الدور من الداتابيز
│   ├── permission.middleware.js  # requirePermission(page, action?)
│   └── error.middleware.js   # pino + إخفاء التفاصيل في production
├── utils/
│   ├── audit.js
│   └── pagination.js         # parsePagination (page/pageSize)
├── docs/
│   └── swagger.js            # OpenAPI 3.0 كامل
└── modules/                  # 19 موديول — كل واحد (routes + controller + service)
    ├── auth / users / backup / sales / purchases / orders / returns /
    ├── customers / suppliers / delegates / raw-materials / products /
    ├── cash-drawer-shifts / financial-reports / dashboard /
    ├── audit-logs / settings / warnings / chat
```

## أهم الممارسات

- **SOLID بمعنى عملي**: routes → controllers → services، من غير طبقات زايدة.
- كل العمليات المالية جوه `prisma.$transaction`.
- كل الفلوس `Decimal` (حتى `ProductAddon.price`).
- `mode: insensitive` مينفعش على SQLite — الاستخدام المشروع (ليستة عربية/انجليزية) بيشتغل مع `contains` (LIKE غير حساس لـ ASCII).
- قاعدة الاختبارات (`prisma/test.db`) منفصلة تمامًا عن `dev.db`، وبتتبنى تلقائيًا قبل الاختبارات.