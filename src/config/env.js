require("dotenv").config();

const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
if (!process.env.JWT_REFRESH_SECRET) {
  console.warn("[SECURITY] JWT_REFRESH_SECRET not set — falling back to JWT_SECRET. Set a separate refresh secret in .env for production.");
}

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  aiApiKey: process.env.DEEPSEEK_API_KEY,
  aiModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
};