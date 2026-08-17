const express = require("express");
const rateLimit = require("express-rate-limit");

const { chat } = require("./chat.controller");

const { nodeEnv } = require("../../config/env");

const router = express.Router();

// == Chat with the AI assistant (public for customers; staff
// capabilities are enabled automatically when a valid staff
// token is provided in the Authorization header)

// حد معقول لأن كل طلب لـ OpenAI ليه تكلفة — 30 طلب / 15 دقيقة لكل IP
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => nodeEnv === "test",
});

router.post("/", chatLimiter, chat);

module.exports = router;