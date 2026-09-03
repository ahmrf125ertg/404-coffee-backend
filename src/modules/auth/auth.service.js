const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");

const prisma = require("../../lib/prisma");

const { jwtSecret, jwtExpiresIn } = require("../../config/env");

const { getExpandedPermissions, PAGES } = require("../../config/roles.config");

// ============================================================
// Page metadata for frontend sidebar
// ============================================================

const PAGE_META = {
  dashboard: {
    page_name: "لوحة التحكم",
    page_key: "dashboard",
    icon: "layout-dashboard",
    path: "/dashboard",
  },
  sales: {
    page_name: "المبيعات",
    page_key: "sales",
    icon: "receipt",
    path: "/sales",
  },
  suppliers: {
    page_name: "الموردون",
    page_key: "suppliers",
    icon: "truck",
    path: "/suppliers",
  },
  products: {
    page_name: "المنتجات",
    page_key: "products",
    icon: "box",
    path: "/products",
  },
  returns: {
    page_name: "المرتجعات",
    page_key: "returns",
    icon: "rotate-ccw",
    path: "/returns",
  },
  inventory: {
    page_name: "المخزون",
    page_key: "inventory",
    icon: "warehouse",
    path: "/inventory",
  },
  purchases: {
    page_name: "المشتريات",
    page_key: "purchases",
    icon: "file-text",
    path: "/purchases",
  },
  customers: {
    page_name: "العملاء",
    page_key: "customers",
    icon: "users",
    path: "/customers",
  },
  delegates: {
    page_name: "المندوبين",
    page_key: "delegates",
    icon: "truck",
    path: "/delegates",
  },
  cash_drawer_shifts: {
    page_name: "الدرج والورديات",
    page_key: "drawer",
    icon: "wallet",
    path: "/drawer",
  },
  users: {
    page_name: "الموظفين",
    page_key: "employees",
    icon: "user",
    path: "/employees",
  },
  warnings: {
    page_name: "التحذيرات",
    page_key: "warnings",
    icon: "alert-triangle",
    path: "/warnings",
  },
  audit_log: {
    page_name: "سجل المراجعة",
    page_key: "audit_log",
    icon: "file-text",
    path: "/audit-log",
  },
  settings: {
    page_name: "الإعدادات",
    page_key: "settings",
    icon: "settings",
    path: "/settings",
  },
  financial_reports: {
    page_name: "التقارير المالية",
    page_key: "financial_reports",
    icon: "bar-chart",
    path: "/financial-reports",
  },
};

// ============================================================
// Action name mapping (RBAC action → frontend action)
// ============================================================

const ACTION_MAP = {
  view_users: "view",
  create_user: "create",
  edit_user: "update",
  change_user_status: "update",
  delete_user: "delete",
  view_sales_history: "view",
  create_invoice: "create",
  edit_invoice: "update",
  cancel_invoice: "update",
  view_purchases: "view",
  create_purchase: "create",
  edit_purchase: "update",
  approve_purchase: "update",
  cancel_purchase: "update",
  delete_purchase: "delete",
  view_customers: "view",
  create_customer: "create",
  edit_customer: "update",
  delete_customer: "delete",
  view_inventory: "view",
  create_material: "create",
  edit_material: "update",
  delete_material: "delete",
  add_batch: "create",
  view_suppliers: "view",
  create_supplier: "create",
  edit_supplier: "update",
  delete_supplier: "delete",
  view_products: "view",
  create_product: "create",
  edit_product: "update",
  delete_product: "delete",
  manage_types: "update",
  manage_sizes: "update",
  manage_addons: "update",
  manage_ingredients: "update",
  view_returns: "view",
  create_return: "create",
  edit_return: "update",
  delete_return: "delete",
  approve_return: "update",
  cancel_return: "update",
  view_delegates: "view",
  create_delegate: "create",
  edit_delegate: "update",
  change_delegate_status: "update",
  delete_delegate: "delete",
  view_orders: "view",
  create_order: "create",
  edit_order: "update",
  delete_order: "delete",
  view_shifts_report: "view",
  open_shift: "create",
  close_shift: "update",
  record_cash_in: "create",
  record_cash_out: "create",
  view_audit_log: "view",
  view_settings: "view",
  update_settings: "update",
  view_warnings: "view",
  view_sales_report: "view",
  view_profit_report: "view",
  view_treasury_report: "view",
  download_backup: "view",
};

