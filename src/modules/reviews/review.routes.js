const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const reviewController = require("./review.controller");

const router = express.Router();

// Create review (authenticated customer)
router.post(
    "/",
    authMiddleware,
    reviewController.createReview
);

// Get all reviews
router.get(
    "/",
    authMiddleware,
    requirePermission("customers", "view_customers"),
    reviewController.getReviews
);

// Get review by ID
router.get(
    "/:id",
    authMiddleware,
    requirePermission("customers", "view_customers"),
    reviewController.getReviewById
);

// Delete review
router.delete(
    "/:id",
    authMiddleware,
    requirePermission("customers", "delete_customer"),
    reviewController.deleteReview
);

module.exports = router;
