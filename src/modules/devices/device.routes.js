const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const deviceController = require("./device.controller");

const router = express.Router();

// Register device (authenticated - called during login flow)
router.post("/register", authMiddleware, deviceController.registerDevice);

module.exports = router;

// User device management routes (mounted under /api/users/:id/devices)
const userDeviceRouter = express.Router({ mergeParams: true });

userDeviceRouter.get("/", authMiddleware, requirePermission("users", "view_users"), deviceController.getUserDevices);
userDeviceRouter.patch("/:deviceId", authMiddleware, requirePermission("users", "edit_user"), deviceController.approveOrRejectDevice);
userDeviceRouter.delete("/:deviceId", authMiddleware, requirePermission("users", "edit_user"), deviceController.revokeDevice);

module.exports = router;
module.exports.userDeviceRouter = userDeviceRouter;
