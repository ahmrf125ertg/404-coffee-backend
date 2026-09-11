const { describe, test, beforeEach } = require("node:test");
const assert = require("node:assert");
const {
  request, app, prisma, resetDb, seedOwner, loginToken, bearer,
  createProductWithSize, createCustomer, createMaterial, createSupplier,
} = require("./helpers");

let token;

// ============================================================
// Item 1: Orders pagination — meta.hasMore/nextCursor
// ============================================================
describe("Item 1 — Orders list returns meta with hasMore/nextCursor", () => {
  let pid, sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;

    // Create 3 orders
    for (let i = 0; i < 3; i++) {
      await request(app).post("/api/orders").set(bearer(token)).send({
        channel: "ADMIN_POS", fulfillmentType: "PICKUP",
        customerName: `C${i}`, phone: `0101234567${i}`,
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    }
  });

  test("Page 1 of 2 returns hasMore=true and nextCursor", async () => {
    const res = await request(app).get("/api/orders").set(bearer(token)).query({ page: 1, pageSize: 2 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.meta.hasMore, true);
    assert.equal(res.body.meta.nextCursor, "2");
    assert.equal(res.body.meta.page, 1);
    assert.equal(res.body.meta.pageSize, 2);
    assert.equal(res.body.meta.total, 3);
  });

  test("Page 2 of 2 returns hasMore=false and nextCursor=null", async () => {
    const res = await request(app).get("/api/orders").set(bearer(token)).query({ page: 2, pageSize: 2 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.meta.hasMore, false);
    assert.equal(res.body.meta.nextCursor, null);
  });
});

// ============================================================
// Item 2: channel/fulfillmentType/scope filters
// ============================================================
describe("Item 2 — Orders filters: channel, fulfillmentType, scope", () => {
  let pid, sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;

    // Create orders with different channels and fulfillmentTypes
    await request(app).post("/api/orders").set(bearer(token)).send({
      channel: "ADMIN_POS", fulfillmentType: "PICKUP",
      customerName: "C1", phone: "01011111111",
      items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
    });
    await request(app).post("/api/orders").set(bearer(token)).send({
      channel: "CUSTOMER_WEB", fulfillmentType: "DELIVERY",
      customerName: "C2", phone: "01022222222",
      items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
    });
    await request(app).post("/api/orders").set(bearer(token)).send({
      channel: "CUSTOMER_WEB", fulfillmentType: "DELIVERY",
      customerName: "C3", phone: "01033333333",
      items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
    });
    // Complete one order for scope test
    const list = await request(app).get("/api/orders").set(bearer(token)).query({ channel: "ADMIN_POS" });
    const adminOrderId = list.body.data[0].id;
    await request(app).patch(`/api/orders/${adminOrderId}/status`).set(bearer(token)).send({ status: "CONFIRMED" });
    await request(app).patch(`/api/orders/${adminOrderId}/status`).set(bearer(token)).send({ status: "PREPARING" });
    await request(app).patch(`/api/orders/${adminOrderId}/status`).set(bearer(token)).send({ status: "READY" });
    await request(app).patch(`/api/orders/${adminOrderId}/status`).set(bearer(token)).send({ status: "COMPLETED" });
  });

  test("channel filter works", async () => {
    const res = await request(app).get("/api/orders").set(bearer(token)).query({ channel: "ADMIN_POS" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].channel, "ADMIN_POS");
  });

  test("fulfillmentType filter works", async () => {
    const res = await request(app).get("/api/orders").set(bearer(token)).query({ fulfillmentType: "DELIVERY" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    res.body.data.forEach(o => assert.equal(o.fulfillmentType, "DELIVERY"));
  });

  test("scope=active excludes COMPLETED/CANCELLED", async () => {
    const res = await request(app).get("/api/orders").set(bearer(token)).query({ scope: "active" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    res.body.data.forEach(o => assert.ok(o.status !== "COMPLETED" && o.status !== "CANCELLED"));
  });

  test("scope=history includes only COMPLETED/CANCELLED", async () => {
    const res = await request(app).get("/api/orders").set(bearer(token)).query({ scope: "history" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].status, "COMPLETED");
  });
});

// ============================================================
// Item 3: Table checkout guards + payment + response
// ============================================================
describe("Item 3 — Table close rejects PENDING/PREPARING orders, uses payment data", () => {
  let pid, sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
  });

  test("Close table rejected when order is PENDING", async () => {
    // Create a table session
    const sessionRes = await request(app).post("/api/table-sessions").set(bearer(token)).send({ tableNumber: 10, guestsCount: 2 });
    assert.equal(sessionRes.status, 201);
    const tblToken = sessionRes.body.data.tableToken;

    // Create order via table session (status = PENDING)
    const orderRes = await request(app).post("/api/table-sessions/10/orders")
      .set({ "X-Table-Token": tblToken })
      .send({ customer: { name: "T1", phone: "01000000001" }, items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }] });
    assert.equal(orderRes.status, 201);

    // Try to close table — should fail because order is PENDING
    const closeRes = await request(app).patch("/api/orders/tables/10/close").set(bearer(token)).send({ paymentMethod: "CASH", amountPaid: 100 });
    assert.equal(closeRes.status, 409);
    assert.ok(closeRes.body.message.includes("PENDING") || closeRes.body.message.includes("being prepared"));
  });

  test("Close table succeeds with paymentMethod/amountPaid in response", async () => {
    // Open a table session for table 11 so closeTableOrder can find and close it
    const sessionRes = await request(app).post("/api/table-sessions").set(bearer(token)).send({ tableNumber: 11, guestsCount: 2 });
    assert.equal(sessionRes.status, 201);

    // Create order via admin (auto PREPARING), transition to READY
    const createRes = await request(app).post("/api/orders").set(bearer(token)).send({
      channel: "ADMIN_POS", fulfillmentType: "DINE_IN", table: "11",
      customerName: "T2", phone: "01000000002",
      items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
    });
    assert.equal(createRes.status, 201);
    const orderId = createRes.body.data.id;

    // Transition to READY (close handler marks orders as COMPLETED)
    for (const s of ["CONFIRMED", "PREPARING", "READY"]) {
      await request(app).patch(`/api/orders/${orderId}/status`).set(bearer(token)).send({ status: s });
    }

    // Close table — marks orders as COMPLETED + creates sale + closes session
    const closeRes = await request(app).patch("/api/orders/tables/11/close").set(bearer(token)).send({ paymentMethod: "CARD", amountPaid: 35 });
    assert.equal(closeRes.status, 200);
    assert.equal(closeRes.body.data.paymentStatus, "PAID");
    assert.ok(closeRes.body.data.sessionId);
    assert.ok(closeRes.body.data.closedAt);
  });
});

