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

describe("Orders Rebuild — State Machine", () => {
  let pid, sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
  });

  test("PENDING → CONFIRMED is valid", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(bearer(token))
      .send({ status: "CONFIRMED" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.order.status, "CONFIRMED");
  });

  test("PENDING → DELIVERED is rejected (INVALID_STATUS_TRANSITION)", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(bearer(token))
      .send({ status: "DELIVERED" });
    assert.equal(res.status, 409);
    assert.ok(res.body.message.includes("Cannot transition"));
  });

  test("PENDING → READY is rejected (must go through CONFIRMED/PREPARING)", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(bearer(token))
      .send({ status: "READY" });
    assert.equal(res.status, 409);
  });

  test("COMPLETED → CANCELLED is rejected (terminal state)", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    // PENDING → CONFIRMED → PREPARING → READY → COMPLETED
    for (const status of ["CONFIRMED", "PREPARING", "READY", "COMPLETED"]) {
      await request(app)
        .patch(`/api/orders/${id}/status`)
        .set(bearer(token))
        .send({ status });
    }

    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(bearer(token))
      .send({ status: "CANCELLED", reason: "test cancel" });
    assert.equal(res.status, 409);
  });

  test("Full DELIVERY lifecycle: PENDING→CONFIRMED→PREPARING→READY→COMPLETED", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "DELIVERY",
        customerName: "Delivery Test",
        phone: "01012345678",
        deliveryAddress: { city: "Cairo", street: "123" },
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    const steps = ["CONFIRMED", "PREPARING", "READY", "COMPLETED"];
    for (const status of steps) {
      const res = await request(app)
        .patch(`/api/orders/${id}/status`)
        .set(bearer(token))
        .send({ status });
      assert.equal(res.status, 200, `Transition to ${status} failed: ${res.body.message}`);
    }

    const final = await request(app)
      .get(`/api/orders/${id}`)
      .set(bearer(token));
    assert.equal(final.body.data.status, "COMPLETED");
  });

  test("CANCELLED is terminal — cannot transition from CANCELLED", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    const id = created.body.data.id;

    await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(bearer(token))
      .send({ status: "CANCELLED", reason: "test cancel" });

    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(bearer(token))
      .send({ status: "PENDING" });
    assert.equal(res.status, 409);
  });
});

describe("Orders Rebuild — Idempotency", () => {
  let pid, sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
  });

  test("Same Idempotency-Key returns cached response without duplicate", async () => {
    const key = "test-idempotency-" + Date.now();

    const res1 = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .set("Idempotency-Key", key)
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(res1.status, 201);
    const orderId = res1.body.data.id;

    const res2 = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .set("Idempotency-Key", key)
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });

    assert.equal(res2.status, 201);
    assert.equal(res2.body.data.id, orderId, "Should return same order, not create a duplicate");
  });

  test("Different Idempotency-Keys create separate orders", async () => {
    const key1 = "key-a-" + Date.now();
    const key2 = "key-b-" + Date.now();

    const res1 = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .set("Idempotency-Key", key1)
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(res1.status, 201);

    const res2 = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .set("Idempotency-Key", key2)
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(res2.status, 201);
    assert.notEqual(res1.body.data.id, res2.body.data.id, "Different keys should create different orders");
  });
});

describe("Orders Rebuild — Delegate Handover Validation", () => {
  let pid, sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
  });

  test("Hand-over rejected when order is not DELIVERY type", async () => {
    const delegate = await prisma.delegate.create({
      data: { name: "Ali", phone: "01000000000", whatsapp: "01000000000" },
    });

    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    // Move to READY
    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "CONFIRMED" });
    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "PREPARING" });
    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "READY" });

    const res = await request(app)
      .patch(`/api/orders/${id}/hand-over-delegate`)
      .set(bearer(token))
      .send({ delegateId: delegate.id });
    assert.equal(res.status, 409);
    assert.ok(res.body.message.includes("DELIVERY"));
  });

  test("Hand-over rejected when order is not READY status", async () => {
    const delegate = await prisma.delegate.create({
      data: { name: "Ali", phone: "01000000000", whatsapp: "01000000000" },
    });

    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "DELIVERY",
        customerName: "Test",
        phone: "01012345678",
        deliveryAddress: { city: "Cairo" },
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    const res = await request(app)
      .patch(`/api/orders/${id}/hand-over-delegate`)
      .set(bearer(token))
      .send({ delegateId: delegate.id });
    assert.equal(res.status, 409);
    assert.ok(res.body.message.includes("READY"));
  });

  test("Hand-over rejected when delegate not found", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "DELIVERY",
        customerName: "Test",
        phone: "01012345678",
        deliveryAddress: { city: "Cairo" },
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "CONFIRMED" });
    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "PREPARING" });
    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "READY" });

    const res = await request(app)
      .patch(`/api/orders/${id}/hand-over-delegate`)
      .set(bearer(token))
      .send({ delegateId: 99999 });
    assert.equal(res.status, 404);
  });

  test("Hand-over rejected when order already assigned", async () => {
    const delegate = await prisma.delegate.create({
      data: { name: "Ali", phone: "01000000000", whatsapp: "01000000000" },
    });

    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "DELIVERY",
        customerName: "Test",
        phone: "01012345678",
        deliveryAddress: { city: "Cairo" },
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "CONFIRMED" });
    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "PREPARING" });
    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "READY" });

    // First assignment succeeds
    const res1 = await request(app)
      .patch(`/api/orders/${id}/hand-over-delegate`)
      .set(bearer(token))
      .send({ delegateId: delegate.id });
    assert.equal(res1.status, 200);

    // Second assignment rejected
    const delegate2 = await prisma.delegate.create({
      data: { name: "Bob", phone: "01000000001", whatsapp: "01000000001" },
    });
    const res2 = await request(app)
      .patch(`/api/orders/${id}/hand-over-delegate`)
      .set(bearer(token))
      .send({ delegateId: delegate2.id });
    assert.equal(res2.status, 409, "Should reject re-assignment");
  });

  test("Hand-over succeeds with all conditions met", async () => {
    const delegate = await prisma.delegate.create({
      data: { name: "Ali", phone: "01000000000", whatsapp: "01000000000" },
    });

    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "DELIVERY",
        customerName: "Test",
        phone: "01012345678",
        deliveryAddress: { city: "Cairo" },
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "CONFIRMED" });
    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "PREPARING" });
    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "READY" });

    const res = await request(app)
      .patch(`/api/orders/${id}/hand-over-delegate`)
      .set(bearer(token))
      .send({ delegateId: delegate.id });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "ASSIGNED_TO_DELEGATE");
    assert.equal(res.body.data.delegate.id, delegate.id);
  });
});

