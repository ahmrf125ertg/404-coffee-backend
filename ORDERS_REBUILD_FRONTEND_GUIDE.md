# Orders & Table Sessions — Frontend Integration Guide

## Non-Obvious Routes (DO NOT GUESS)

These routes do **not** follow standard REST naming. Use these exact paths:

| Method | Path | Purpose |
|--------|------|---------|
| `PATCH` | `/api/orders/:id/hand-over-delegate` | Hand over a DELIVERY order to a delegate |
| `POST` | `/api/table-sessions/:tableNumber/service-requests` | Customer creates a service request (WAITER_CALL, etc.) |
| `POST` | `/api/table-sessions/:tableNumber/orders` | Customer creates an order from their table (requires `X-Table-Token`) |
| `GET` | `/api/table-sessions/:tableNumber/active-order` | Get the active order for a table (requires `X-Table-Token`) |
| `GET` | `/api/table-sessions/service-requests/all` | Admin: list all service requests |
| `PATCH` | `/api/table-sessions/service-requests/:id` | Admin: update service request status |
| `PATCH` | `/api/orders/:id/status` | Update order status (state machine enforced) |
| `POST` | `/api/orders/:id/preparation/start` | Start preparation for an order |
| `POST` | `/api/orders/:id/items/:itemId/ready` | Mark a specific order item as ready |
| `POST` | `/api/orders/:id/items/:itemId/reopen` | Reopen a completed order item |
| `POST` | `/api/orders/:id/cancel` | Cancel an order |
| `POST` | `/api/orders/:id/payments` | Record a payment for an order |
| `POST` | `/api/orders/:id/delivery/complete` | Complete delivery for an order |
| `PATCH` | `/api/orders/tables/:tableNumber/close` | Close a table order |
| `POST` | `/api/orders/tables/:tableNumber/orders` | Create order for a table (admin) |
| `POST` | `/api/orders/tables/:tableNumber/items` | Add items to a table order (admin) |
| `POST` | `/api/orders/tables/:tableNumber/checkout` | Checkout a table (admin) |
| `GET` | `/api/orders/public/lookup` | Lookup order by orderNumber + phone (no auth) |
| `GET` | `/api/orders/public/by-phone` | Get orders by phone (no auth) |
| `POST` | `/api/orders/public` | Create a public order (no auth, requires tracking) |
| `GET` | `/api/orders/public/:code/tracking` | Track order by tracking code (no auth) |

---

## WebSocket Connection

### Admin/Staff (JWT)

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:5000", {
  auth: { token: "eyJ..." }, // JWT access token
});

socket.on("connect", () => {
  console.log("Connected to admin channel");
});
```

**Auto-joined rooms**: `orders`, `kitchen`, `waiters:branch:1`, `preparation:branch:1`, `admin:branch:1`

### Customer Tracking (Tracking Token)

```javascript
const socket = io("http://localhost:5000", {
  auth: { trackingToken: "abc123..." },
});

socket.on("order:created", (data) => {
  console.log("Your order was created:", data.order);
});

socket.on("order:updated", (data) => {
  console.log("Your order was updated:", data.order.status);
});
```

**Auto-joined room**: `order:<orderId>` (restrictions enforced — cannot join other rooms)

### Events Received by Tracking Clients

| Event | Payload | When |
|-------|---------|------|
| `order:created` | `{ event, order: { id, orderNumber, status, total, ... } }` | Order created |
| `order:updated` | `{ event, order: { id, orderNumber, status, items, ... } }` | Status change |
| `order:item:updated` | `{ event, orderId, itemId, status, orderStatus, ... }` | Item status change |

### Events Received by Admin/Staff

All tracking events above PLUS:
- `table-service:created` — new service request
- `table-service:updated` — service request status changed
- `table-session:updated` — table session status changed
- `dashboard:updated` — dashboard data refresh
- `inventory:updated` — inventory changed

---

## Table Session Authentication

Customer-facing table routes require `X-Table-Token` header (NOT a JWT):

```javascript
// Customer at table 5
const res = await fetch("/api/table-sessions/5/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Table-Token": "tok_abc123...",
  },
  body: JSON.stringify({
    customer: { name: "Ahmed", phone: "01000000000" },
    items: [{ productId: 1, productSizeId: 1, quantity: 2 }],
  }),
});
```

The `X-Table-Token` is returned when the admin opens a table session:
```javascript
POST /api/table-sessions
{ "tableNumber": 5, "guestsCount": 4 }
// Response includes: trackingToken (used as X-Table-Token)
```

---

## Hand Over Order to Delegate

**Route**: `PATCH /api/orders/:id/hand-over-delegate`

**NOT** `/handover` — use this exact path.

```javascript
const res = await fetch(`/api/orders/${orderId}/hand-over-delegate`, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ delegateId: 123 }),
});
```

**Validations (in order)**:
1. Order must be `DELIVERY` fulfillment type
2. Order must be `READY` status
3. Order must not already have a delegate
4. Delegate must exist and be available
5. All items must be in `READY` status

---

## Service Request Types

When creating a service request via `POST /api/table-sessions/:tableNumber/service-requests`:

```json
{
  "type": "WAITER_CALL",
  "message": "Need more water please"
}
```

Available types: `WAITER_CALL`, `BILL_REQUEST`, `CLEANING`, `WATER_REFILL`, `COMPLAINT`, `OTHER`

---

## Order Status Flow

### PICKUP / DINE_IN

```
PENDING → CONFIRMED → PREPARING → READY → COMPLETED
                   ↘ CANCELLED     ↘ CANCELLED
```

### DELIVERY

```
PENDING → CONFIRMED → PREPARING → READY → ASSIGNED_TO_DELEGATE → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
                   ↘ CANCELLED     ↘ CANCELLED
```

### Admin POS (ADMIN_POS channel)

Orders are auto-set to `PREPARING` on creation.

---

## Frontend Gotchas

1. **Don't guess routes.** The two most commonly confused:
   - `PATCH /api/orders/:id/hand-over-delegate` (NOT `/handover`)
   - `POST /api/table-sessions/:tableNumber/service-requests` (NOT `/services`)

2. **Tracking token vs JWT.** Customer-facing table routes use `X-Table-Token` header, NOT `Authorization: Bearer ...`.

3. **Table order creation requires `customer` object.** When creating an order from a table:
   ```json
   {
     "customer": { "name": "Ahmed", "phone": "01000000000" },
     "items": [...]
   }
   ```

4. **ADMIN_POS orders auto-start at PREPARING.** Don't show a "PENDING" state for POS orders.

5. **WebSocket tracking clients are restricted.** A customer can only receive events for their own order. They cannot join other rooms.