// ============================================================
// Build permissions array for frontend
// ============================================================

const buildPermissions = (role) => {
  const expanded = getExpandedPermissions(role);
  const permissions = [];

  // Standalone pages
  const standalonePages = [
    "dashboard",
    "sales",
    "suppliers",
    "products",
    "returns",
    "inventory",
    "purchases",
    "customers",
    "delegates",
    "cash_drawer_shifts",
    "users",
    "warnings",
    "audit_log",
    "settings",
    "financial_reports",
  ];

  for (const pageKey of standalonePages) {
    if (expanded[pageKey] && expanded[pageKey].length > 0) {
      const meta = PAGE_META[pageKey];
      if (!meta) continue;

      const actions = expanded[pageKey].map(
        (a) => ACTION_MAP[a] || a
      );
      const uniqueActions = [...new Set(actions)];

      permissions.push({
        ...meta,
        actions: uniqueActions,
      });
    }
  }

  // Orders section group
  if (expanded.orders && expanded.orders.length > 0) {
    const orderActions = expanded.orders;
    const items = [];

    // Online orders page
    if (orderActions.includes("view_orders") || orderActions.includes("create_order")) {
      items.push({
        page_name: "الأونلاين",
        page_key: "orders_online",
        path: "/orders/online",
        actions: ["view"],
      });
    }

    // Table orders page
    if (orderActions.includes("view_orders") || orderActions.includes("create_order")) {
      items.push({
        page_name: "الطربيزات",
        page_key: "orders_tables",
        path: "/orders/tables",
        actions: ["view"],
      });
    }

    // Table services page
    if (orderActions.includes("view_orders")) {
      items.push({
        page_name: "خدمات الطربيزات",
        page_key: "orders_table_services",
        path: "/orders/table-services",
        actions: ["view"],
      });
    }

    // Orders history page
    if (orderActions.includes("view_orders")) {
      items.push({
        page_name: "سجل الطلبات",
        page_key: "orders_history",
        path: "/orders/history",
        actions: ["view"],
      });
    }

    if (items.length > 0) {
      permissions.push({
        section: "إنشاء الطلبات",
        items,
      });
    }

    // Preparation section
    if (orderActions.includes("view_orders") || orderActions.includes("edit_order")) {
      permissions.push({
        section: "تحضير الطلبات",
        items: [
          {
            page_name: "التحضير",
            page_key: "orders_preparation",
            path: "/orders/preparation",
            actions: orderActions.includes("edit_order")
              ? ["view", "update"]
              : ["view"],
          },
        ],
      });
    }
  }

  return permissions;
};

// ============================================================
// Build employee object from user
// ============================================================

const buildEmployee = (user) => ({
  id: user.id,
  employee_code: `EMP-${String(user.id).padStart(4, "0")}`,
  name: user.name,
  position: user.position,
  email: null,
  phone: null,
  department: null,
  status: user.status === "ACTIVE" ? "active" : "suspended",
  last_login: new Date().toISOString(),
  shift: {
    id: 1,
    name: "الوردية الصباحية",
    start_time: "08:00",
    end_time: "16:00",
    break_start: "12:00",
    break_end: "12:30",
  },
});

// ============================================================
// Build role object
// ============================================================

const ROLE_DISPLAY_NAMES = {
  OWNER: "المالك",
  MANAGER: "المدير",
  CASHIER: "كاشير",
  DELEGATE: "مندوب",
};

const ROLE_NAMES = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CASHIER: "Cashier",
  DELEGATE: "Delegate",
};

