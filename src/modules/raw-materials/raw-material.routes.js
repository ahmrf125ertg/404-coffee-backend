const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getRawMaterials,
  createRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
  addBatch,
  getMaterialBatches,
} = require("./raw-material.controller");

const router = express.Router();

// Get all raw materials
router.get(
  "/",
  authMiddleware,
  requirePermission("inventory", "view_inventory"),
  getRawMaterials
);

// Create raw material
router.post(
  "/",
  authMiddleware,
  requirePermission("inventory", "create_material"),
  createRawMaterial
);

// Get batches for a material
router.get(
  "/:id/batches",
  authMiddleware,
  requirePermission("inventory", "view_inventory"),
  getMaterialBatches
);

// Add batch
router.post(
  "/:id/batches",
  authMiddleware,
  requirePermission("inventory", "add_batch"),
  addBatch
);

// Update raw material
router.put(
  "/:id",
  authMiddleware,
  requirePermission("inventory", "edit_material"),
  updateRawMaterial
);

// Delete raw material
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("inventory", "delete_material"),
  deleteRawMaterial
);

module.exports = router;