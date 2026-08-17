# 404 Coffee Backend — API Reference (v2.0)

> آخر تحديث: 16 أغسطس 2026 — **v2.0**: SQLite WAL + RBAC + Pagination + Backup + Swagger

## معلومات أساسية

- Base URL: `http://localhost:5000`
- كل الـ endpoints (عدا `POST /api/auth/login` و `GET /api/health`) تتطلب:
  ```
  Authorization: Bearer <JWT>
  ```
- **نظام الصلاحيات (RBAC)` — كل مستخدم له `role` من 4 أدوار:

  | الدور | الصلاحيات |
  |---|---|
  | `OWNER` | كل حاجة + النسخ الاحتياطي + إدارة كل المستخدمين |
  | `MANAGER` | كل حاجة ما عدا: حذف موظف، تعديل الإعدادات، النسخ الاحتياطي |
  | `CASHIER` | المبيعات، العملاء، الطلبات، الوردية/الدرج، عرض المخزون/المنتجات/الموردين/المندوبين |
  | `DELEGATE` | الطلبات (عرض/تعديل)، المبيعات (عرض)، التنبيهات |

- الصلاحيات الفعلية لأي مستخدم (قائمة أفعال ملموسة): `GET /api/users/:id/permissions`
- **Pagination**: كل قوائم الـ list بتقبل `page` (افتراضي 1) و `pageSize` (افتراضي 20، أقصى 100) وترجع:
  ```json
  { "success": true, "data": [...], "pagination": { "page": 1, "pageSize": 20, "total": 5, "totalPages": 1 } }
  ```
- **النسخ الاحتياطي**: `GET /api/backup/download` (OWNER فقط) — ملف SQLite متسق.
- **التوثيق التفاعلي (Swagger UI)**: `GET /api/docs` (JSON خام: `/api/docs.json`).
- **Rate limiting** (حدود سخية — النظام شبه مغلق): عام 600/15 دقيقة لكل IP، login 60/15 دقيقة، chat 30/15 دقيقة.
- الاستجابة الخطأ القياسية: `{ "success": false, "message": "..." }` — في الـ production تفاصيل الأخطاء 500 مخفية.
- قاعدة البيانات: **SQLite WAL** (`prisma/dev.db`) — backup = ملف واحد متسق.

---

## Auth

### POST `/api/auth/login`
تسجيل دخول (عام — بدون توكن).

Body:
```json
{ "name": "Admin", "password": "root123" }
```

Response:
```json
{ "success": true, "message": "Login successful", "data": { "token": "<JWT>", "user": { "id": 1, "name": "Admin", "position": "OWNER", "role": "OWNER", "status": "ACTIVE" } } }
```

---

## Users — `/api/users`

| Method | Endpoint | Action | ملاحظات |
|---|---|---|---|
| GET | `/api/users` | `view_users` | قائمة + pagination |
| POST | `/api/users` | `create_user` | body: `{ name, password, position, role }` — OWNER فقط يعمل OWNER |
| PUT | `/api/users/:id` | `edit_user` | ممنوع تغيير دورك لنفسك، وممنوع إنقاص آخر OWNER |
| PATCH | `/api/users/:id/status` | `change_user_status` | `{ status: "ACTIVE" | "SUSPENDED" }` |
| GET | `/api/users/:id/permissions` | `view_users` | صلاحيات الدور الفعلية من الـ RBAC config |
| DELETE | `/api/users/:id` | `delete_user` | ممنوع حذف نفسك أو آخر OWNER |

---

## Sales — `/api/sales`

| Method | Endpoint | Action |
|---|---|---|
| GET | `/api/sales` | `view_sales_history` — فلترة `search` (اسم/هاتف)، `status`، `paymentMethod` + pagination |
| GET | `/api/sales/:id` | `view_sales_history` |
| POST | `/api/sales` | `create_invoice` — body: `{ customerId?, discount?, paymentMethod?, status?, items: [{ productId, productSizeId, quantity }] }` — يخصم من المخزون تلقائيًا |
| PUT | `/api/sales/:id` | `edit_invoice` |
| DELETE | `/api/sales/:id` | `cancel_invoice` — soft-cancel (status → CANCELLED) + إرجاع المخزون |

---

## Purchases — `/api/purchases`

| Method | Endpoint | Action | ملاحظات |
|---|---|---|---|
| GET | `/api/purchases` | `view_purchases` | paginated |
| GET | `/api/purchases/:id` | `view_purchases` | |
| POST | `/api/purchases` | `create_purchase` | body: `{ invoiceNo, supplierId, invoiceDate, discount?, items: [...] }` — تنشأ `DRAFT` |
| PUT | `/api/purchases/:id` | `edit_purchase` | |
| PATCH | `/api/purchases/:id/approve` | `approve_purchase` | DRAFT → APPROVED + يضيف دفعات للمخزون |
| PATCH | `/api/purchases/:id/cancel` | `cancel_purchase` | DRAFT فقط → CANCELLED |
| DELETE | `/api/purchases/:id` | `delete_purchase` | DRAFT أو CANCELLED فقط |

---

## Customers / Suppliers / Delegates

| Module | CRUD | ملاحظات |
|---|---|---|
| `/api/customers` | GET/POST/PUT/DELETE | `phone` فريد — 409 للمكرر |
| `/api/suppliers` | GET/POST/PUT/DELETE | |
| `/api/delegates` | GET/POST/PUT/DELETE + `PATCH /:id/status` | `status`: `AVAILABLE/UNAVAILABLE` |

كل القوائم paginated.

---

## Raw Materials (Inventory) — `/api/raw-materials`

| Method | Endpoint | Action |
|---|---|---|
| GET | `/api/raw-materials` | `view_inventory` — paginated |
| POST | `/api/raw-materials` | `create_material` — body يشمل `{ name, unit, quantity, pricePerUnit, supplier, minStockAlert, expiryDate? }` — يُنشئ دفعة أولى تلقائيًا |
| GET | `/api/raw-materials/:id/batches` | `view_inventory` |
| POST | `/api/raw-materials/:id/batches` | `add_batch` — `{ quantity, pricePerUnit, expiryDate? }` |
| PUT | `/api/raw-materials/:id` | `edit_material` |
| DELETE | `/api/raw-materials/:id` | `delete_material` |

---

## Products — `/api/products`

| Method | Endpoint |
|---|---|
| GET | `/api/products` |
| POST | `/api/products` |
| GET/POST | `/:productId/sizes` |
| POST | `/:productId/sizes/:sizeId/ingredients` |
| GET/POST | `/:productId/types` |
| PUT/DELETE | `/:productId/types/:typeId` |
| POST/DELETE | `/:productId/types/:typeId/ingredients/:rawMaterialId` |
| GET/POST | `/:productId/addons` |
| PUT/DELETE | `/:productId/addons/:addonId` |
| PUT | `/api/products/:id` |
| DELETE | `/api/products/:id` |

> كل الفلوس `Decimal` (بما فيها `ProductAddon.price` بعد الإصلاح).

---

## Returns — `/api/returns`

| Method | Endpoint | ملاحظات |
|---|---|---|
| GET | `/api/returns` | paginated |
| GET | `/api/returns/:id` | |
| POST | `/api/returns` | تنشأ `DRAFT` — body: `{ supplierId, returnNo, generalReason?, notes?, items: [{ rawMaterialId, quantity, reason? }] }` |
| PATCH | `/api/returns/:id/approve` | DRAFT → APPROVED (يرجع المخزون للمورد/يخصم) |
| PATCH | `/api/returns/:id/cancel` | DRAFT only |
| PUT | `/api/returns/:id` | DRAFT only |
| DELETE | `/api/returns/:id` | DRAFT only |

---

## Orders — `/api/orders`

| Method | Endpoint | ملاحظات |
|---|---|---|
| GET | `/api/orders` | paginated |
| GET | `/api/orders/:id` | |
| POST | `/api/orders` | body: `{ orderType, paymentMethod?, discount?, delegateId?, customerId?, phone?, notes?, items: [...] }` — `orderType`: `DINE_IN/TAKEAWAY/ONLINE` |
| PUT | `/api/orders/:id` | يشمل تحديث الحالة (`PENDING/PREPARING/READY/COMPLETED/CANCELLED`) والمندوب |
| DELETE | `/api/orders/:id` | |

---

## Cash Drawer / Shifts — `/api/cash-drawer-shifts`

| Method | Endpoint |
|---|---|
| GET | `/api/cash-drawer-shifts` (+ pagination) |
| GET | `/api/cash-drawer-shifts/current` — الوردية المفتوحة حاليًا |
| GET | `/api/cash-drawer-shifts/:id` |
| POST | `/api/cash-drawer-shifts` — `{ openingBalance }` — وردية واحدة مفتوحة فقط |
| POST | `/api/cash-drawer-shifts/:id/close` — `{ closingBalance, actualBalance, difference?, notes? }` |
| POST | `/api/cash-drawer-shifts/:id/cash-in` — `{ amount, type }` — types: `SALES, COLLECTION` |
| POST | `/api/cash-drawer-shifts/:id/cash-out` — `{ amount, type }` — types: `EXPENSE, SALARY, MAINTENANCE, PURCHASE, INCENTIVE` |

---

## Financial Reports — `/api/financial-reports`

| Method | Endpoint | Action |
|---|---|---|
| GET | `/sales` | `view_sales_report` — `from?` `to?` |
| GET | `/profit` | `view_profit_report` — `from?` `to?` |
| GET | `/treasury` | `view_treasury_report` |

---

## لوحة أخرى

| Module | Endpoint | Action | ملاحظات |
|---|---|---|---|
| Dashboard | `GET /api/dashboard` | `dashboard` | ملخص مبيعات/طلبات/وردية/تنبيهات |
| Warnings | `GET /api/warnings` | `view_warnings` | مخزون منخفض + قرب انتهاء الصلاحية |
| Audit Logs | `GET /api/audit-logs` (+ `/:id`) | `view_audit_log` | paginated — فلترة `page/action/userId/from/to` |
| Settings | `GET /api/settings` | `view_settings` | |
| Settings | `PUT /api/settings/:key` | `update_settings` | `{ value }` — OWNER فقط |
| Settings | `POST /api/settings/bulk` | `update_settings` | `{ settings: [{ key, value }] }` |
| Backup | `GET /api/backup/download` | `download_backup` | **OWNER فقط** — ملف SQLite متسق |
| Chat | `POST /api/chat` | — | عام/موظف — OpenAI function calling — rate limited |
| Health | `GET /api/health` | — | عام |

---

## إعدادات البيئة (`.env`)

```
PORT=5000
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="CHANGE_THIS_SECRET"
JWT_EXPIRES_IN="7d"
NODE_ENV="development"
OPENAI_API_KEY="sk-..."   # اختياري — للبوت
OPENAI_MODEL="gpt-4o-mini"
```

---

## ملخص سريع

- قاعدة البيانات: **SQLite WAL** (`prisma/dev.db`).
- الـ migrations مدمجة في ملف واحد: `20260816170101_init`.
- التوثيق التفاعلي: `/api/docs` — JSON خام: `/api/docs.json`.
- الاختبارات: `npm test` — node:test + supertest على قاعدة منفصلة `prisma/test.db` (تتبنى تلقائيًا قبل التشغيل).
- إعادة بناء الداتابيز: `npm run db:reset` (⚠️ يمسح البيانات).