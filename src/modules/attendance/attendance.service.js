const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

const httpError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

// Compute ON_TIME/LATE based on user's workStartTime
// Parses time directly from ISO string to avoid timezone conversion issues
const computeAttendanceStatus = (checkInAt, workStartTime) => {
    if (!workStartTime) return { status: "ON_TIME", lateMinutes: 0 };

    const [hours, minutes] = workStartTime.split(":").map(Number);
    const workStartMinutes = hours * 60 + minutes;

    // Parse hour/minute directly from the ISO string to avoid Date timezone conversion
    let checkInHour, checkInMinute;
    if (typeof checkInAt === "string" && checkInAt.includes("T")) {
        const timePart = checkInAt.split("T")[1]; // "08:50:00.000Z"
        const [h, m] = timePart.split(":").map(Number);
        checkInHour = h;
        checkInMinute = m;
    } else {
        const d = new Date(checkInAt);
        checkInHour = d.getHours();
        checkInMinute = d.getMinutes();
    }

    const checkInMinutes = checkInHour * 60 + checkInMinute;

    if (checkInMinutes <= workStartMinutes) return { status: "ON_TIME", lateMinutes: 0 };

    const lateMinutes = checkInMinutes - workStartMinutes;
    return { status: "LATE", lateMinutes };
};

// Check-in
const checkIn = async (userId, { deviceFingerprint, at }) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw httpError("User not found", 404);

    const checkInAt = at ? new Date(at) : new Date();

    // Check if already checked in today (no checkout yet)
    const todayStart = new Date(checkInAt);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const existingCheckIn = await prisma.attendance.findFirst({
        where: {
            userId,
            checkInAt: { gte: todayStart, lt: todayEnd },
            checkOutAt: null,
        },
    });

    if (existingCheckIn) throw httpError("Already checked in today. Check out first.");

    const { status, lateMinutes } = computeAttendanceStatus(at || checkInAt, user.workStartTime);

    const attendance = await prisma.attendance.create({
        data: {
            userId,
            checkInAt,
            status,
            lateMinutes,
            deviceFingerprint: deviceFingerprint || null,
        },
    });

    return { attendance, status, lateMinutes, checkedInAt: checkInAt };
};

// Check-out
const checkOut = async (userId, { at }) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw httpError("User not found", 404);

    const checkOutAt = at ? new Date(at) : new Date();

    // Find today's open check-in
    const todayStart = new Date(checkOutAt);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const openAttendance = await prisma.attendance.findFirst({
        where: {
            userId,
            checkInAt: { gte: todayStart, lt: todayEnd },
            checkOutAt: null,
        },
        orderBy: { checkInAt: "desc" },
    });

    if (!openAttendance) throw httpError("No open check-in found for today");

    const workedMs = checkOutAt.getTime() - openAttendance.checkInAt.getTime();
    const workedMinutes = Math.round(workedMs / (1000 * 60));

    const attendance = await prisma.attendance.update({
        where: { id: openAttendance.id },
        data: { checkOutAt },
    });

    return { attendance, workedMinutes, checkedOutAt: checkOutAt };
};

// Get attendance for a user with summary
const getUserAttendance = async (userId, filters = {}) => {
    const { page, pageSize, skip, take } = parsePagination(filters);
    const { from, to, status } = filters;

    const where = { userId: Number(userId) };

    if (from || to) {
        where.checkInAt = {};
        if (from) where.checkInAt.gte = new Date(from);
        if (to) where.checkInAt.lte = new Date(to);
    }

    if (status) where.status = status;

    const [items, total] = await Promise.all([
        prisma.attendance.findMany({
            where,
            orderBy: { checkInAt: "desc" },
            skip,
            take,
        }),
        prisma.attendance.count({ where }),
    ]);

    // Compute summary
    const allRecords = await prisma.attendance.findMany({
        where: { userId: Number(userId) },
        select: { status: true, checkInAt: true, checkOutAt: true, lateMinutes: true },
    });

    const totalDays = allRecords.length;
    const onTimeCount = allRecords.filter((r) => r.status === "ON_TIME").length;
    const lateCount = allRecords.filter((r) => r.status === "LATE").length;
    const totalWorkedMinutes = allRecords.reduce((sum, r) => {
        if (r.checkOutAt) {
            return sum + Math.round((new Date(r.checkOutAt).getTime() - new Date(r.checkInAt).getTime()) / (1000 * 60));
        }
        return sum;
    }, 0);

    return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        summary: {
            totalDays,
            onTimeCount,
            lateCount,
            totalWorkedHours: Math.round(totalWorkedMinutes / 60 * 10) / 10,
        },
    };
};

module.exports = { checkIn, checkOut, getUserAttendance };
