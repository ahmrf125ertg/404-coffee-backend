# دليل اختبار كل الـ endpoints بـ curl (بالترتيب المنطقي)

> بيستهدف `http://localhost:5000` — لازم الـ server شغال (`npm run dev`).
> أول حاجة: `npm run db:reset` عشان تبدأ من قاعدة نظيفة.

## 0) التحضير

```bash
BASE=http://localhost:5000

# تسجيل الدخول (لو عندك jq بيحفظ الـ token تلقائي)
curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","password":"root123"}'

TOKEN=$(curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"name":"Admin","password":"root123"}' | jq -r .data.token)
AUTH="Authorization: Bearer $TOKEN"
```

## 1) Health + Docs

```bash
curl -s $BASE/api/health
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/docs/      # 200 = Swagger UI
curl -s $BASE/api/docs.json | jq '.paths | keys'              # كل الـ paths
```

## 2) المستخدمون + RBAC

```bash
curl -s $BASE/api/users -H "$AUTH" | jq                        # قائمة (pagination)

# كاشير
curl -s -X POST $BASE/api/users -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Cashier1","password":"123456","position":"CASHIER","role":"CASHIER"}'

# مدير
curl -s -X POST $BASE/api/users -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Manager1","password":"123456","position":"MANAGER","role":"MANAGER"}'

# صلاحيات مستخدم (قائمة أفعال ملموسة)
curl -s $BASE/api/users/2/permissions -H "$AUTH" | jq '.data.permissions'

# حمايات: تحذف نفسك → 400
curl -s -X DELETE $BASE/api/users/1 -H "$AUTH"
```

## 3) العملاء والموردون والمندوبون

```bash
curl -s -X POST $BASE/api/customers -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Omar","phone":"01111111111"}'
curl -s -X POST $BASE/api/customers -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Sara","phone":"01122222222"}'
curl -s "$BASE/api/customers?page=1&pageSize=1" -H "$AUTH" | jq '.pagination'

curl -s -X POST $BASE/api/suppliers -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Tazweed Co","contactPerson":"Ahmed","phone":"0100000001","city":"Cairo","supplierType":"coffee","supplierCategory":"beans"}'

curl -s -X POST $BASE/api/delegates -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Ali","whatsapp":"01099999999","phone":"01099999998"}'
curl -s -X PATCH $BASE/api/delegates/1/status -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status":"UNAVAILABLE"}'
```

## 4) المخزون (مواد خام + دفعات)

```bash
curl -s -X POST $BASE/api/raw-materials -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Coffee Beans","unit":"kg","quantity":50,"pricePerUnit":200,"supplier":"Tazweed Co","minStockAlert":5}'
curl -s -X POST $BASE/api/raw-materials -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Milk","unit":"L","quantity":20,"pricePerUnit":30,"supplier":"Farm","minStockAlert":10}'

curl -s -X POST $BASE/api/raw-materials/2/batches -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"quantity":30,"pricePerUnit":28,"expiryDate":"2027-01-01"}'
curl -s "$BASE/api/raw-materials?page=1&pageSize=2" -H "$AUTH" | jq '.pagination'
```

## 5) المنتجات (سايز/إضافات/مكونات)

```bash
curl -s -X POST $BASE/api/products -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Espresso","description":"Double shot"}'

curl -s -X POST $BASE/api/products/1/sizes -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"typeName":"Hot","name":"Medium","basePrice":30,"finalPrice":35}'

curl -s -X POST $BASE/api/products/1/sizes/1/ingredients -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"rawMaterialId":1,"quantity":0.02,"unit":"kg"}'

curl -s -X POST $BASE/api/products/1/addons -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Extra shot","price":10}'

curl -s -X POST $BASE/api/products/1/types -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Regular"}'
```

## 6) المبيعات (أهم جزء — بيخصم من المخزون)

```bash
# 2 إسبريسو = 35*2 = 70، خصم 5 → الإجمالي 65
curl -s -X POST $BASE/api/sales -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"customerId":1,"discount":5,"paymentMethod":"CASH","items":[{"productId":1,"productSizeId":1,"quantity":2}]}'

curl -s "$BASE/api/sales?page=1&pageSize=5" -H "$AUTH" | jq '.pagination'
curl -s "$BASE/api/sales?search=Omar" -H "$AUTH" | jq '.data | length'

# إلغاء فاتورة → soft-cancel
curl -s -X DELETE $BASE/api/sales/1 -H "$AUTH" | jq '.data.status'   # CANCELLED
```

