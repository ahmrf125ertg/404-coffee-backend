# 404 Coffee Backend

نظام إدارة كافيه متكامل — Backend بـ Node.js + Express 5 + Prisma 7 + **PostgreSQL** + **RBAC** + **WebSocket**.

## المتطلبات

- Node.js 22.5+
- PostgreSQL 14+
- npm

## التشغيل السريع

```bash
npm install
cp .env.example .env        # عدّل DATABASE_URL + JWT_SECRET
npx prisma migrate deploy   # يطبّق الـ migrations
npx prisma db seed          # يزرع البيانات الافتراضية (Admin/root123)
npm run dev                 # http://localhost:5000
```

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | تشغيل بـ nodemon |
| `npm start` | تشغيل الإنتاج |
| `npm test` | كل الاختبارات (node:test + supertest — SQLite منفصلة) |
| `npx prisma migrate deploy` | تطبيق migrations |
| `npx prisma db seed` | زرع البيانات الافتراضية |
| `npx prisma studio` | فحص الداتابيز في المتصفح |
| `npx prisma generate` | إعادة توليد Prisma Client |

## نقاط الوصول

- API: `http://localhost:5000/api/...`
- **Swagger UI**: `http://localhost:5000/api/docs`
- **Health**: `http://localhost:5000/api/health`
- **WebSocket**: `ws://localhost:5000` (Socket.IO)

## التوثيق

- [دليل API الكامل](docs/API.md)
- [اختبار كل الـ endpoints بـ curl بالترتيب](docs/CURL_GUIDE.md)
- [ملخص التحقق الشامل](docs/VERIFICATION_REPORT.md)
- [Reconciliation كامل](FINAL_API_RECONCILIATION.md)
- [تقرير التسليم النهائي](FINAL_HANDOVER_REPORT.md)
- [دليل النشر على Render](RENDER_DEPLOYMENT_GUIDE.md)

## بنية المشروع

```
src/
├── app.js                     # Express app (security → logging → routes → errors)
├── server.js                  # نقطة التشغيل
├── config/
│   ├── env.js                 # Environment variables + JWT config
│   └── roles.config.js        # RBAC: الأدوار + الصفحات + الـ actions
├── lib/
│   ├── prisma.js              # Prisma + PostgreSQL adapter
│   └── logger.js              # pino
├── middlewares/
│   ├── auth.middleware.js     # JWT (HS256) + إعادة التحقق من الحالة/الدور
│   ├── permission.middleware.js # requirePermission(page, action?)
│   └── error.middleware.js    # Production error sanitization
├── websocket/
│   ├── socket.server.js       # Socket.IO server
│   └── socket.auth.js         # WebSocket JWT authentication
├── utils/
│   ├── audit.js
│   └── pagination.js          # parsePagination (page/pageSize)
├── docs/
│   └── swagger.js             # OpenAPI 3.0 كامل
└── modules/                   # 22 موديول — كل واحد (routes + controller + service)
    ├── auth / users / sales / purchases / orders / returns /
    ├── customers / suppliers / delegates / raw-materials / products /
    ├── cash-drawer-shifts / financial-reports / dashboard /
    ├── audit-logs / settings / warnings / chat / reviews /
    ├── attendance / devices / table-sessions / backup
```

## Prisma Models (30)

User, RawMaterial, RawMaterialBatch, Product, ProductType, ProductTypeIngredient,
ProductSize, ProductSizeIngredient, ProductAddon, ProductCategory, Customer,
Supplier, Purchase, PurchaseItem, Sale, SaleItem, Order, OrderItem, Return,
ReturnItem, Delegate, CashDrawerShift, CashDrawerTransaction, AuditLog,
Review, Setting, Attendance, EmployeeDevice, OrderEvent, UserPageAccess

## أهم الممارسات

- **SOLID بمعنى عملي**: routes → controllers → services، من غير طبقات زايدة.
- كل العمليات المالية جوه `prisma.$transaction`.
- كل الفلوس `Decimal` (حتى `ProductAddon.price`).
- **JWT Dual-token**: Access (1h) + Refresh (7d) مع HS256.
- **FIFO Inventory**: خصم المخزون بالترتيب (أقدم دفعة أولاً).
- **Order State Machine**: PENDING → PREPARING → READY → COMPLETED مع optimistic locking.
- **RBAC**: صفحات + أذونات + أدور (OWNER, MANAGER, CASHIER, DELEGATE).
- قاعدة الاختبارات (`prisma/test.db`) منفصلة تمامًا عن PostgreSQL.
