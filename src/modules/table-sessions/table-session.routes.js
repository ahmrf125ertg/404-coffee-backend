const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const tableTokenMiddleware = require("../../middlewares/tableToken.middleware");
const tableSessionController = require("./table-session.controller");

const router = express.Router();

// ============================================================
// Admin routes (require JWT)
// ============================================================

// Open table session (admin/cashier/waiter)
router.post(
    "/",
    authMiddleware,
    tableSessionController.openSession
);

// Get all service requests with scope filter
router.get(
    "/service-requests/all",
    authMiddleware,
    tableSessionController.getServiceRequests
);

// Update service request status (admin/worker)
router.patch(
    "/service-requests/:id",
    authMiddleware,
    tableSessionController.updateServiceRequest
);

// ============================================================
// Customer routes (require X-Table-Token)
// ============================================================

// Get table session data
router.get(
    "/:tableNumber",
    tableTokenMiddleware,
    tableSessionController.getSession
);

// Create order from table customer
router.post(
    "/:tableNumber/orders",
    tableTokenMiddleware,
    tableSessionController.createTableOrder
);

// Get active orders for table
router.get(
    "/:tableNumber/active-order",
    tableTokenMiddleware,
    tableSessionController.getActiveOrder
);

// Create service request from table
router.post(
    "/:tableNumber/service-requests",
    tableTokenMiddleware,
    tableSessionController.createServiceRequest
);

module.exports = router;
