const express = require("express");
const orderService = require("../orders/order.service");
const authMiddleware = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authMiddleware);

// GET /api/table-sessions/:tableNumber/active-order
router.get("/:tableNumber/active-order", async (req, res, next) => {
    try {
        const order = await orderService.getActiveTableOrder(req.params.tableNumber);
        return res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// POST /api/table-sessions/:tableNumber/service-requests
router.post("/:tableNumber/service-requests", async (req, res, next) => {
    try {
        const { tableNumber } = req.params;
        const { type = "WAITER", reason } = req.body;

        // Service request placeholder - for now just acknowledge
        return res.status(201).json({
            success: true,
            message: "Service request submitted",
            data: {
                tableNumber: Number(tableNumber),
                type,
                reason: reason || null,
                status: "PENDING",
                createdAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
