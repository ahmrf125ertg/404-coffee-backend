/**
 * docs/swagger.js — توثيق OpenAPI 3.0 كامل للـ API
 * الواجهة: GET /api/docs (Swagger UI) + GET /api/docs.json
 */

const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const bearerAuth = {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
};

const successResponse = {
  description: "نجاح",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string" },
          data: { type: "object" },
        },
      },
    },
  },
};

const listResponse = {
  description: "قائمة (مع pagination)",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: { type: "array", items: { type: "object" } },
          pagination: {
            type: "object",
            properties: {
              page: { type: "integer" },
              pageSize: { type: "integer" },
              total: { type: "integer" },
              totalPages: { type: "integer" },
            },
          },
        },
      },
    },
  },
};

const errorResponses = {
  400: { description: "بيانات غير صالحة" },
  401: { description: "مطلوب تسجيل دخول / توكن غير صالح" },
  403: { description: "لا تملك الصلاحية" },
  404: { description: "غير موجود" },
  500: { description: "خطأ في الخادم" },
};

const paginationParams = [
  {
    name: "page",
    in: "query",
    schema: { type: "integer", minimum: 1, default: 1 },
    description: "رقم الصفحة",
  },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    description: "حجم الصفحة (الحد الأقصى 100)",
  },
];

const idParam = (name = "id", description = "المعرف") => ({
  name,
  in: "path",
  required: true,
  schema: { type: "integer" },
  description,
});

