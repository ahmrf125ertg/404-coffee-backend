const { describe, test, beforeEach } = require("node:test");
const assert = require("node:assert");
const {
  request,
  app,
  prisma,
  resetDb,
  seedOwner,
  loginToken,
  bearer,
  createProductWithSize,
  createCustomer,
  createMaterial,
  createSupplier,
} = require("./helpers");

let token;

// ============================================================
// H1: Batch priority deduction
// ============================================================
describe("H1 — Batch priority deduction", () => {
  let pid, sizeId, material;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    material = await createMaterial();
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;

    // Link ingredient to size
    await prisma.productSizeIngredient.create({
      data: { productSizeId: size.id, rawMaterialId: material.id, quantity: 1, unit: "kg" },
    });

    // Clear existing batch and create 3 batches with explicit withdrawalPriority
    const existing = await prisma.rawMaterialBatch.findFirst({ where: { rawMaterialId: material.id } });
    await prisma.rawMaterialBatch.delete({ where: { id: existing.id } });

    await prisma.rawMaterialBatch.create({
      data: { rawMaterialId: material.id, quantity: 5, pricePerUnit: 150, batchNumber: "B-01", withdrawalPriority: 1 },
    });
    await prisma.rawMaterialBatch.create({
      data: { rawMaterialId: material.id, quantity: 10, pricePerUnit: 100, batchNumber: "B-02", withdrawalPriority: 2 },
    });
    await prisma.rawMaterialBatch.create({
      data: { rawMaterialId: material.id, quantity: 8, pricePerUnit: 200, batchNumber: "B-03", withdrawalPriority: 3 },
    });
  });

  test("Priority 1 batch consumed before priority 2", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test Customer",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 3 }],
      });
    assert.equal(res.status, 201);

    const batches = await prisma.rawMaterialBatch.findMany({
      where: { rawMaterialId: material.id },
      orderBy: { withdrawalPriority: "asc" },
    });
    const p1 = batches.find(b => b.withdrawalPriority === 1);
    const p2 = batches.find(b => b.withdrawalPriority === 2);
    const p3 = batches.find(b => b.withdrawalPriority === 3);

    assert.equal(Number(p1.quantity), 2); // 5 - 3 = 2
    assert.equal(Number(p2.quantity), 10); // untouched
    assert.equal(Number(p3.quantity), 8); // untouched
  });

  test("Priority 2 used only after priority 1 insufficient", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test Customer",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 7 }],
      });
    assert.equal(res.status, 201);

    const batches = await prisma.rawMaterialBatch.findMany({
      where: { rawMaterialId: material.id },
      orderBy: { withdrawalPriority: "asc" },
    });
    const p1 = batches.find(b => b.withdrawalPriority === 1);
    const p2 = batches.find(b => b.withdrawalPriority === 2);
    const p3 = batches.find(b => b.withdrawalPriority === 3);

    assert.equal(Number(p1.quantity), 0); // 5 - 5 = 0
    assert.equal(Number(p2.quantity), 8); // 10 - 2 = 8
    assert.equal(Number(p3.quantity), 8); // untouched
  });

  test("Multiple batches consumed across priorities", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test Customer",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 15 }],
      });
    assert.equal(res.status, 201);

    const batches = await prisma.rawMaterialBatch.findMany({
      where: { rawMaterialId: material.id },
      orderBy: { withdrawalPriority: "asc" },
    });
    const p1 = batches.find(b => b.withdrawalPriority === 1);
    const p2 = batches.find(b => b.withdrawalPriority === 2);
    const p3 = batches.find(b => b.withdrawalPriority === 3);

    assert.equal(Number(p1.quantity), 0);
    assert.equal(Number(p2.quantity), 0);
    assert.equal(Number(p3.quantity), 8);
  });

  test("Insufficient stock rolls back entire transaction", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test Customer",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 25 }],
      });
    assert.equal(res.status, 400);

    const batches = await prisma.rawMaterialBatch.findMany({
      where: { rawMaterialId: material.id },
      orderBy: { withdrawalPriority: "asc" },
    });
    const p1 = batches.find(b => b.withdrawalPriority === 1);
    const p2 = batches.find(b => b.withdrawalPriority === 2);
    const p3 = batches.find(b => b.withdrawalPriority === 3);

    assert.equal(Number(p1.quantity), 5);
    assert.equal(Number(p2.quantity), 10);
    assert.equal(Number(p3.quantity), 8);
  });
});

// ============================================================
// H2: Inventory audit trail
// ============================================================
describe("H2 — Inventory audit trail for auto-deductions", () => {
  let pid, sizeId, material;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    material = await createMaterial();
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;

    await prisma.productSizeIngredient.create({
      data: { productSizeId: size.id, rawMaterialId: material.id, quantity: 2, unit: "kg" },
    });
  });

  test("Auto-deduction creates withdrawal record", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test Customer",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(res.status, 201);
    const orderId = res.body.data.id;

    const withdrawals = await prisma.rawMaterialWithdrawal.findMany({
      where: { orderId },
    });
    assert.ok(withdrawals.length > 0, "Should have withdrawal records");
    assert.equal(withdrawals[0].rawMaterialId, material.id);
    assert.equal(Number(withdrawals[0].quantity), 2);
    assert.ok(withdrawals[0].reason.includes("Auto-deduct"));
  });

  test("Withdrawal references correct batch", async () => {
    const batch = await prisma.rawMaterialBatch.findFirst({
      where: { rawMaterialId: material.id },
    });

    const res = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test Customer",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(res.status, 201);

    const w = await prisma.rawMaterialWithdrawal.findFirst({
      where: { orderId: res.body.data.id },
    });
    assert.equal(w.batchId, batch.id);
  });

  test("Multiple ingredients create correct withdrawal records", async () => {
    const material2 = await prisma.rawMaterial.create({
      data: { name: "Milk", unit: "L", supplier: "Farm", minStockAlert: 2, batches: { create: { quantity: 20, pricePerUnit: 50 } } },
    });
    await prisma.productSizeIngredient.create({
      data: { productSizeId: sizeId, rawMaterialId: material2.id, quantity: 0.5, unit: "L" },
    });

    const res = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test Customer",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 2 }],
      });
    assert.equal(res.status, 201);

    const withdrawals = await prisma.rawMaterialWithdrawal.findMany({
      where: { orderId: res.body.data.id },
    });
    assert.equal(withdrawals.length, 2);
    const materialIds = withdrawals.map(w => w.rawMaterialId).sort();
    assert.deepEqual(materialIds, [material.id, material2.id].sort());
  });
});

