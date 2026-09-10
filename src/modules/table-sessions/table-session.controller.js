const tableSessionService = require("./table-session.service");
const orderService = require("../orders/order.service");
const { logAudit } = require("../../utils/audit");
const { emitServiceRequestCreated, emitServiceRequestUpdated, emitTableSessionUpdated, emitOrderCreated } = require("../../websocket/socket.events");

// ============================================================
// POST /api/table-sessions/:tableNumber/orders
// Create order from table customer (uses X-Table-Token)
// ============================================================

const createTableOrder = async (req, res, next) => {
    try {
        const { tableNumber } = req.params;
        const session = req.tableSession;

        const order = await orderService.createOrder({
            channel: "TABLE_CUSTOMER",
            fulfillmentType: "DINE_IN",
            table: String(tableNumber),
            items: req.body.items,
        });

        emitOrderCreated(order);
        await logAudit(req, "orders", "create_order", `Table order created for table ${tableNumber}`);

        return res.status(201).json({
            success: true,
            message: "تم إرسال طلبك للجرسون",
            data: {
                id: order.id,
                orderNumber: order.orderNumber,
                tableNumber: Number(tableNumber),
                status: order.status,
                total: Number(order.total),
                trackingToken: order.trackingToken,
                createdAt: order.createdAt,
            },
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// GET /api/table-sessions/:tableNumber/active-order
// ============================================================

const getActiveOrder = async (req, res, next) => {
    try {
        const order = await orderService.getActiveTableOrder(req.params.tableNumber);
        return res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// POST /api/table-sessions (open session)
// ============================================================

const openSession = async (req, res, next) => {
    try {
        const session = await tableSessionService.openTableSession(req.body);
        emitTableSessionUpdated(session);
        await logAudit(req, "orders", "create_session", `Table ${req.body.tableNumber} session opened`);
        return res.status(201).json({
            success: true,
            message: "Table session opened",
            data: session,
        });
    } catch (error) { next(error); }
};

// ============================================================
// GET /api/table-sessions/:tableNumber (get session)
// ============================================================

const getSession = async (req, res, next) => {
    try {
        const session = await tableSessionService.getTableSession(req.params.tableNumber);
        if (!session) {
            return res.status(404).json({ success: false, message: "No active session for this table" });
        }
        return res.status(200).json({ success: true, data: session });
    } catch (error) { next(error); }
};

// ============================================================
// POST /api/table-sessions/:tableNumber/service-requests
// ============================================================

const createServiceRequest = async (req, res, next) => {
    try {
        const { tableNumber } = req.params;
        const { type, reason } = req.body;

        const request = await tableSessionService.createServiceRequest({
            tableNumber,
            type,
            reason,
        });

        await logAudit(req, "orders", "create_service_request", `Service request created for table ${tableNumber}`);

        emitServiceRequestCreated(request);

        return res.status(201).json({
            success: true,
            message: "Service request submitted",
            data: request,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// GET /api/table-sessions/service-requests/all
// ============================================================

const getServiceRequests = async (req, res, next) => {
    try {
        const { items, total } = await tableSessionService.getServiceRequests(req.query);
        return res.status(200).json({ success: true, data: items, total });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// PATCH /api/table-sessions/service-requests/:id
// ============================================================

const updateServiceRequest = async (req, res, next) => {
    try {
        const { status, reason } = req.body;
        const updated = await tableSessionService.updateServiceRequest(
            req.params.id,
            { status, reason },
            req.user?.userId
        );

        await logAudit(req, "orders", "update_service_request", `Service request ${req.params.id} updated to ${status}`);

        emitServiceRequestUpdated(updated);

        return res.status(200).json({
            success: true,
            message: "Service request updated",
            data: updated,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// PATCH /api/admin/service-requests/:id/resolve (legacy)
// ============================================================

const resolveServiceRequest = async (req, res, next) => {
    try {
        const updated = await tableSessionService.resolveServiceRequest(
            req.params.id,
            req.user?.userId
        );

        await logAudit(req, "orders", "resolve_service_request", `Service request ${req.params.id} resolved`);

        emitServiceRequestUpdated(updated);

        return res.status(200).json({
            success: true,
            message: "Service request resolved",
            data: updated,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getActiveOrder,
    openSession,
    getSession,
    createTableOrder,
    createServiceRequest,
    getServiceRequests,
    updateServiceRequest,
    resolveServiceRequest,
};
