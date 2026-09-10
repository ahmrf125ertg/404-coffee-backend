const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const path = require("path");

try { require("dotenv/config"); } catch (_) {}

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  (process.env.DATABASE_URL || "").replace(/\/[^/]+$/, "/coffee_404_test");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = TEST_DB_URL;

const { execSync } = require("child_process");
execSync("./node_modules/.bin/prisma migrate deploy", {
  stdio: "ignore",
  env: { ...process.env, DATABASE_URL: TEST_DB_URL },
});

const prisma = require("../src/lib/prisma");
const app = require("../src/app");
const { initSocket } = require("../src/websocket/socket.server");

let server;
let ioServer;
let baseUrl;

// ── helpers ────────────────────────────────────────────────
const TABLE_NAMES = [
  "order_item_addons", "auth_sessions", "order_events", "attendance",
  "employee_devices", "user_page_access", "cash_drawer_transactions",
  "cash_drawer_shifts", "audit_logs", "settings", "sale_items", "sales",
  "order_items", "orders", "table_sessions", "service_requests",
  "return_items", "returns", "purchase_items", "purchases",
  "product_type_ingredients", "product_size_ingredients", "product_addons",
  "product_sizes", "product_types", "products", "raw_material_batches",
  "raw_materials", "delegates", "suppliers", "customers", "users",
];

const resetDb = async () => {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica';`);
  for (const t of TABLE_NAMES) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${t}";`);
  }
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin';`);
};

const seedAdmin = async () => {
  const bcrypt = require("bcryptjs");
  const hash = await bcrypt.hash("root123", 10);
  return prisma.user.create({
    data: { name: "Admin", passwordHash: hash, position: "OWNER", role: "OWNER", status: "ACTIVE" },
  });
};

const login = async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Admin", password: "root123" }),
  });
  const json = await res.json();
  return json.data?.auth?.access_token;
};

const httpPost = (url, token, body) =>
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

const httpPatch = (url, token, body) =>
  fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── setup / teardown ───────────────────────────────────────
