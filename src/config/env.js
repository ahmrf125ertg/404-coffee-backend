require("dotenv").config();

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  aiApiKey: process.env.DEEPSEEK_API_KEY,
  aiModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
};