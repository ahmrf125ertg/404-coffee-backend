const express = require("express");
const rateLimit = require("express-rate-limit");

const authController = require("./auth.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

const { nodeEnv } = require("../../config/env");

const router = express.Router();

// حد سخي للحماية من brute-force — 60 محاولة / 15 دقيقة لكل IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => nodeEnv === "test",
});

router.post("/login", loginLimiter, authController.loginUser);
router.get("/me", authMiddleware, authController.getMe);
router.post("/refresh", authController.refreshToken);
router.post("/logout", authMiddleware, authController.logoutUser);

module.exports = router;