describe("Orders Rebuild — Admin Auto-PREPARING", () => {
  let pid, sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
  });

  test("ADMIN_POS order auto-starts at PREPARING", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Cashier Order",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.status, "PREPARING", "ADMIN_POS orders should auto-start at PREPARING");
  });

  test("CUSTOMER_WEB order stays at PENDING", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.status, "PENDING", "CUSTOMER_WEB orders should stay PENDING");
  });
});

describe("Orders Rebuild — Cancel Order Validation", () => {
  let pid, sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
  });

  test("Cannot cancel COMPLETED order", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    const id = created.body.data.id;

    // ADMIN_POS auto-starts at PREPARING, go to READY then COMPLETED
    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "READY" });
    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "COMPLETED" });

    const res = await request(app)
      .post(`/api/orders/${id}/cancel`)
      .set(bearer(token))
      .send({ reason: "test" });
    assert.ok(res.status >= 400, "Should reject cancel of completed order");
  });

  test("Cannot delete COMPLETED order", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    const id = created.body.data.id;

    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "READY" });
    await request(app).patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status: "COMPLETED" });

    const res = await request(app)
      .delete(`/api/orders/${id}`)
      .set(bearer(token));
    assert.ok(res.status >= 400, "Should reject delete of completed order");
  });
});

describe("Orders Rebuild — Public Lookup", () => {
  let pid, sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
  });

  test("GET /api/orders/public/lookup requires orderNumber and phone", async () => {
    const res = await request(app)
      .get("/api/orders/public/lookup");
    assert.equal(res.status, 400);
  });

  test("GET /api/orders/public/lookup returns not found for nonexistent order", async () => {
    const res = await request(app)
      .get("/api/orders/public/lookup?orderNumber=NONEXISTENT&phone=01012345678");
    assert.equal(res.status, 404);
  });

  test("GET /api/orders/public/by-phone requires phone", async () => {
    const res = await request(app)
      .get("/api/orders/public/by-phone");
    assert.equal(res.status, 400);
  });
});

describe("Orders Rebuild — Payment Recording", () => {
  let pid, sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
  });

  test("POST /api/orders/:id/payments records payment", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 2 }],
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    const res = await request(app)
      .post(`/api/orders/${id}/payments`)
      .set(bearer(token))
      .send({ method: "CASH", amount: 70 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "PAID");
  });

  test("POST /api/orders/:id/payments rejects invalid method", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "CUSTOMER_WEB",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    const id = created.body.data.id;

    const res = await request(app)
      .post(`/api/orders/${id}/payments`)
      .set(bearer(token))
      .send({ method: "INVALID", amount: 35 });
    assert.equal(res.status, 400);
  });
});

describe("Orders Rebuild — Validation Errors", () => {
  let pid, sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
  });

  test("CREATE with invalid channel returns error code", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "INVALID",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "INVALID_CHANNEL");
  });

  test("CREATE with no items returns EMPTY_ORDER", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        orderType: "tables",
        table: "T1",
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "EMPTY_ORDER");
  });

  test("STATUS update with invalid status returns INVALID_ORDER_STATUS", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        channel: "ADMIN_POS",
        fulfillmentType: "PICKUP",
        customerName: "Test",
        phone: "01012345678",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    const id = created.body.data.id;

    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(bearer(token))
      .send({ status: "INVALID_STATUS" });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "INVALID_ORDER_STATUS");
  });
});