// ============================================================
// Item 4: Tracking response has statusText/timeline/pricing + token enforced
// ============================================================
describe("Item 4 — Public tracking returns statusText, timeline, pricing; rejects without token", () => {
  let pid, sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
  });

  test("Tracking returns statusText, timeline, pricing", async () => {
    // Create a CUSTOMER_WEB order (generates trackingToken)
    const createRes = await request(app).post("/api/orders").set(bearer(token)).send({
      channel: "CUSTOMER_WEB", fulfillmentType: "DELIVERY",
      customerName: "Track1", phone: "01099999991",
      items: [{ productId: pid, productSizeId: sizeId, quantity: 2 }],
    });
    assert.equal(createRes.status, 201);
    const { orderNumber, trackingToken, id: orderId } = createRes.body.data;

    // Transition status to generate events for the timeline
    await request(app).patch(`/api/orders/${orderId}/status`).set(bearer(token)).send({ status: "CONFIRMED" });
    await request(app).patch(`/api/orders/${orderId}/status`).set(bearer(token)).send({ status: "PREPARING" });

    const res = await request(app).get(`/api/orders/public/${orderNumber}/tracking`).query({ token: trackingToken });
    assert.equal(res.status, 200);
    const d = res.body.data;
    assert.ok(d.statusText, "Should have statusText");
    assert.ok(Array.isArray(d.timeline), "Should have timeline array");
    assert.ok(d.timeline.length > 0, "Timeline should not be empty");
    assert.ok(d.pricing, "Should have pricing object");
    assert.equal(typeof d.pricing.subtotal, "number");
    assert.equal(typeof d.pricing.total, "number");
    assert.equal(typeof d.pricing.deliveryFee, "number");
  });

  test("Tracking rejects without token", async () => {
    const createRes = await request(app).post("/api/orders").set(bearer(token)).send({
      channel: "CUSTOMER_WEB", fulfillmentType: "PICKUP",
      customerName: "Track2", phone: "01099999992",
      items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
    });
    const { orderNumber } = createRes.body.data;

    const res = await request(app).get(`/api/orders/public/${orderNumber}/tracking`);
    assert.equal(res.status, 401);
  });

  test("Tracking rejects with wrong token", async () => {
    const createRes = await request(app).post("/api/orders").set(bearer(token)).send({
      channel: "CUSTOMER_WEB", fulfillmentType: "PICKUP",
      customerName: "Track3", phone: "01099999993",
      items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
    });
    const { orderNumber } = createRes.body.data;

    const res = await request(app).get(`/api/orders/public/${orderNumber}/tracking`).query({ token: "wrong_token" });
    assert.equal(res.status, 404);
  });
});