const buildRole = (role) => ({
  id: role === "OWNER" ? 1 : role === "MANAGER" ? 2 : role === "CASHIER" ? 3 : 4,
  name: ROLE_NAMES[role] || role,
  display_name: ROLE_DISPLAY_NAMES[role] || role,
});

// ============================================================
// Login
// ============================================================

const loginUser = async ({ name, username, password, deviceFingerprint }) => {
  const resolvedName = name || username;
  if (!resolvedName || !password) {
    const error = new Error("Name and password are required");
    error.statusCode = 400;
    throw error;
  }

  const user = await prisma.user.findFirst({
    where: { name: resolvedName },
  });

  if (!user) {
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  if (user.status !== "ACTIVE") {
    const error = new Error("User account is suspended");
    error.statusCode = 403;
    throw error;
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatch) {
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  // Device fingerprint check
  let deviceReviewRequired = false;
  if (deviceFingerprint) {
    const device = await prisma.employeeDevice.findUnique({
      where: { deviceFingerprint },
    });
    if (!device) {
      deviceReviewRequired = true;
    } else if (device.status === "PENDING") {
      deviceReviewRequired = true;
    } else if (device.status === "REVOKED" || device.status === "REJECTED") {
      const error = new Error("This device has been revoked or rejected");
      error.statusCode = 403;
      throw error;
    }
  }

  const token = jwt.sign(
    {
      userId: user.id,
      role: user.role,
    },
    jwtSecret,
    {
      expiresIn: jwtExpiresIn,
    }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, type: "refresh" },
    jwtSecret,
    { expiresIn: "7d" }
  );

  const employee = buildEmployee(user);
  const role = buildRole(user.role);
  const permissions = buildPermissions(user.role);

  return {
    auth: {
      access_token: token,
      refresh_token: refreshToken,
      expires_in: 3600,
      token_type: "Bearer",
    },
    employee,
    role,
    permissions,
    notifications: [],
    preferences: {
      language: "ar",
      direction: "rtl",
      theme: "light",
      timezone: "Africa/Cairo",
    },
    session: {
      login_time: new Date().toISOString(),
      device: "Chrome",
      ip_address: "127.0.0.1",
    },
    deviceReviewRequired,
  };
};

const getMe = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, position: true, role: true, status: true, createdAt: true },
    });
    if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
    }

    const pageAccessRecord = await prisma.userPageAccess.findUnique({
        where: { userId },
        select: { pages: true },
    });

    return {
        user,
        permissions: buildPermissions(user.role),
        pageAccess: pageAccessRecord ? pageAccessRecord.pages : [],
        session: {
            login_time: new Date().toISOString(),
            device: "Chrome",
            ip_address: "127.0.0.1",
        },
    };
};

const refreshToken = async (refreshTokenValue) => {
    if (!refreshTokenValue) {
        const error = new Error("Refresh token is required");
        error.statusCode = 400;
        throw error;
    }
    try {
        const decoded = jwt.verify(refreshTokenValue, jwtSecret);
        if (decoded.type !== "refresh") {
            const error = new Error("Invalid refresh token");
            error.statusCode = 401;
            throw error;
        }
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user || user.status !== "ACTIVE") {
            const error = new Error("User not found or suspended");
            error.statusCode = 401;
            throw error;
        }
        const access_token = jwt.sign({ userId: user.id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });
        const new_refresh_token = jwt.sign({ userId: user.id, type: "refresh" }, jwtSecret, { expiresIn: "7d" });
        return { access_token, refresh_token: new_refresh_token, expires_in: 3600 };
    } catch (error) {
        if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
            const e = new Error("Invalid or expired refresh token");
            e.statusCode = 401;
            throw e;
        }
        throw error;
    }
};

const logoutUser = async (userId, allDevices) => {
    if (allDevices) {
        await prisma.employeeDevice.deleteMany({
            where: { userId },
        });
    }
    return { loggedOut: true };
};

module.exports = {
  loginUser,
  getMe,
  refreshToken,
  logoutUser,
};