// ------------------------------------------------------------
// Auth
// ------------------------------------------------------------
const authPaths = {
  "/api/auth/login": {
    post: {
      tags: ["Auth"],
      summary: "تسجيل دخول (عام)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "password"],
              properties: {
                name: { type: "string", example: "Admin" },
                password: { type: "string", example: "root123" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "نجاح — يرجع token + user",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  data: {
                    type: "object",
                    properties: {
                      token: { type: "string" },
                      user: {
                        type: "object",
                        properties: {
                          id: { type: "integer" },
                          name: { type: "string" },
                          position: { type: "string" },
                          role: {
                            type: "string",
                            enum: ["OWNER", "MANAGER", "CASHIER", "DELEGATE"],
                          },
                          status: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
};

const healthPaths = {
  "/api/health": {
    get: {
      tags: ["Health"],
      summary: "فحص الحالة (عام)",
      responses: {
        200: { description: "الخادم شغال" },
      },
    },
  },
};

// ------------------------------------------------------------
// Users
// ------------------------------------------------------------
const usersPaths = {
  "/api/users": {
    get: {
      tags: ["Users"],
      summary: "قائمة المستخدمين",
      security: [{ bearerAuth: [] }],
      parameters: paginationParams,
      responses: {
        200: listResponse,
        ...errorResponses,
      },
    },
    post: {
      tags: ["Users"],
      summary: "إنشاء مستخدم",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "password", "position", "role"],
              properties: {
                name: { type: "string", example: "Mohamed" },
                password: { type: "string", example: "123456" },
                position: { type: "string", example: "CASHIER" },
                role: {
                  type: "string",
                  enum: ["OWNER", "MANAGER", "CASHIER", "DELEGATE"],
                  example: "CASHIER",
                },
              },
            },
          },
        },
      },
      responses: {
        201: successResponse,
        ...errorResponses,
      },
    },
  },
  "/api/users/{id}": {
    put: {
      tags: ["Users"],
      summary: "تعديل مستخدم (name/password/position/role)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المستخدم")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                password: { type: "string" },
                position: { type: "string" },
                role: { type: "string", enum: ["OWNER", "MANAGER", "CASHIER", "DELEGATE"] },
              },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Users"],
      summary: "حذف مستخدم (ممنوع حذف نفسك أو آخر Owner)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المستخدم")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/users/{id}/status": {
    patch: {
      tags: ["Users"],
      summary: "تفعيل/تعطيل مستخدم",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المستخدم")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status"],
              properties: {
                status: { type: "string", enum: ["ACTIVE", "SUSPENDED"] },
              },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/users/{id}/permissions": {
    get: {
      tags: ["Users"],
      summary: "الصلاحيات الفعلية للمستخدم (من RBAC config)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المستخدم")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

// ------------------------------------------------------------
// Sales
// ------------------------------------------------------------
const saleItemSchema = {
  type: "object",
  required: ["productId", "productSizeId", "quantity"],
  properties: {
    productId: { type: "integer" },
    productSizeId: { type: "integer" },
    quantity: { type: "number", example: 1 },
  },
};

const salesPaths = {
  "/api/sales": {
    get: {
      tags: ["Sales"],
      summary: "قائمة المبيعات (فلترة + pagination)",
      security: [{ bearerAuth: [] }],
      parameters: [
        ...paginationParams,
        { name: "search", in: "query", schema: { type: "string" }, description: "بحث باسم/هاتف العميل" },
        { name: "status", in: "query", schema: { type: "string", enum: ["COMPLETED", "CANCELLED"] } },
        { name: "paymentMethod", in: "query", schema: { type: "string", enum: ["CASH", "CARD", "WALLET"] } },
      ],
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Sales"],
      summary: "إنشاء فاتورة مبيعات",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["items"],
              properties: {
                customerId: { type: "integer" },
                discount: { type: "number", default: 0 },
                paymentMethod: { type: "string", enum: ["CASH", "CARD", "WALLET"], default: "CASH" },
                status: { type: "string", enum: ["COMPLETED", "CANCELLED"], default: "COMPLETED" },
                items: { type: "array", items: saleItemSchema },
              },
            },
          },
        },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/sales/{id}": {
    get: {
      tags: ["Sales"],
      summary: "فاتورة مبيعات واحدة",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف الفاتورة")],
      responses: { 200: successResponse, ...errorResponses },
    },
    put: {
      tags: ["Sales"],
      summary: "تعديل فاتورة مبيعات",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف الفاتورة")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                customerId: { type: "integer" },
                discount: { type: "number" },
                paymentMethod: { type: "string", enum: ["CASH", "CARD", "WALLET"] },
                status: { type: "string", enum: ["COMPLETED", "CANCELLED"] },
                items: { type: "array", items: saleItemSchema },
              },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Sales"],
      summary: "إلغاء فاتورة",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف الفاتورة")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

// ------------------------------------------------------------
// بقية الموديولز — CRUD قياسي
// ------------------------------------------------------------
const crudPaths = (tag, base, opts = {}) => {
  const { searchParams = [] } = opts;

  const methods = {
    get: {
      tags: [tag],
      summary: `قائمة ${tag}`,
      security: [{ bearerAuth: [] }],
      parameters: [...paginationParams, ...searchParams],
      responses: { 200: listResponse, ...errorResponses },
    },
  };

  if (opts.create !== false) {
    methods.post = {
      tags: [tag],
      summary: `إنشاء ${tag}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 201: successResponse, ...errorResponses },
    };
  }

  return {
    [base]: methods,
    [`${base}/{id}`]: {
      get: {
        tags: [tag],
        summary: `عنصر واحد من ${tag}`,
        security: [{ bearerAuth: [] }],
        parameters: [idParam("id")],
        responses: { 200: successResponse, ...errorResponses },
      },
      put: {
        tags: [tag],
        summary: `تعديل ${tag}`,
        security: [{ bearerAuth: [] }],
        parameters: [idParam("id")],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { 200: successResponse, ...errorResponses },
      },
      delete: {
        tags: [tag],
        summary: `حذف ${tag}`,
        security: [{ bearerAuth: [] }],
        parameters: [idParam("id")],
        responses: { 200: successResponse, ...errorResponses },
      },
    },
  };
};

const customersPaths = crudPaths("Customers", "/api/customers");
const suppliersPaths = crudPaths("Suppliers", "/api/suppliers");
const delegatesPaths = {
  ...crudPaths("Delegates", "/api/delegates"),
  "/api/delegates/{id}/status": {
    patch: {
      tags: ["Delegates"],
      summary: "تفعيل/تعطيل مندوب",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status"],
              properties: { status: { type: "string", enum: ["AVAILABLE", "UNAVAILABLE"] } },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

const inventoryPaths = {
  ...crudPaths("Inventory", "/api/raw-materials"),
  "/api/raw-materials/{id}/batches": {
    get: {
      tags: ["Inventory"],
      summary: "دفعات مادة خام",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المادة")],
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Inventory"],
      summary: "إضافة دفعة (quantity/pricePerUnit/expiryDate)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المادة")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
};

const purchasesPaths = {
  ...crudPaths("Purchases", "/api/purchases"),
  "/api/purchases/{id}/approve": {
    patch: {
      tags: ["Purchases"],
      summary: "اعتماد فاتورة شراء (تضيف للدفعات)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/purchases/{id}/cancel": {
    patch: {
      tags: ["Purchases"],
      summary: "إلغاء فاتورة شراء",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

const returnsPaths = {
  ...crudPaths("Returns", "/api/returns"),
  "/api/returns/{id}/approve": {
    patch: {
      tags: ["Returns"],
      summary: "اعتماد مرتجع",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/returns/{id}/cancel": {
    patch: {
      tags: ["Returns"],
      summary: "إلغاء مرتجع",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

const ordersPaths = {
  "/api/orders": {
    get: {
      tags: ["Orders"],
      summary: "قائمة الطلبات",
      security: [{ bearerAuth: [] }],
      parameters: paginationParams,
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Orders"],
      summary: "إنشاء طلب",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                customerId: { type: "integer" },
                delegateId: { type: "integer" },
                orderType: { type: "string", enum: ["tables", "online"] },
                status: { type: "string", enum: ["PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED"] },
                phone: { type: "string" },
                paymentMethod: { type: "string", enum: ["CASH", "CARD", "WALLET"] },
                discount: { type: "number" },
                notes: { type: "string" },
                items: { type: "array", items: saleItemSchema },
              },
            },
          },
        },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/orders/{id}": {
    get: {
      tags: ["Orders"],
      summary: "طلب واحد",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
    put: {
      tags: ["Orders"],
      summary: "تعديل طلب (بيشمل تحديث الحالة/المندوب)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Orders"],
      summary: "حذف طلب",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

// ------------------------------------------------------------
// Cash drawer, reports, dashboard, audit, settings, warnings
// ------------------------------------------------------------
const cashDrawerPaths = {
  "/api/cash-drawer-shifts": {
    get: {
      tags: ["Cash Drawer"],
      summary: "قائمة الورديات",
      security: [{ bearerAuth: [] }],
      parameters: paginationParams,
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Cash Drawer"],
      summary: "فتح وردية (openingBalance)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/cash-drawer-shifts/current": {
    get: {
      tags: ["Cash Drawer"],
      summary: "الوردية المفتوحة حاليًا",
      security: [{ bearerAuth: [] }],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/cash-drawer-shifts/{id}": {
    get: {
      tags: ["Cash Drawer"],
      summary: "وردية واحدة",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/cash-drawer-shifts/{id}/close": {
    post: {
      tags: ["Cash Drawer"],
      summary: "إغلاق وردية (closingBalance/actualBalance/difference/notes)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/cash-drawer-shifts/{id}/cash-in": {
    post: {
      tags: ["Cash Drawer"],
      summary: "إيداع نقدي",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/cash-drawer-shifts/{id}/cash-out": {
    post: {
      tags: ["Cash Drawer"],
      summary: "سحب نقدي",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
};

const reportPaths = {
  "/api/financial-reports/sales": {
    get: {
      tags: ["Reports"],
      summary: "تقرير المبيعات",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "from", in: "query", schema: { type: "string", format: "date" } },
        { name: "to", in: "query", schema: { type: "string", format: "date" } },
      ],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/financial-reports/profit": {
    get: {
      tags: ["Reports"],
      summary: "تقرير الأرباح",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "from", in: "query", schema: { type: "string", format: "date" } },
        { name: "to", in: "query", schema: { type: "string", format: "date" } },
      ],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/financial-reports/treasury": {
    get: {
      tags: ["Reports"],
      summary: "تقرير الخزينة",
      security: [{ bearerAuth: [] }],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

const miscPaths = {
  "/api/dashboard": {
    get: {
      tags: ["Dashboard"],
      summary: "ملخص اللوحة",
      security: [{ bearerAuth: [] }],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/audit-logs": {
    get: {
      tags: ["Audit Logs"],
      summary: "سجل الأحداث",
      security: [{ bearerAuth: [] }],
      parameters: [
        ...paginationParams,
        { name: "page", in: "query", schema: { type: "string" }, description: "اسم الصفحة" },
        { name: "action", in: "query", schema: { type: "string" } },
        { name: "userId", in: "query", schema: { type: "integer" } },
        { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
        { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
      ],
      responses: { 200: listResponse, ...errorResponses },
    },
  },
  "/api/audit-logs/{id}": {
    get: {
      tags: ["Audit Logs"],
      summary: "سجل حدث واحد",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/settings": {
    get: {
      tags: ["Settings"],
      summary: "كل الإعدادات",
      security: [{ bearerAuth: [] }],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/settings/bulk": {
    post: {
      tags: ["Settings"],
      summary: "تحديث عدة إعدادات",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              example: { settings: [{ key: "shop_name", value: "404 Coffee" }] },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/settings/{key}": {
    put: {
      tags: ["Settings"],
      summary: "تحديث إعداد واحد",
      security: [{ bearerAuth: [] }],
      parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["value"],
              properties: { value: { type: "string" } },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/warnings": {
    get: {
      tags: ["Warnings"],
      summary: "تنبيهات المخزون (low stock + قرب الانتهاء)",
      security: [{ bearerAuth: [] }],
      responses: { 200: listResponse, ...errorResponses },
    },
  },
};

const chatPaths = {
  "/api/chat": {
    post: {
      tags: ["Chat"],
      summary: "محادثة مع البوت (عام أو موظف حسب الـ token)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["messages"],
              properties: {
                messages: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      role: { type: "string", enum: ["user", "assistant"] },
                      content: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

// ------------------------------------------------------------
// التجميع
// ------------------------------------------------------------
const paths = {
  ...healthPaths,
  ...authPaths,
  ...usersPaths,
  ...salesPaths,
  ...customersPaths,
  ...suppliersPaths,
  ...delegatesPaths,
  ...inventoryPaths,
  ...purchasesPaths,
  ...returnsPaths,
  ...ordersPaths,
  ...cashDrawerPaths,
  ...reportPaths,
  ...miscPaths,
  ...chatPaths,
};

const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "404 Coffee API",
    version: "2.0.0",
    description:
      "نظام إدارة كافيه — RBAC (OWNER/MANAGER/CASHIER/DELEGATE)، PostgreSQL، توثيق كامل لكل الـ endpoints.\n\nكل الـ endpoints ماعدا `/api/auth/login` و `/api/health` تتطلب `Authorization: Bearer <JWT>`.",
  },
  servers: [{ url: "http://localhost:5000" }],
  components: {
    securitySchemes: {
      bearerAuth,
    },
  },
  paths,
};

module.exports = {
  swaggerUi,
  swaggerSpec,
};