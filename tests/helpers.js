/**
 * tests/helpers.js — إعداد بيئة الاختبار
 * =====================================
 * قاعدة بيانات SQLite منفصلة (prisma/test.db) — مش بنلمس dev.db.
 * ترتيب مهم: تحديد NODE_ENV و DATABASE_URL قبل استيراد الـ app عشان
 * الـ rate limiters يتعطلوا والـ logger يسكت.
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const TEST_DB_PATH = path.resolve(__dirname, "..", "prisma", "test.db");
const TEST_DB_URL = `file:${TEST_DB_PATH}`;

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = TEST_DB_URL;

// بناء قاعدة اختبار نظيفة مرة واحدة لكل عملية اختبار
for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(TEST_DB_PATH + suffix, { force: true });
}

execSync("npx prisma migrate deploy", {
  stdio: "ignore",
  env: { ...process.env, DATABASE_URL: TEST_DB_URL },
});

const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/lib/prisma");

const TABLE_NAMES = [
  "cash_drawer_transactions",
  "cash_drawer_shifts",
  "audit_logs",
  "settings",
  "sale_items",
  "sales",
  "order_items",
  "orders",
  "return_items",
  "returns",
  "purchase_items",
  "purchases",
  "product_type_ingredients",
  "product_size_ingredients",
  "product_addons",
  "product_sizes",
  "product_types",
  "products",
  "raw_material_batches",
  "raw_materials",
  "delegates",
  "suppliers",
  "customers",
  "users",
];

const resetDb = async () => {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF;");

  for (const table of TABLE_NAMES) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
  }

  await prisma.$executeRawUnsafe("DELETE FROM sqlite_sequence;");
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");
};

const seedOwner = async (overrides = {}) => {
  const bcrypt = require("bcryptjs");
  const passwordHash = await bcrypt.hash(overrides.password || "root123", 4);

  return prisma.user.create({
    data: {
      name: overrides.name || "Admin",
      passwordHash,
      position: overrides.position || "OWNER",
      role: "OWNER",
      status: "ACTIVE",
    },
  });
};

const seedUser = async (overrides = {}) => {
  const bcrypt = require("bcryptjs");
  const passwordHash = await bcrypt.hash(overrides.password || "pass123", 4);

  return prisma.user.create({
    data: {
      name: overrides.name || "Cashier One",
      passwordHash,
      position: overrides.position || "CASHIER",
      role: overrides.role || "CASHIER",
      status: overrides.status || "ACTIVE",
    },
  });
};

const loginToken = async (name, password) => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ name, password: password || "root123" });

  return res.body.data.token;
};

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// ---- مُعدات بيانات مشتركة ----

const createSupplier = async () =>
  prisma.supplier.create({
    data: {
      name: "Tazweed Co",
      contactPerson: "Ahmed",
      phone: "0100000001",
      city: "Cairo",
      supplierType: "coffee",
      supplierCategory: "beans",
    },
  });

const createCustomer = async () =>
  prisma.customer.create({ data: { name: "Omar", phone: "01111111111" } });

const createMaterial = async () =>
  prisma.rawMaterial.create({
    data: {
      name: "Coffee Beans",
      unit: "kg",
      supplier: "Tazweed",
      minStockAlert: 5,
      batches: {
        create: { quantity: 50, pricePerUnit: 200 },
      },
    },
  });

const createProductWithSize = async () => {
  const product = await prisma.product.create({ data: { name: "Espresso" } });

  const size = await prisma.productSize.create({
    data: {
      productId: product.id,
      typeName: "Hot",
      name: "Medium",
      basePrice: 30,
      finalPrice: 35,
    },
  });

  return { product, size };
};

module.exports = {
  request,
  app,
  prisma,
  TEST_DB_PATH,
  TEST_DB_URL,
  resetDb,
  seedOwner,
  seedUser,
  loginToken,
  bearer,
  createSupplier,
  createCustomer,
  createMaterial,
  createProductWithSize,
};