# Idempotency Status

## Implemented

| Operation | Endpoint | Method | Mechanism | TTL | File:Line |
|-----------|----------|--------|-----------|-----|-----------|
| Create order | `POST /api/orders` | POST | `Idempotency-Key` header → DB lookup/upsert in `order_idempotency` table | 24h | `order.controller.js:22-45` |
| Update order status | `PATCH /api/orders/:id/status` | PATCH | Same mechanism as above | 24h | `order.controller.js:234-255` |

**Implementation details:**
- Client sends `Idempotency-Key` header (any unique string, e.g. UUID)
- `checkIdempotency(key)` queries `order_idempotency` table; if key exists and not expired, returns cached response
- After successful execution, `storeIdempotency(key, endpoint, statusCode, body)` saves the full response
- Expired rows cleaned up hourly via `cleanupExpiredIdempotency()` in `src/server.js:67-74`
- DB model: `OrderIdempotency` with `key @unique`, indexes on `key` and `expiresAt`

## Not Implemented (by design)

| Operation | Endpoint | Risk Level | Reason |
|-----------|----------|------------|--------|
| Update order | `PUT /api/orders/:id` | Low | Admin-only, idempotent by nature (overwrite) |
| Delete order | `DELETE /api/orders/:id` | Low | Admin-only, fails if already deleted |
| Cancel order | `POST /api/orders/:id/cancel` | Low | Status guard prevents double-cancel |
| Start preparation | `POST /api/orders/:id/preparation/start` | Low | Status guard (must be CONFIRMED) |
| Mark item ready | `POST /api/orders/:id/items/:itemId/ready` | Low | Status guard |
| Reopen item | `POST /api/orders/:id/items/:itemId/reopen` | Low | Status guard |
| Record payment | `POST /api/orders/:id/payments` | Low | Creates new record, not destructive |
| Complete delivery | `POST /api/orders/:id/delivery/complete` | Low | Status guard |
| Hand over to delegate | `PATCH /api/orders/:id/hand-over-delegate` | Low | Guard checks existing delegate |
| Close table | `PATCH /api/orders/tables/:tableNumber/close` | Low | Creates sale + closes session, status guard |
| Create table order | `POST /api/tables/:tableNumber/orders` | Low | Creates new record |
| Add table items | `POST /api/tables/:tableNumber/items` | Low | Creates new records |
| Checkout table | `POST /api/tables/:tableNumber/checkout` | Low | Similar to close table |

**Why these are lower risk:** Most write endpoints have business-logic guards (status transitions, existence checks) that prevent destructive double-execution. The two endpoints with idempotency protection (`createOrder` and `updateOrderStatus`) are the highest-volume and highest-impact operations.

## Recommendation

**Current coverage is sufficient for a v1 API.** The two most critical operations (order creation and status changes) are protected. Extending idempotency to all write endpoints would add complexity with minimal benefit at this scale. Revisit if the API faces high-concurrency or retry-heavy clients.

## Related

- `src/modules/orders/order.idempotency.js` — utility functions
- `prisma/schema.prisma:836-848` — `OrderIdempotency` model
- `src/modules/attendance/attendance.service.js:14-72` — different pattern: DB unique constraint idempotency
