const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const orderController = require("./order.controller");
const { validateOrder } = require("./order.validation");

const router = express.Router();

// Create order
router.post(
  "/",
  authMiddleware,
  requirePermission("orders", "create_order"),
  validateOrder,
  orderController.createOrder
);

// Get all orders
router.get(
  "/",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getOrders
);

// Get order by ID
router.get(
  "/:id",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getOrderById
);

// Update order
router.put(
  "/:id",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  validateOrder,
  orderController.updateOrder
);

// Delete order
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("orders", "delete_order"),
  orderController.deleteOrder
);

// Order tracking
router.get(
  "/:id/tracking",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getOrderTracking
);

// Update order item status
router.patch(
  "/:id/items/:itemId/status",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.updateOrderItemStatus
);

module.exports = router;