const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const reviewController = require("./review.controller");

const router = express.Router();

// Create review (public - for customers)
router.post("/", reviewController.createReview);

// Get all reviews (admin only)
router.get(
  "/",
  authMiddleware,
  requirePermission("customers", "view_customers"),
  reviewController.getReviews
);

// Get review by ID (admin only)
router.get(
  "/:id",
  authMiddleware,
  requirePermission("customers", "view_customers"),
  reviewController.getReviewById
);

// Delete review (admin only)
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("customers", "delete_customer"),
  reviewController.deleteReview
);

module.exports = router;
