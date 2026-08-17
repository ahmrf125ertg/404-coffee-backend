const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  getUserPermissions,
  deleteUser,
} = require("./user.controller");

const router = express.Router();

// Get all users
router.get(
  "/",
  authMiddleware,
  requirePermission("users", "view_users"),
  getUsers
);

// Create new user
router.post(
  "/",
  authMiddleware,
  requirePermission("users", "create_user"),
  createUser
);

// Update user
router.put(
  "/:id",
  authMiddleware,
  requirePermission("users", "edit_user"),
  updateUser
);

// Update user status
router.patch(
  "/:id/status",
  authMiddleware,
  requirePermission("users", "change_user_status"),
  updateUserStatus
);

// Get user effective permissions (RBAC)
router.get(
  "/:id/permissions",
  authMiddleware,
  requirePermission("users", "view_users"),
  getUserPermissions
);

// Delete user
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("users", "delete_user"),
  deleteUser
);

module.exports = router;