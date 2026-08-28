const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const { jwtSecret } = require("../config/env");
const logger = require("../lib/logger");

const socketAuth = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const decoded = jwt.verify(token, jwtSecret);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, status: true },
    });

    if (!user) {
      return next(new Error("Account no longer exists"));
    }

    if (user.status !== "ACTIVE") {
      return next(new Error("User account is suspended"));
    }

    socket.user = {
      userId: user.id,
      role: user.role,
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new Error("Token has expired"));
    }
    if (error.name === "JsonWebTokenError") {
      return next(new Error("Invalid token"));
    }

    logger.error({ err: error }, "Socket auth error");
    return next(new Error("Authentication failed"));
  }
};

module.exports = socketAuth;
