const prisma = require("../lib/prisma");
const logger = require("../lib/logger");

/**
 * tableToken.middleware.js
 * Validates X-Table-Token header for customer/table access.
 * Attaches req.tableSession with the validated session data.
 */
const tableTokenMiddleware = async (req, res, next) => {
    try {
        const tableToken = req.headers["x-table-token"];

        if (!tableToken) {
            return res.status(401).json({
                success: false,
                message: "X-Table-Token header is required",
                code: "TABLE_TOKEN_REQUIRED",
            });
        }

        const session = await prisma.tableSession.findFirst({
            where: { tableToken, status: "OPEN" },
            select: { id: true, tableNumber: true, status: true, trackingToken: true },
        });

        if (!session) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired table token",
                code: "INVALID_TABLE_TOKEN",
            });
        }

        req.tableSession = session;
        next();
    } catch (error) {
        logger.error({ err: error }, "Table token auth error");
        return res.status(500).json({
            success: false,
            message: "Table token validation failed",
        });
    }
};

module.exports = tableTokenMiddleware;
