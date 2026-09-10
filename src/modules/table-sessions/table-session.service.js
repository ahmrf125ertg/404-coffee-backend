const prisma = require("../../lib/prisma");

const VALID_SERVICE_TYPES = ["WAITER", "BILL", "WATER", "UTENSILS", "CLEANING"];

// ============================================================
// Create service request
// ============================================================

const createServiceRequest = async ({ tableNumber, type = "WAITER", reason }) => {
    const tn = Number(tableNumber);
    if (!Number.isInteger(tn) || tn <= 0) {
        const error = new Error("Invalid table number");
        error.statusCode = 400;
        throw error;
    }

    if (!VALID_SERVICE_TYPES.includes(type)) {
        const error = new Error(`Invalid service request type. Allowed: ${VALID_SERVICE_TYPES.join(", ")}`);
        error.statusCode = 400;
        throw error;
    }

    // Prevent duplicate same-type requests within 2 minutes
    const recentDuplicate = await prisma.serviceRequest.findFirst({
        where: {
            tableNumber: tn,
            type,
            status: { in: ["OPEN", "PENDING", "ACKNOWLEDGED"] },
            createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
        },
    });

    if (recentDuplicate) {
        const error = new Error("Similar service request already pending for this table");
        error.statusCode = 409;
        throw error;
    }

    const request = await prisma.serviceRequest.create({
        data: {
            tableNumber: tn,
            type,
            reason: reason?.trim() || null,
        },
    });

    return request;
};

// ============================================================
// Get all service requests (admin)
// ============================================================

const getServiceRequests = async (filters = {}) => {
    const where = {};

    if (filters.status) {
        where.status = filters.status;
    }

    if (filters.scope === "active") {
        where.status = { in: ["OPEN", "PENDING", "ACKNOWLEDGED"] };
    } else if (filters.scope === "history") {
        where.status = { in: ["RESOLVED", "CANCELLED"] };
    }

    if (filters.tableNumber) {
        where.tableNumber = Number(filters.tableNumber);
    }

    const items = await prisma.serviceRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
    });

    return { items, total: items.length };
};

// ============================================================
// Update service request (ACKNOWLEDGED / RESOLVED / CANCELLED)
// ============================================================

const updateServiceRequest = async (id, { status, reason }, userId) => {
    const requestId = Number(id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
        const error = new Error("Invalid service request ID");
        error.statusCode = 400;
        throw error;
    }

    const existing = await prisma.serviceRequest.findUnique({
        where: { id: requestId },
    });

    if (!existing) {
        const error = new Error("Service request not found");
        error.statusCode = 404;
        throw error;
    }

    const validTransitions = {
        PENDING: ["ACKNOWLEDGED", "RESOLVED", "CANCELLED"],
        ACKNOWLEDGED: ["RESOLVED", "CANCELLED"],
        RESOLVED: [],
        CANCELLED: [],
    };

    if (!validTransitions[existing.status]?.includes(status)) {
        const error = new Error(`Cannot transition from ${existing.status} to ${status}`);
        error.statusCode = 409;
        throw error;
    }

    const updateData = { status };

    if (status === "ACKNOWLEDGED") {
        updateData.acknowledgedAt = new Date();
        updateData.resolvedByUserId = userId || null;
    }

    if (status === "RESOLVED") {
        updateData.resolvedAt = new Date();
        updateData.resolvedByUserId = userId || null;
    }

    if (status === "CANCELLED") {
        updateData.resolvedAt = new Date();
        updateData.resolvedByUserId = userId || null;
    }

    const updated = await prisma.serviceRequest.update({
        where: { id: requestId },
        data: updateData,
    });

    return updated;
};

// ============================================================
// Resolve service request (legacy: PENDING → RESOLVED)
// ============================================================

const resolveServiceRequest = async (id, userId) => {
    return updateServiceRequest(id, { status: "RESOLVED" }, userId);
};

// ============================================================
// Open table session
// ============================================================

const openTableSession = async ({ tableNumber, guestsCount }) => {
    const tn = Number(tableNumber);
    if (!Number.isInteger(tn) || tn <= 0) {
        const error = new Error("Invalid table number");
        error.statusCode = 400;
        throw error;
    }

    // Check if there's already an open session for this table
    const existingSession = await prisma.tableSession.findFirst({
        where: { tableNumber: tn, status: "OPEN" },
    });

    if (existingSession) {
        // Return existing session
        return existingSession;
    }

    const crypto = require("crypto");
    const tableToken = crypto.randomBytes(32).toString("hex");
    const trackingToken = crypto.randomBytes(32).toString("hex");

    const session = await prisma.tableSession.create({
        data: {
            tableNumber: tn,
            guestsCount: guestsCount ? Number(guestsCount) : null,
            tableToken,
            trackingToken,
            status: "OPEN",
        },
    });

    return session;
};

// ============================================================
// Get table session
// ============================================================

const getTableSession = async (tableNumber) => {
    const tn = Number(tableNumber);
    if (!Number.isInteger(tn) || tn <= 0) {
        const error = new Error("Invalid table number");
        error.statusCode = 400;
        throw error;
    }

    const session = await prisma.tableSession.findFirst({
        where: { tableNumber: tn, status: "OPEN" },
        orderBy: { openedAt: "desc" },
    });

    if (!session) return null;

    // Aggregate orders for this session by matching table number + active status
    const orders = await prisma.order.findMany({
        where: {
            table: String(tn),
            orderType: "tables",
            status: { notIn: ["CANCELLED"] },
            createdAt: { gte: session.openedAt },
        },
        select: { id: true, total: true },
    });

    return {
        id: session.id,
        tableNumber: session.tableNumber,
        status: session.status,
        ordersCount: orders.length,
        grandTotal: orders.reduce((sum, o) => sum + Number(o.total), 0),
        trackingToken: session.trackingToken,
        openedAt: session.openedAt,
    };
};

// ============================================================
// Close table session
// ============================================================

const closeTableSession = async (tableNumber) => {
    const tn = Number(tableNumber);
    if (!Number.isInteger(tn) || tn <= 0) {
        const error = new Error("Invalid table number");
        error.statusCode = 400;
        throw error;
    }

    const session = await prisma.tableSession.findFirst({
        where: { tableNumber: tn, status: "OPEN" },
        orderBy: { openedAt: "desc" },
    });

    if (!session) {
        const error = new Error("No open session for this table");
        error.statusCode = 404;
        throw error;
    }

    const updated = await prisma.tableSession.update({
        where: { id: session.id },
        data: { status: "CLOSED", closedAt: new Date() },
    });

    return updated;
};

module.exports = {
    createServiceRequest,
    getServiceRequests,
    updateServiceRequest,
    resolveServiceRequest,
    openTableSession,
    getTableSession,
    closeTableSession,
    VALID_SERVICE_TYPES,
};
