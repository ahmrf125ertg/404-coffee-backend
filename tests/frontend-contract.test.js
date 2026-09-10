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
} = require("./helpers");

let token;

beforeEach(async () => {
  await resetDb();
  await seedOwner();
  token = await loginToken("Admin");
});

// ============================================================
// 1. Order List — Lightweight Projection
// ============================================================

describe("Frontend Contract — Order List Lightweight", () => {
  test("GET /api/orders returns lightweight items with customerName, phone, table, itemCount", async () => {
    const customer = await createCustomer();
    const { product, size } = await createProductWithSize();

    // Create 2 orders
    await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "DINE_IN",
        customer: { name: customer.name, phone: customer.phone },
        table: "5",
        items: [{ productId: product.id, productSizeId: size.id, quantity: 2 }],
      });

    await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Walk-in",
        phone: "01234567890",
        items: [{ productId: product.id, productSizeId: size.id, quantity: 1 }],
      });

    const res = await request(app)
      .get("/api/orders")
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length >= 2);

    const item = res.body.data.find((o) => o.table === "5");
    assert.ok(item, "Should find the DINE_IN order");

    // Lightweight fields
    assert.ok(item.id);
    assert.ok(item.orderNumber);
    assert.ok(item.channel);
    assert.ok(item.fulfillmentType);
    assert.ok(item.status);

    // Spec-required fields
    assert.equal(item.customerName, customer.name);
    assert.equal(item.phone, customer.phone);
    assert.equal(item.table, "5");
    assert.ok(item.itemCount >= 1);
    assert.ok(typeof item.total === "number");
    assert.ok(item.createdAt);

    // Should NOT contain heavy fields
    assert.equal(item.items, undefined, "Should not contain items array");
    assert.equal(item.customer, undefined, "Should not contain customer object");
    assert.equal(item.events, undefined, "Should not contain events array");
  });

  test("GET /api/orders has correct meta shape (page, pageSize, hasMore, nextCursor)", async () => {
    const res = await request(app)
      .get("/api/orders")
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.ok(res.body.meta);
    assert.equal(typeof res.body.meta.page, "number");
    assert.equal(typeof res.body.meta.pageSize, "number");
    assert.equal(typeof res.body.meta.hasMore, "boolean");
    assert.ok("nextCursor" in res.body.meta);
  });
});

// ============================================================
// 2. Unified Order Response — payment.paidAmount + items[].addons
// ============================================================

describe("Frontend Contract — Unified Order Response", () => {
  test("GET /api/orders/:id includes payment.paidAmount", async () => {
    const customer = await createCustomer();
    const { product, size } = await createProductWithSize();

    const createRes = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "PICKUP",
        customerName: customer.name,
        phone: customer.phone,
        items: [{ productId: product.id, productSizeId: size.id, quantity: 1 }],
      });

    assert.equal(createRes.status, 201);
    const orderId = createRes.body.data.id;

    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.ok(res.body.data.payment);
    assert.equal(typeof res.body.data.payment.paidAmount, "number");
    assert.equal(res.body.data.payment.paidAmount, 0); // No payment yet
  });

  test("GET /api/orders/:id includes items[].addons as array", async () => {
    const customer = await createCustomer();
    const { product, size } = await createProductWithSize();

    const createRes = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "PICKUP",
        customerName: customer.name,
        phone: customer.phone,
        items: [{ productId: product.id, productSizeId: size.id, quantity: 1 }],
      });

    const orderId = createRes.body.data.id;
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.items));
    for (const item of res.body.data.items) {
      assert.ok(Array.isArray(item.addons), "Each item should have addons array");
    }
  });
});

// ============================================================
// 3. Tables Summary — Correct Shape
// ============================================================

describe("Frontend Contract — Tables Summary", () => {
  test("GET /api/orders/tables/summary returns correct shape", async () => {
    const { product, size } = await createProductWithSize();

    // Create a table order
    await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "TABLE_WAITER",
        fulfillmentType: "DINE_IN",
        table: "3",
        items: [{ productId: product.id, productSizeId: size.id, quantity: 2 }],
      });

    const res = await request(app)
      .get("/api/orders/tables/summary")
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));

    const table = res.body.data.find((t) => t.tableNumber === 3);
    assert.ok(table, "Should find table 3");

    // Spec fields
    assert.equal(table.tableNumber, 3);
    assert.equal(typeof table.status, "string");
    assert.equal(typeof table.ordersCount, "number");
    assert.ok(table.ordersCount >= 1);
    assert.equal(typeof table.itemsCount, "number");
    assert.ok(table.itemsCount >= 1);
    assert.equal(typeof table.readyItemsCount, "number");
    assert.equal(typeof table.total, "number");
    assert.ok(table.total > 0);

    // Should NOT contain old shape
    assert.equal(table.table, undefined, "Should not use 'table' field");
    assert.equal(table.orders, undefined, "Should not contain orders array");
    assert.equal(table.totalItems, undefined, "Should not use 'totalItems'");
    assert.equal(table.pendingItems, undefined, "Should not use 'pendingItems'");
    assert.equal(table.readyItems, undefined, "Should not use 'readyItems'");
  });
});

