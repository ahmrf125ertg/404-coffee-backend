const orderService = require("./order.service");

const { logAudit } = require("../../utils/audit");

const { parsePagination } = require("../../utils/pagination");

// ============================================================
// Create order
// POST /api/orders
// ============================================================

const createOrder = async (req, res, next) => {
    try {
        const order = await orderService.createOrder(req.body);


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

const deleteOrder = async (req, res, next) => {
    try {
        const order = await orderService.deleteOrder(
            req.params.id
        );


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

module.exports = {
    createOrder,
    getOrders,
    getOrderById,
    updateOrder,
    deleteOrder,
};