const jwt = require("jsonwebtoken");

const prisma = require("../lib/prisma");

const { jwtSecret } = require("../config/env");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check if Authorization header exists
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization required",
      });
    }

    // Check Bearer token format
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token is required",
      });
    }

    // verify JWT token
    const decoded = jwt.verify(token, jwtSecret);

    // Re-check the user still exists and is ACTIVE so a suspended
    // (or deleted) account loses access immediately
    const user = await prisma.user.findUnique({
      where: {
        id: decoded.userId,
      },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Account no longer exists",
      });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "User account is suspended",
      });
    }

    // Attach authenticated user to request
    // (role بتجيله من الداتابيز عشان أي تغيير في الدور يبان فورًا من غير إعادة تسجيل دخول)
    req.user = {
      ...decoded,
      role: user.role,
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token has expired",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    next(error);
  }
};

module.exports = authMiddleware;