## 7) المشتريات (Draft → Approve يضيف للمخزون)

```bash
curl -s -X POST $BASE/api/purchases -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"invoiceNo":"INV-1001","supplierId":1,"invoiceDate":"2026-08-16","discount":0,"total":1800,"finalTotal":1800,"items":[{"rawMaterialId":1,"quantity":10,"unit":"kg","pricePerUnit":180,"totalPrice":1800}]}'
curl -s -X PATCH $BASE/api/purchases/1/approve -H "$AUTH"          # → APPROVED + دفعة جديدة
curl -s -X PATCH $BASE/api/purchases/2/cancel -H "$AUTH"           # مثال: إلغاء أخرى
```

## 8) الطلبات

```bash
curl -s -X POST $BASE/api/orders -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"orderType":"DINE_IN","paymentMethod":"CASH","items":[{"productId":1,"productSizeId":1,"quantity":1}]}'
curl -s -X PUT $BASE/api/orders/1 -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status":"COMPLETED"}'
curl -s "$BASE/api/orders?page=1&pageSize=5" -H "$AUTH" | jq '.pagination'
```

## 9) المرتجعات

```bash
curl -s -X POST $BASE/api/returns -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"supplierId":1,"returnNo":"RET-1","items":[{"rawMaterialId":1,"quantity":3,"unit":"kg","pricePerUnit":200,"totalPrice":600}]}'
curl -s -X PATCH $BASE/api/returns/1/approve -H "$AUTH"
curl -s -X DELETE $BASE/api/returns/1 -H "$AUTH"                  # Approved → 400 (أمان)
```

## 10) الوردية/الدرج

```bash
curl -s -X POST $BASE/api/cash-drawer-shifts -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"openingBalance":500}'
curl -s -X POST $BASE/api/cash-drawer-shifts/1/cash-in -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"amount":300,"type":"COLLECTION"}'
curl -s -X POST $BASE/api/cash-drawer-shifts/1/cash-out -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"amount":100,"type":"EXPENSE"}'
curl -s $BASE/api/cash-drawer-shifts/current -H "$AUTH" | jq '.data.id'
# إغلاق (التوقع: 500 + 300 - 100 = 700)
curl -s -X POST $BASE/api/cash-drawer-shifts/1/close -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"closingBalance":700,"actualBalance":700}'
```

## 11) التقارير + التنبيهات + اللوحة + الإعدادات

```bash
curl -s $BASE/api/dashboard -H "$AUTH" | jq '.data.summary'
curl -s "$BASE/api/financial-reports/sales?from=2026-08-01&to=2026-08-31" -H "$AUTH" | jq '.data'
curl -s "$BASE/api/financial-reports/profit" -H "$AUTH" | jq '.data'
curl -s "$BASE/api/financial-reports/treasury" -H "$AUTH" | jq '.data'
curl -s $BASE/api/warnings -H "$AUTH" | jq '.data'
curl -s $BASE/api/settings -H "$AUTH" | jq '.data'
curl -s -X POST $BASE/api/settings/bulk -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"settings":[{"key":"currency","value":"EGP"}]}'
```

## 12) سجل الأحداث + RBAC + النسخ الاحتياطي

```bash
curl -s "$BASE/api/audit-logs?pageSize=5" -H "$AUTH" | jq '.data | map({page, action})'

# اختبار RBAC: كاشير على users → 403
CASHIER_TOKEN=$(curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"name":"Cashier1","password":"123456"}' | jq -r .data.token)
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/users     -H "Authorization: Bearer $CASHIER_TOKEN"   # 403
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/sales     -H "Authorization: Bearer $CASHIER_TOKEN"   # 200

# النسخ الاحتياطي (OWNER فقط) — ملف SQLite متسق
curl -s -o backup-$(date +%F).db $BASE/api/backup/download -H "$AUTH"
file backup-$(date +%F).db   # SQLite 3.x database
```

## 13) Rate limiting (اختبار اختياري)

```bash
# 61 محاولة login بسرعة → الـ 61 تُرفض بـ 429
for i in $(seq 1 61); do curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" -d '{"name":"x","password":"y"}'; done | sort | uniq -c
```