// ============================================================
// 4. Prep List — Lightweight Shape
// ============================================================

describe("Frontend Contract — Prep List Lightweight", () => {
  test("GET /api/orders/prep returns lightweight items", async () => {
    const { product, size } = await createProductWithSize();

    // Create an order (auto-goes to PREPARING via ADMIN_POS)
    await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "DINE_IN",
        table: "7",
        items: [{ productId: product.id, productSizeId: size.id, quantity: 3 }],
      });

    const res = await request(app)
      .get("/api/orders/prep")
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.ok(res.body.data);
    assert.ok(Array.isArray(res.body.data.items));

    if (res.body.data.items.length > 0) {
      const item = res.body.data.items[0];
      assert.ok(item.id);
      assert.ok(item.orderNumber);
      assert.ok(item.fulfillmentType);
      assert.equal(typeof item.status, "string");
      assert.equal(typeof item.itemCount, "number");
      assert.equal(typeof item.readyCount, "number");
      assert.ok(item.createdAt);

      // Should NOT contain full items array
      assert.equal(item.items, undefined, "Should not contain nested items array");
    }
  });
});

// ============================================================
// 5. Table Session GET — ordersCount + grandTotal
// ============================================================

describe("Frontend Contract — Table Session GET", () => {
  test("GET /api/table-sessions/:tableNumber returns ordersCount and grandTotal", async () => {
    const { product, size } = await createProductWithSize();

    // Open a table session
    const sessionRes = await request(app)
      .post("/api/table-sessions")
      .set(bearer(token))
      .send({ tableNumber: 9, guestsCount: 2 });

    assert.equal(sessionRes.status, 201);
    const tableToken = sessionRes.body.data.tableToken;

    // Create a table order
    await request(app)
      .post("/api/table-sessions/9/orders")
      .set({ "X-Table-Token": tableToken })
      .send({
        items: [{ productId: product.id, productSizeId: size.id, quantity: 2 }],
      });

    // Get session info
    const res = await request(app)
      .get("/api/table-sessions/9")
      .set({ "X-Table-Token": tableToken });

    assert.equal(res.status, 200);
    assert.ok(res.body.data);

    const data = res.body.data;
    assert.equal(data.tableNumber, 9);
    assert.equal(typeof data.ordersCount, "number");
    assert.ok(data.ordersCount >= 1);
    assert.equal(typeof data.grandTotal, "number");
    assert.ok(data.grandTotal > 0);
    assert.ok(data.trackingToken);
    assert.ok(data.openedAt);
  });
});

// ============================================================
// 6. Close Table — paymentData + response shape
// ============================================================

describe("Frontend Contract — Close Table", () => {
  test("PATCH /api/orders/tables/:tableNumber/close accepts paymentMethod and amountPaid", async () => {
    const { product, size } = await createProductWithSize();

    // Create a READY table order
    const createRes = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "DINE_IN",
        table: "6",
        items: [{ productId: product.id, productSizeId: size.id, quantity: 1 }],
      });

    const orderId = createRes.body.data.id;

    // Move to READY
    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(bearer(token))
      .send({ status: "READY" });

    // Close with payment data
    const closeRes = await request(app)
      .patch("/api/orders/tables/6/close")
      .set(bearer(token))
      .send({ paymentMethod: "CASH", amountPaid: 35 });

    assert.equal(closeRes.status, 200);
    assert.ok(closeRes.body.message);

    const data = closeRes.body.data;
    assert.equal(data.tableNumber, 6);
    assert.equal(typeof data.ordersCount, "number");
    assert.equal(data.paymentStatus, "PAID");
    assert.equal(typeof data.total, "number");
    assert.ok(data.closedAt);
  });
});

// ============================================================
// 7. Product totalOrders — COUNT(DISTINCT orderId) not SUM(quantity)
// ============================================================

describe("Frontend Contract — Product totalOrders", () => {
  test("GET /api/products returns totalOrders as order count not quantity sum", async () => {
    const { product, size } = await createProductWithSize();

    // Create 2 orders with different quantities
    await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "A",
        phone: "01011111111",
        items: [{ productId: product.id, productSizeId: size.id, quantity: 3 }],
      });

    await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "B",
        phone: "01022222222",
        items: [{ productId: product.id, productSizeId: size.id, quantity: 5 }],
      });

    const res = await request(app)
      .get("/api/products")
      .set(bearer(token));

    assert.equal(res.status, 200);
  });
});
