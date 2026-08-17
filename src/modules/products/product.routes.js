const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  createProductSize,
  getProductSizes,
  createProductSizeIngredient,
  getProductTypes,
  createProductType,
  updateProductType,
  deleteProductType,
  addProductTypeIngredient,
  removeProductTypeIngredient,
  getAddons,
  createAddon,
  updateAddon,
  deleteAddon,
} = require("./product.controller");

const router = express.Router();

// Get all products
router.get(
  "/",
  authMiddleware,
  requirePermission("products", "view_products"),
  getProducts
);

// Get product by ID
router.get(
  "/:id",
  authMiddleware,
  requirePermission("products", "view_products"),
  getProductById
);

// Create product
router.post(
  "/",
  authMiddleware,
  requirePermission("products", "create_product"),
  createProduct
);

// Get product sizes
router.get(
  "/:productId/sizes",
  authMiddleware,
  requirePermission("products", "view_products"),
  getProductSizes
);

// Create product size
router.post(
  "/:productId/sizes",
  authMiddleware,
  requirePermission("products", "manage_sizes"),
  createProductSize
);

// Add ingredient to product size
router.post(
  "/:productId/sizes/:sizeId/ingredients",
  authMiddleware,
  requirePermission("products", "manage_ingredients"),
  createProductSizeIngredient
);

// Get product types
router.get(
  "/:productId/types",
  authMiddleware,
  requirePermission("products", "view_products"),
  getProductTypes
);

// Create product type
router.post(
  "/:productId/types",
  authMiddleware,
  requirePermission("products", "manage_types"),
  createProductType
);

// Update product type
router.put(
  "/:productId/types/:typeId",
  authMiddleware,
  requirePermission("products", "manage_types"),
  updateProductType
);

// Delete product type
router.delete(
  "/:productId/types/:typeId",
  authMiddleware,
  requirePermission("products", "manage_types"),
  deleteProductType
);

// Add ingredient to product type
router.post(
  "/:productId/types/:typeId/ingredients/:rawMaterialId",
  authMiddleware,
  requirePermission("products", "manage_ingredients"),
  addProductTypeIngredient
);

// Remove ingredient from product type
router.delete(
  "/:productId/types/:typeId/ingredients/:rawMaterialId",
  authMiddleware,
  requirePermission("products", "manage_ingredients"),
  removeProductTypeIngredient
);

// Get addons for a product
router.get(
  "/:productId/addons",
  authMiddleware,
  requirePermission("products", "view_products"),
  getAddons
);

// Create addon
router.post(
  "/:productId/addons",
  authMiddleware,
  requirePermission("products", "manage_addons"),
  createAddon
);

// Update addon
router.put(
  "/:productId/addons/:addonId",
  authMiddleware,
  requirePermission("products", "manage_addons"),
  updateAddon
);

// Delete addon
router.delete(
  "/:productId/addons/:addonId",
  authMiddleware,
  requirePermission("products", "manage_addons"),
  deleteAddon
);

// Update product
router.put(
  "/:id",
  authMiddleware,
  requirePermission("products", "edit_product"),
  updateProduct
);

// Delete product
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("products", "delete_product"),
  deleteProduct
);

module.exports = router;