before(async () => {
  await resetDb();
  await seedAdmin();

  // Seed a product + size so order creation works
  const product = await prisma.product.create({ data: { name: "Espresso" } });
  const size = await prisma.productSize.create({
    data: { productId: product.id, typeName: "Hot", name: "Medium", basePrice: 30, finalPrice: 35 },
  });

  // Store for test use
  globalThis._testProduct = product;
  globalThis._testSize = size;

  server = http.createServer(app);
  ioServer = initSocket(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
  globalThis._baseUrl = baseUrl;
});

after(async () => {
  await prisma.$disconnect();
  if (server) server.close();
});

// ── tests ──────────────────────────────────────────────────
describe("WebSocket room isolation — live two-client test", () => {
  it("Client A receives events only for Order A; Client B receives nothing", async () => {
    const token = await login();
    const product = globalThis._testProduct;
    const size = globalThis._testSize;

    // Create Order A (CUSTOMER_WEB — generates tracking token)
    const orderARes = await httpPost(`${baseUrl}/api/orders`, token, {
      channel: "CUSTOMER_WEB",
      fulfillmentType: "PICKUP",
      customerName: "Customer A",
      phone: "01000000001",
      items: [{ productId: product.id, productSizeId: size.id, quantity: 1 }],
    });
    assert.equal(orderARes.status, 201, "Order A creation failed: " + JSON.stringify(orderARes.body));
    const orderA = orderARes.body.data;
    assert.ok(orderA.trackingToken, "Order A should have a tracking token");

    // Create Order B (CUSTOMER_WEB — generates tracking token)
    const orderBRes = await httpPost(`${baseUrl}/api/orders`, token, {
      channel: "CUSTOMER_WEB",
      fulfillmentType: "PICKUP",
      customerName: "Customer B",
      phone: "01000000002",
      items: [{ productId: product.id, productSizeId: size.id, quantity: 1 }],
    });
    assert.equal(orderBRes.status, 201, "Order B creation failed: " + JSON.stringify(orderBRes.body));
    const orderB = orderBRes.body.data;
    assert.ok(orderB.trackingToken, "Order B should have a tracking token");

    // Verify tokens are different
    assert.notEqual(orderA.trackingToken, orderB.trackingToken, "Tracking tokens must differ");

    // Connect Client A via socket.io-client (tracking token auth → auto-joins order:<id> room)
    const { io: Client } = require("socket.io-client");
    const clientA = Client(baseUrl, {
      auth: { trackingToken: orderA.trackingToken },
      transports: ["websocket"],
      reconnection: false,
    });

    // Connect Client B
    const clientB = Client(baseUrl, {
      auth: { trackingToken: orderB.trackingToken },
      transports: ["websocket"],
      reconnection: false,
    });

    // Wait for both to connect
    await Promise.all([
      new Promise((resolve, reject) => {
        clientA.on("connect", resolve);
        clientA.on("connect_error", reject);
      }),
      new Promise((resolve, reject) => {
        clientB.on("connect", resolve);
        clientB.on("connect_error", reject);
      }),
    ]);

    assert.ok(clientA.connected, "Client A should be connected");
    assert.ok(clientB.connected, "Client B should be connected");

    // Collect events from both clients
    const eventsA = [];
    const eventsB = [];
    clientA.on("order:updated", (data) => eventsA.push(data));
    clientB.on("order:updated", (data) => eventsB.push(data));

    // Wait a beat for room joins to settle
    await sleep(200);

    // Update Order A status: PENDING → CONFIRMED
    const updateRes = await httpPatch(
      `${baseUrl}/api/orders/${orderA.id}/status`,
      token,
      { status: "CONFIRMED" }
    );
    assert.equal(updateRes.status, 200, "Status update failed: " + JSON.stringify(updateRes.body));

    // Wait for events to propagate
    await sleep(1000);

    // PROOF: Client A received the order:updated event
    assert.ok(eventsA.length > 0, `[CLIENT A] Should receive order:updated for Order A. Events received: ${eventsA.length}`);
    const eventForA = eventsA.find((e) => e.order?.id === orderA.id);
    assert.ok(eventForA, `[CLIENT A] Should receive event for Order A (id=${orderA.id}). Got: ${JSON.stringify(eventsA.map(e => e.order?.id))}`);
    assert.equal(eventForA.order.status, "CONFIRMED", `[CLIENT A] Event status should be CONFIRMED`);

    // PROOF: Client B did NOT receive the event for Order A
    const eventForAOnB = eventsB.find((e) => e.order?.id === orderA.id);
    assert.equal(eventForAOnB, undefined, `[CLIENT B] Should NOT receive event for Order A. Events: ${JSON.stringify(eventsB.map(e => ({ id: e.order?.id, status: e.order?.status })))}`);

    clientA.disconnect();
    clientB.disconnect();
  });

  it("Tracking client cannot join another order's room via join-room", async () => {
    const token = await login();
    const product = globalThis._testProduct;
    const size = globalThis._testSize;

    // Create Order A (CUSTOMER_WEB)
    const orderARes = await httpPost(`${baseUrl}/api/orders`, token, {
      channel: "CUSTOMER_WEB",
      fulfillmentType: "PICKUP",
      customerName: "Room Test A",
      phone: "01000000003",
      items: [{ productId: product.id, productSizeId: size.id, quantity: 1 }],
    });
    assert.equal(orderARes.status, 201);
    const orderA = orderARes.body.data;

    // Create Order B (CUSTOMER_WEB)
    const orderBRes = await httpPost(`${baseUrl}/api/orders`, token, {
      channel: "CUSTOMER_WEB",
      fulfillmentType: "PICKUP",
      customerName: "Room Test B",
      phone: "01000000004",
      items: [{ productId: product.id, productSizeId: size.id, quantity: 1 }],
    });
    assert.equal(orderBRes.status, 201);
    const orderB = orderBRes.body.data;

    // Connect Client A (authenticated with Order A's tracking token)
    const { io: Client } = require("socket.io-client");
    const clientA = Client(baseUrl, {
      auth: { trackingToken: orderA.trackingToken },
      transports: ["websocket"],
      reconnection: false,
    });

    await new Promise((resolve, reject) => {
      clientA.on("connect", resolve);
      clientA.on("connect_error", reject);
    });

    // Track events on Client A
    const eventsOnA = [];
    clientA.on("order:updated", (data) => eventsOnA.push(data));

    // Client A tries to JOIN Order B's room (should be silently rejected)
    clientA.emit("join-room", `order:${orderB.id}`);
    await sleep(300);

    // Update Order B status to trigger event
    await httpPatch(
      `${baseUrl}/api/orders/${orderB.id}/status`,
      token,
      { status: "CONFIRMED" }
    );
    await sleep(1000);

    // PROOF: Client A did NOT receive Order B's event (join was rejected)
    const orderBEvent = eventsOnA.find((e) => e.order?.id === orderB.id);
    assert.equal(orderBEvent, undefined,
      `[SECURITY] Client A (Order ${orderA.id}) should NOT receive events for Order ${orderB.id} after attempted room join. Events: ${JSON.stringify(eventsOnA.map(e => ({ id: e.order?.id })))}`
    );

    // PROOF: Client A also does NOT receive events for Order B via the admin "orders" room
    // (tracking clients don't join the "orders" room — only JWT clients do)
    const anyOrderBEvent = eventsOnA.find((e) => e.order?.id === orderB.id);
    assert.equal(anyOrderBEvent, undefined,
      `[SECURITY] Client A should not receive ANY event for Order B`
    );

    clientA.disconnect();
  });
});
