const express = require("express");
const rateLimit = require("express-rate-limit");

const authController = require("./auth.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

const { nodeEnv } = require("../../config/env");

const router = express.Router();

// Rate limit for login — 10 attempts / 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => nodeEnv === "test",
});

// Rate limit for refresh token — 10 attempts / 15 minutes per IP
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => nodeEnv === "test",
});

router.post("/login", loginLimiter, authController.loginUser);
router.get("/me", authMiddleware, authController.getMe);
router.post("/refresh", refreshLimiter, authController.refreshToken);
router.post("/logout", authMiddleware, authController.logoutUser);

module.exports = router;