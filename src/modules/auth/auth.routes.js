const express = require("express");
const rateLimit = require("express-rate-limit");

const authController = require("./auth.controller");

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

module.exports = router;