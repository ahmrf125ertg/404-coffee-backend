const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const orderController = require("./order.controller");
const { validateOrder } = require("./order.validation");

const router = express.Router();

// Public order tracking (NO auth required)
router.get(
  "/public/:code/tracking",
  orderController.getPublicOrderTracking
);

// Create public order (NO auth required — customer-facing)
router.post(
  "/public",
  orderController.createOrder
);

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

// Prep orders (kitchen screen)
router.get(
  "/prep",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getPrepOrders
);

// Table summaries
router.get(
  "/tables/summary",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getTableSummaries
);

// Close table (must be before /:id routes)
router.patch(
  "/tables/:tableNumber/close",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.closeTableOrder
);

// Table details
router.get(
  "/tables/:tableNumber/details",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getTableDetails
);

// Table orders (create order for table)
router.post(
  "/tables/:tableNumber/orders",
  authMiddleware,
  requirePermission("orders", "create_order"),
  orderController.createTableOrder
);

// Add items to table
router.post(
  "/tables/:tableNumber/items",
  authMiddleware,
  requirePermission("orders", "create_order"),
  orderController.addTableItems
);

// Table checkout
router.post(
  "/tables/:tableNumber/checkout",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.checkoutTable
);

// Table history
router.get(
  "/tables/:tableNumber/history",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getTableHistory
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

// Cancel order
router.post(
  "/:id/cancel",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.cancelOrder
);

// Order invoice
router.get(
  "/:id/invoice",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getOrderInvoice
);

// Order events
router.get(
  "/:id/events",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getOrderEvents
);

// Preparation start
router.post(
  "/:id/preparation/start",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.startPreparation
);

// Item ready
router.post(
  "/:id/items/:itemId/ready",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.markItemReady
);

// Item reopen
router.post(
  "/:id/items/:itemId/reopen",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.reopenItem
);

// Update order status (bulk)
router.patch(
  "/:id/status",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.updateOrderStatus
);

// Update order item status
router.patch(
  "/:id/items/:itemId/status",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.updateOrderItemStatus
);

// Hand over order to delegate
router.patch(
  "/:id/hand-over-delegate",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.handOverOrderToDelegate
);

module.exports = router;
