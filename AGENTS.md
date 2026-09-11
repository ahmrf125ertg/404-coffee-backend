# AGENTS.md

## Idempotency

**Status:** Partial — only `POST /api/orders` and `PATCH /api/orders/:id/status` use `Idempotency-Key` header protection.

**How it works:** Client sends `Idempotency-Key` header. Server checks `order_idempotency` table (24h TTL). If key exists, returns cached response. After success, stores response. Expired rows cleaned hourly.

**Full details:** See `docs/idempotency-status.md`

**Other write endpoints** rely on business-logic guards (status transitions, existence checks) rather than explicit idempotency keys.
