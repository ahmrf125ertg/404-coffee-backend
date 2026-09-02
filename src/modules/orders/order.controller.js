const orderService = require("./order.service");

const { logAudit } = require("../../utils/audit");

const { parsePagination } = require("../../utils/pagination");

const {
    emitOrderCreated,
    emitOrderItemUpdated,
    emitOrderUpdated,
} = require("../../websocket/socket.events");

// ============================================================
// Create order
// POST /api/orders
// ============================================================

const createOrder = async (req, res, next) => {
    try {
        const order = await orderService.createOrder(req.body);

        emitOrderCreated(order);

        await logAudit(req, "orders", "create_order", "Order created successfully");
        return res.status(201).json({
            success: true,
            message: "Order created successfully",
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get all orders
// GET /api/orders
// ============================================================

const getOrders = async (req, res, next) => {
    try {
        const { items, total } = await orderService.getOrders(req.query);

        const { page, pageSize } = parsePagination(req.query);

        return res.status(200).json({
            success: true,
            data: items,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get order by ID
// GET /api/orders/:id
// ============================================================

const getOrderById = async (req, res, next) => {
    try {
        const order = await orderService.getOrderById(
            req.params.id
        );

        return res.status(200).json({
            success: true,
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Update order
// PUT /api/orders/:id
// ============================================================

const updateOrder = async (req, res, next) => {
    try {
        const order = await orderService.updateOrder(
            req.params.id,
            req.body
        );

        emitOrderUpdated(order);

        await logAudit(req, "orders", "edit_order", "Order updated successfully");
        return res.status(200).json({
            success: true,
            message: "Order updated successfully",
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Delete order
// DELETE /api/orders/:id
// ============================================================
// Delete order
// DELETE /api/orders/:id
// ============================================================

const deleteOrder = async (req, res, next) => {
    try {
        const order = await orderService.deleteOrder(req.params.id);

        await logAudit(req, "orders", "delete_order", "Order deleted successfully");
        return res.status(200).json({
            success: true,
            message: "Order deleted successfully",
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get order tracking
// GET /api/orders/:id/tracking
// ============================================================

const getOrderTracking = async (req, res, next) => {
    try {
        const tracking = await orderService.getOrderTracking(req.params.id);

        return res.status(200).json({
            success: true,
            data: tracking,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Update order item status
// PATCH /api/orders/:id/items/:itemId/status
// ============================================================

const updateOrderItemStatus = async (req, res, next) => {
    try {
        const result = await orderService.updateOrderItemStatus(
            req.params.id,
            req.params.itemId,
            req.body
        );

        emitOrderItemUpdated({
            orderId: Number(req.params.id),
            itemId: Number(req.params.itemId),
            status: result.item.status,
            orderStatus: result.orderStatus,
        });

        await logAudit(req, "orders", "update_item_status", `Order item ${req.params.itemId} status updated`);
        return res.status(200).json({
            success: true,
            message: "Order item status updated",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get prep orders
// GET /api/orders/prep
// ============================================================

const getPrepOrders = async (req, res, next) => {
    try {
        const items = await orderService.getPrepOrders();
        return res.status(200).json({ success: true, data: { items } });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get table summaries
// GET /api/orders/tables/summary
// ============================================================

const getTableSummaries = async (req, res, next) => {
    try {
        const data = await orderService.getTableSummaries();
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Update order status (bulk)
// PATCH /api/orders/:id/status
// ============================================================

const updateOrderStatus = async (req, res, next) => {
    try {
        const order = await orderService.updateOrderStatus(
            req.params.id,
            req.body.status
        );

        emitOrderUpdated(order);

        await logAudit(req, "orders", "edit_order", `Order ${order.orderNumber} status changed to ${order.status}`);
        return res.status(200).json({
            success: true,
            message: "Order status updated",
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Hand over order to delegate
// PATCH /api/orders/:id/hand-over-delegate
// ============================================================

const handOverOrderToDelegate = async (req, res, next) => {
    try {
        const order = await orderService.handOverOrderToDelegate(
            req.params.id,
            req.body.delegateId
        );

        emitOrderUpdated(order);

        await logAudit(req, "orders", "edit_order", `Order ${order.orderNumber} handed over to delegate`);
        return res.status(200).json({
            success: true,
            message: "Order handed over to delegate",
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Close table
// PATCH /api/orders/tables/:tableNumber/close
// ============================================================

const closeTableOrder = async (req, res, next) => {
    try {
        const orders = await orderService.closeTableOrder(
            req.params.tableNumber
        );

        for (const order of orders) {
            emitOrderUpdated(order);
        }

        await logAudit(req, "orders", "edit_order", `Table ${req.params.tableNumber} closed`);
        return res.status(200).json({
            success: true,
            message: "Table closed successfully",
            data: orders,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get public order tracking (no auth)
// GET /api/orders/public/:code/tracking
// ============================================================

const getPublicOrderTracking = async (req, res, next) => {
    try {
        const tracking = await orderService.getPublicOrderTracking(
            req.params.code,
            req.query.token
        );
        return res.status(200).json({ success: true, data: tracking });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get active table order
// GET /api/table-sessions/:tableNumber/active-order
// ============================================================

const getActiveTableOrder = async (req, res, next) => {
    try {
        const order = await orderService.getActiveTableOrder(
            req.params.tableNumber
        );
        return res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createOrder,
    getOrders,
    getOrderById,
    updateOrder,
    deleteOrder,
    getOrderTracking,
    updateOrderItemStatus,
    getPrepOrders,
    getTableSummaries,
    updateOrderStatus,
    handOverOrderToDelegate,
    closeTableOrder,
    getPublicOrderTracking,
    getActiveTableOrder,
};