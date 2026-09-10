const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const tableSessionController = require("./table-session.controller");

const router = express.Router();

router.use(authMiddleware);

// Open table session
router.post(
    "/",
    tableSessionController.openSession
);

// Get table session
router.get(
    "/:tableNumber",
    tableSessionController.getSession
);

// Get active order for table
router.get(
    "/:tableNumber/active-order",
    tableSessionController.getActiveOrder
);

// Create service request for table
router.post(
    "/:tableNumber/service-requests",
    tableSessionController.createServiceRequest
);

// Update service request (ACKNOWLEDGED/RESOLVED/CANCELLED)
router.patch(
    "/service-requests/:id",
    tableSessionController.updateServiceRequest
);

module.exports = router;