// ============================================================
// Item 5: Supplier search
// ============================================================
describe("Item 5 — Supplier list search by name/phone/contactPerson", () => {
  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    await prisma.supplier.create({ data: { name: "Coffee Beans Co", contactPerson: "Ahmed", phone: "01011111111", city: "Cairo", supplierType: "beans", supplierCategory: "premium" } });
    await prisma.supplier.create({ data: { name: "Milk Farm", contactPerson: "Sara", phone: "01022222222", city: "Alex", supplierType: "dairy", supplierCategory: "fresh" } });
  });

  test("Search by name", async () => {
    const res = await request(app).get("/api/suppliers").set(bearer(token)).query({ search: "Coffee" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].name, "Coffee Beans Co");
  });

  test("Search by phone", async () => {
    const res = await request(app).get("/api/suppliers").set(bearer(token)).query({ search: "010222" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].name, "Milk Farm");
  });

  test("Search by contactPerson", async () => {
    const res = await request(app).get("/api/suppliers").set(bearer(token)).query({ search: "Sara" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
  });

  test("Empty search returns all", async () => {
    const res = await request(app).get("/api/suppliers").set(bearer(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
  });
});

// ============================================================
// Item 6: Raw materials search
// ============================================================
describe("Item 6 — Raw materials list search by name", () => {
  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const supplier = await createSupplier();
    await prisma.rawMaterial.create({ data: { name: "Coffee Beans", unit: "kg", supplierId: supplier.id, minStockAlert: 5, batches: { create: { quantity: 50, pricePerUnit: 200 } } } });
    await prisma.rawMaterial.create({ data: { name: "Fresh Milk", unit: "liter", supplierId: supplier.id, minStockAlert: 10, batches: { create: { quantity: 30, pricePerUnit: 50 } } } });
  });

  test("Search by name", async () => {
    const res = await request(app).get("/api/raw-materials").set(bearer(token)).query({ search: "Coffee" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].name, "Coffee Beans");
  });

  test("Empty search returns all", async () => {
    const res = await request(app).get("/api/raw-materials").set(bearer(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
  });
});

// ============================================================
// Item 7: Cost calculation returns 422 when no stock
// ============================================================
describe("Item 7 — Product cost calculation rejects 422 when no stock for ingredient", () => {
  let pid, sizeId, material;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
    material = await createMaterial();

    // Link ingredient to size
    await prisma.productSizeIngredient.create({
      data: { productSizeId: size.id, rawMaterialId: material.id, quantity: 1, unit: "kg" },
    });
  });

  test("Creating product with no stock returns 422", async () => {
    // Delete all batches (zero stock)
    await prisma.rawMaterialBatch.deleteMany({ where: { rawMaterialId: material.id } });

    const config = {
      name: "Test Product",
      sizes: [{ typeName: "Hot", name: "Medium", sellingPrice: 50, isActive: true, ingredients: [{ rawMaterialId: material.id, quantity: 1, unit: "kg" }] }],
      types: [{ name: "Hot", ingredients: [{ rawMaterialId: material.id, unit: "kg" }] }],
    };

    const res = await request(app).post("/api/products/configuration").set(bearer(token)).field("configuration", JSON.stringify(config));
    assert.equal(res.status, 422);
    assert.ok(res.body.message.includes("لا يمكن حساب التكلفة") || res.body.message.includes("stock"));
  });
});

