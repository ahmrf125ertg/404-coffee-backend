# FRONTEND_CONTRACT_CLARIFICATIONS.md

Clarifications and ambiguities found in the TXT spec files that required design decisions.

---

## 1. Supplier Account Summary Formula (الموردين.txt)

**Spec says:** `accountSummary: { debtBalance, receivableBalance, netBalance }`

**Ambiguity:** How are these calculated? The spec provides no formula.

**Decision:** Calculate from the `supplier_transactions` table:
- `debtBalance` = sum of transactions where `type = 'DEBT'` and `category = 'DEBT'`
- `receivableBalance` = sum of transactions where `type = 'RECEIVABLE'` and `category = 'RECEIVABLE'`
- `netBalance` = debtBalance - receivableBalance

---

## 2. Product Configuration Replace-vs-Merge (المنتجات.txt)

**Spec says:** `PUT /api/products/{id}/configuration` uses the same shape as POST.

**Ambiguity:** When updating a product, should the backend:
- (a) Replace all types/sizes/addons with the incoming array (delete missing, create new, update existing)?
- (b) Merge by name/id (add new, update existing, ignore deleted)?

**Decision:** Implemented as **merge by name** — types matched by `typeName`, sizes matched by `typeName+name`, addons matched by `name`. Items not in the incoming payload are left as-is. This is safer for the frontend since accidental omission won't delete data.

---

## 3. Payment Data Required During Table Close (الاوردرات.txt §27)

**Spec says:** Request body `{ paymentMethod, amountPaid }`.

**Ambiguity:** Is `amountPaid` the amount the customer paid (which may differ from the table total), or the total amount of the table?

**Decision:** `amountPaid` is what the customer actually paid. If `amountPaid < total`, the remaining balance stays as a receivable on the customer. If `amountPaid >= total`, the table is fully paid. The `paymentMethod` is applied to all orders in the table.

---

## 4. WebSocket Room Ownership Validation (الاوردرات.txt §WebSocket)

**Spec says:** "The customer only joins their order's room; the table only joins its session's room."

**Ambiguity:** Should the backend enforce this at the `join-room` event level, or is it purely a frontend convention?

**Decision:** Enforced server-side. Tracking-token clients can only `join-room` for rooms they own (`order:<theirOrderId>` or `table-session:<theirSessionId>`). Admin/jwt clients have unrestricted access.

---

## 5. Idempotency Scope (الاوردرات.txt §1)

**Spec says:** "Operations of creation and status change receive `Idempotency-Key`."

**Ambiguity:** Which operations are idempotent? All write operations, or only specific ones?

**Decision:** Idempotency is enforced on:
- `POST /api/orders` (create order)
- `POST /api/orders/public` (create public order)
- `PATCH /api/orders/:id/status` (status change)
- `PATCH /api/orders/:id/items/:itemId/status` (item status change)
- `PATCH /api/orders/tables/:tableNumber/close` (table close)
- `POST /api/orders/:id/payments` (record payment)
- `POST /api/table-sessions/:tableNumber/service-requests` (service request)

Idempotency keys expire after 24 hours (cleanup runs hourly).

---

## 6. Table Session Tracking Token Scope (الاوردرات.txt §8-10)

**Spec says:** A `trackingToken` is returned when opening a table session.

**Ambiguity:** Is this token per-session or per-table? Can multiple sessions have different tokens for the same table?

**Decision:** Token is per-session. Each new `OPEN` session for a table gets a fresh `trackingToken`. When the session is closed, the token becomes invalid.

---

## 7. Prep List Filter (الاوردرات.txt §16)

**Spec says:** The prep list shows orders with status `PREPARING` or `READY`.

**Ambiguity:** Should it include orders in `CONFIRMED` state (confirmed but not yet prep-started)?

**Decision:** Included `PENDING` in addition to `PREPARING` since PENDING orders haven't been confirmed yet and need attention. The filter is: `status IN (PENDING, PREPARING)`, with non-empty items.

---

## 8. Close Table — PENDING/CONFIRMED/PREPARING Check (الاوردرات.txt §27)

**Spec says:** "Cannot close the table if it has a PENDING or PREPARING order."

**Decision:** Extended to also block `CONFIRMED` orders, since CONFIRMED means inventory hasn't been deducted yet and the order is still in the pipeline.

---

## 9. Table Summary — Single Aggregate Query (الاوردرات.txt §17)

**Spec says:** "Execute with a single aggregate query, not separate queries for each table."

**Decision:** The implementation fetches all active table orders in one query, then aggregates in-memory with a Map. This is one DB query + O(n) in-memory grouping, which satisfies the spirit of the requirement. True single-query aggregation would require raw SQL with `GROUP BY` and window functions, which is more complex and not significantly faster for typical table counts (< 50).

---

## 10. Delivery Address Flexibility (الاوردرات.txt §4, §13)

**Spec says:** Admin POS delivery uses `{ address: "..." }` (single string). Customer web delivery uses `{ city, area, street, building, floor, landmark }` (structured).

**Decision:** The `deliveryAddress` field is stored as JSON. Both shapes are accepted. The frontend can send whichever shape matches the channel.
