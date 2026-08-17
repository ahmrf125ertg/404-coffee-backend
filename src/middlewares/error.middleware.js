const logger = require("../lib/logger");
const { nodeEnv } = require("../config/env");

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    logger.error(
      { err, method: req.method, url: req.originalUrl },
      "Unhandled error"
    );
  } else {
    logger.warn(
      { err, method: req.method, url: req.originalUrl },
      "Request error"
    );
  }

  // في الـ production منحطش تفاصيل الخطأ الخام للمستخدم
  const message =
    statusCode >= 500 && nodeEnv === "production"
      ? "Internal server error"
      : err.message || "Internal server error";

  res.status(statusCode).json({
    success: false,
    message,
  });
};

module.exports = errorHandler;