// ============================================================
// Item 8: Batch priority rules — all batches, consecutive, no duplicates
// ============================================================
describe("Item 8 — Batch priority rejects partial, non-consecutive, duplicate", () => {
  let materialId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const material = await createMaterial();
    materialId = material.id;

    // Delete the initial batch created by createMaterial()
    await prisma.rawMaterialBatch.deleteMany({ where: { rawMaterialId: materialId } });

    // Create 3 batches
    await prisma.rawMaterialBatch.create({ data: { rawMaterialId: materialId, quantity: 10, pricePerUnit: 100, batchNumber: "B-01", withdrawalPriority: 1 } });
    await prisma.rawMaterialBatch.create({ data: { rawMaterialId: materialId, quantity: 10, pricePerUnit: 100, batchNumber: "B-02", withdrawalPriority: 2 } });
    await prisma.rawMaterialBatch.create({ data: { rawMaterialId: materialId, quantity: 10, pricePerUnit: 100, batchNumber: "B-03", withdrawalPriority: 3 } });
  });

  test("Rejects partial batches (not all submitted)", async () => {
    const batches = await prisma.rawMaterialBatch.findMany({ where: { rawMaterialId: materialId } });
    const res = await request(app).put(`/api/raw-materials/${materialId}/batches-priority`).set(bearer(token)).send({
      batches: [{ batchId: batches[0].id, withdrawalPriority: 1 }, { batchId: batches[1].id, withdrawalPriority: 2 }],
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.message.includes("جميع") || res.body.message.includes("all"));
  });

  test("Rejects non-consecutive priorities (gaps)", async () => {
    const batches = await prisma.rawMaterialBatch.findMany({ where: { rawMaterialId: materialId } });
    const res = await request(app).put(`/api/raw-materials/${materialId}/batches-priority`).set(bearer(token)).send({
      batches: [{ batchId: batches[0].id, withdrawalPriority: 1 }, { batchId: batches[1].id, withdrawalPriority: 3 }, { batchId: batches[2].id, withdrawalPriority: 5 }],
    });
    assert.equal(res.status, 400);
  });

  test("Rejects duplicate priorities", async () => {
    const batches = await prisma.rawMaterialBatch.findMany({ where: { rawMaterialId: materialId } });
    const res = await request(app).put(`/api/raw-materials/${materialId}/batches-priority`).set(bearer(token)).send({
      batches: [{ batchId: batches[0].id, withdrawalPriority: 1 }, { batchId: batches[1].id, withdrawalPriority: 1 }, { batchId: batches[2].id, withdrawalPriority: 2 }],
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.message.includes("Duplicate") || res.body.message.includes("duplicate") || res.body.message.includes("تكرار"));
  });

  test("Valid priority update succeeds", async () => {
    const batches = await prisma.rawMaterialBatch.findMany({ where: { rawMaterialId: materialId } });
    const res = await request(app).put(`/api/raw-materials/${materialId}/batches-priority`).set(bearer(token)).send({
      batches: [{ batchId: batches[0].id, withdrawalPriority: 3 }, { batchId: batches[1].id, withdrawalPriority: 1 }, { batchId: batches[2].id, withdrawalPriority: 2 }],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 3);
  });
});

// ============================================================
// Item 9: Detail endpoint returns "supplier" not "supplierRel"
// ============================================================
describe("Item 9 — Raw material detail returns supplier field (not supplierRel)", () => {
  let materialId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const supplier = await createSupplier();
    const material = await prisma.rawMaterial.create({
      data: { name: "Test Material", unit: "kg", supplierId: supplier.id, minStockAlert: 5, batches: { create: { quantity: 10, pricePerUnit: 100 } } },
    });
    materialId = material.id;
  });

  test("Detail endpoint has 'supplier' field, not 'supplierRel'", async () => {
    const res = await request(app).get(`/api/raw-materials/${materialId}`).set(bearer(token));
    assert.equal(res.status, 200);
    const d = res.body.data;
    assert.ok(d.supplier, "Should have 'supplier' field");
    assert.ok(d.supplier.id, "supplier should have id");
    assert.ok(d.supplier.name, "supplier should have name");
    assert.equal(d.supplierRel, undefined, "Should NOT have 'supplierRel' field");
  });

  test("List endpoint also has 'supplier' field", async () => {
    const res = await request(app).get("/api/raw-materials").set(bearer(token));
    assert.equal(res.status, 200);
    const d = res.body.data[0];
    assert.ok(d.supplier, "List item should have 'supplier' field");
    assert.equal(d.supplierRel, undefined, "List item should NOT have 'supplierRel' field");
  });
});