// ============================================================
// M1: Supplier transactions pagination
// ============================================================
describe("M1 — Supplier transactions pagination", () => {
  let supplierId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const supplier = await createSupplier();
    supplierId = supplier.id;

    for (let i = 0; i < 5; i++) {
      await prisma.supplierTransaction.create({
        data: {
          supplierId,
          type: "DEBT",
          category: "DEBT",
          amount: 100 + i,
          transactionDate: new Date(),
          notes: `Transaction ${i}`,
        },
      });
    }
  });

  test("Response includes pagination object", async () => {
    const res = await request(app)
      .get(`/api/suppliers/${supplierId}/transactions`)
      .set(bearer(token))
      .query({ page: 1, pageSize: 2 });

    assert.equal(res.status, 200);
    assert.ok(res.body.pagination, "Should include pagination object");
    assert.equal(res.body.pagination.page, 1);
    assert.equal(res.body.pagination.pageSize, 2);
    assert.equal(res.body.pagination.total, 5);
    assert.equal(res.body.pagination.totalPages, 3);
    assert.equal(res.body.data.length, 2);
  });
});

// ============================================================
// M2: Product totalOrders counts distinct orders
// ============================================================
describe("M2 — Product totalOrders counts distinct orders", () => {
  let pid, sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
  });

  test("totalOrders counts distinct orders, not order items", async () => {
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post("/api/orders")
        .set(bearer(token))
        .send({
          channel: "ADMIN_POS",
          fulfillmentType: "PICKUP",
          customerName: "Test Customer",
          phone: "01012345678",
          items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
        });
    }

    const res = await request(app)
      .get("/api/products/public/top")
      .query({ days: 30 });

    assert.equal(res.status, 200);
    const top = res.body.data.find(p => p.productId === pid);
    assert.ok(top, "Product should be in top list");
    assert.equal(top.totalOrders, 2);
  });
});

// ============================================================
// M5: Login response shape includes both employee and user
// ============================================================
describe("M5 — Login response shape", () => {
  beforeEach(async () => {
    await resetDb();
    await seedOwner();
  });

  test("Login response includes both employee and user keys", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.employee, "Should have employee key");
    assert.ok(res.body.data.user, "Should have user key");
    assert.equal(res.body.data.employee.id, res.body.data.user.id);
    assert.equal(res.body.data.employee.name, res.body.data.user.name);
  });

  test("/me response includes both employee and user keys", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    const token = loginRes.body.data.auth.access_token;

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(meRes.status, 200);
    assert.ok(meRes.body.data.employee, "Should have employee key");
    assert.ok(meRes.body.data.user, "Should have user key");
  });
});

// ============================================================
// M6: User soft delete
// ============================================================
describe("M6 — User soft delete", () => {
  let userId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");

    const bcrypt = require("bcryptjs");
    const hash = await bcrypt.hash("pass123", 10);
    const user = await prisma.user.create({
      data: { name: "ToDelete", passwordHash: hash, position: "CASHIER", role: "CASHIER" },
    });
    userId = user.id;
  });

  test("Delete suspends user instead of hard delete", async () => {
    const res = await request(app)
      .delete(`/api/users/${userId}`)
      .set(bearer(token));

    assert.equal(res.status, 200);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    assert.ok(user, "User should still exist in database");
    assert.equal(user.status, "SUSPENDED");
  });

  test("Suspended user cannot log in", async () => {
    await request(app)
      .delete(`/api/users/${userId}`)
      .set(bearer(token));

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "ToDelete", password: "pass123" });

    assert.equal(loginRes.status, 403);
  });
});

// ============================================================
// L1: User list search
// ============================================================
describe("L1 — User list search", () => {
  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");

    const bcrypt = require("bcryptjs");
    const hash = await bcrypt.hash("pass123", 10);
    await prisma.user.create({
      data: { name: "Mohamed", passwordHash: hash, position: "CASHIER", role: "CASHIER" },
    });
    await prisma.user.create({
      data: { name: "Sara", passwordHash: hash, position: "MANAGER", role: "MANAGER" },
    });
  });

  test("Search by name", async () => {
    const res = await request(app)
      .get("/api/users")
      .set(bearer(token))
      .query({ search: "Mohamed" });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].name, "Mohamed");
  });

  test("Search by position", async () => {
    const res = await request(app)
      .get("/api/users")
      .set(bearer(token))
      .query({ search: "MANAGER" });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].name, "Sara");
  });

  test("Empty search returns all users", async () => {
    const res = await request(app)
      .get("/api/users")
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 3);
  });
});
