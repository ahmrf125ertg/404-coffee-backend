const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} = require("./supplier.controller");

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  requirePermission("suppliers", "view_suppliers"),
  getSuppliers
);

router.get(
  "/:id",
  authMiddleware,
  requirePermission("suppliers", "view_suppliers"),
  getSupplierById
);

router.post(
  "/",
  authMiddleware,
  requirePermission("suppliers", "create_supplier"),
  createSupplier
);

router.put(
  "/:id",
  authMiddleware,
  requirePermission("suppliers", "edit_supplier"),
  updateSupplier
);

router.delete(
  "/:id",
  authMiddleware,
  requirePermission("suppliers", "delete_supplier"),
  deleteSupplier
);

module.exports = router;