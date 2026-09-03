const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

// Get all delegates
const getDelegates = async (reqQuery = {}) => {
    const { skip, take } = parsePagination(reqQuery);

    const [items, total] = await Promise.all([
        prisma.delegate.findMany({
            orderBy: {
                createdAt: "desc",
            },
            include: {
                _count: {
                    select: {
                        orders: true,
                    },
                },
            },
            skip,
            take,
        }),
        prisma.delegate.count(),
    ]);
    return { items, total };
};


// Get delegate by ID
const getDelegateById = async (id) => {
    const delegate = await prisma.delegate.findUnique({
        where: {
            id: Number(id),
        },
        include: {
            _count: {
                select: {
                    orders: true,
                },
            },
            orders: {
                orderBy: {
                    createdAt: "desc",
                },
            },
        },
    });

    if (!delegate) {
        const error = new Error("Delegate not found");
        error.statusCode = 404;
        throw error;
    }

    return delegate;
};


// Create delegate
const createDelegate = async ({
    name,
    whatsapp,
    phone,
    image,
    status,
    isActive,
}) => {

    if (!name || !whatsapp || !phone) {
        const error = new Error("Required delegate data is missing");
        error.statusCode = 400;
        throw error;
    }

    const existingDelegate = await prisma.delegate.findFirst({
        where: {
            OR: [
                { phone },
                { whatsapp },
            ],
        },
    });

    if (existingDelegate) {
        const error = new Error(
            "Delegate with this phone or WhatsApp already exists"
        );
        error.statusCode = 409;
        throw error;
    }

    const delegate = await prisma.delegate.create({
        data: {
            name,
            whatsapp,
            phone,
            image: image || null,
            status: status || "AVAILABLE",
            isActive: isActive !== false,
        },
    });

    return delegate;
};


// Update delegate
const updateDelegate = async (id, data) => {
    const existingDelegate = await prisma.delegate.findUnique({
        where: {
            id: Number(id),
        },
    });

    if (!existingDelegate) {
        const error = new Error("Delegate not found");
        error.statusCode = 404;
        throw error;
    }

    const {
        name,
        whatsapp,
        phone,
        image,
        status,
        isActive,
    } = data;

    if (phone !== undefined || whatsapp !== undefined) {
        const duplicateDelegate = await prisma.delegate.findFirst({
            where: {
                AND: [
                    {
                        id: {
                            not: Number(id),
                        },
                    },
                    {
                        OR: [
                            ...(phone !== undefined ? [{ phone }] : []),
                            ...(whatsapp !== undefined ? [{ whatsapp }] : []),
                        ],
                    },
                ],
            },
        });

        if (duplicateDelegate) {
            const error = new Error(
                "Another delegate already uses this phone or WhatsApp"
            );
            error.statusCode = 409;
            throw error;
        }
    }

    const updatedDelegate = await prisma.delegate.update({
        where: {
            id: Number(id),
        },
        data: {
            ...(name !== undefined && { name }),
            ...(whatsapp !== undefined && { whatsapp }),
            ...(phone !== undefined && { phone }),
            ...(image !== undefined && {
                image: image || null,
            }),
            ...(status !== undefined && { status }),
            ...(isActive !== undefined && { isActive }),
        },
    });

    return updatedDelegate;
};


// Update delegate status
const updateDelegateStatus = async (id, status) => {
    const existingDelegate = await prisma.delegate.findUnique({
        where: {
            id: Number(id),
        },
    });

    if (!existingDelegate) {
        const error = new Error("Delegate not found");
        error.statusCode = 404;
        throw error;
    }

    if (!["AVAILABLE", "UNAVAILABLE"].includes(status)) {
        const error = new Error("Invalid delegate status");
        error.statusCode = 400;
        throw error;
    }

    const updatedDelegate = await prisma.delegate.update({
        where: {
            id: Number(id),
        },
        data: {
            status,
        },
    });

    return updatedDelegate;
};


// Delete delegate
const deleteDelegate = async (id) => {
    const existingDelegate = await prisma.delegate.findUnique({
        where: {
            id: Number(id),
        },
    });

    if (!existingDelegate) {
        const error = new Error("Delegate not found");
        error.statusCode = 404;
        throw error;
    }

    const activeOrders = await prisma.order.count({
        where: {
            delegateId: Number(id),
            status: {
                in: [
                    "PENDING",
                    "PREPARING",
                    "READY",
                ],
            },
        },
    });

    if (activeOrders > 0) {
        const error = new Error(
            "Cannot delete delegate with active orders"
        );
        error.statusCode = 400;
        throw error;
    }

    await prisma.delegate.delete({
        where: {
            id: Number(id),
        },
    });

    return existingDelegate;
};


// Get delegate options
const getDelegateOptions = async (query = {}) => {
    const where = {};
    if (query.search && query.search.trim()) {
        where.OR = [
            { name: { contains: query.search.trim(), mode: "insensitive" } },
            { phone: { contains: query.search.trim(), mode: "insensitive" } },
        ];
    }
    return prisma.delegate.findMany({ where, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } });
};


// Get delegate orders
const getDelegateOrders = async (delegateId, filters = {}) => {
    const id = Number(delegateId);
    if (!Number.isInteger(id) || id <= 0) { const error = new Error("Invalid delegate ID"); error.statusCode = 400; throw error; }
    const delegate = await prisma.delegate.findUnique({ where: { id } });
    if (!delegate) { const error = new Error("Delegate not found"); error.statusCode = 404; throw error; }
    const { skip, take } = parsePagination(filters);
    const where = { delegateId: id };
    if (filters.status) where.status = filters.status;
    const [items, total] = await Promise.all([
        prisma.order.findMany({ where, include: { items: { include: { product: { select: { id: true, name: true } }, productSize: { select: { id: true, name: true } } } }, customer: true }, orderBy: { createdAt: "desc" }, skip, take }),
        prisma.order.count({ where }),
    ]);
    return { items, total };
};


// Get delegate collections
const getDelegateCollections = async (delegateId, filters = {}) => {
    const id = Number(delegateId);
    if (!Number.isInteger(id) || id <= 0) { const error = new Error("Invalid delegate ID"); error.statusCode = 400; throw error; }
    const delegate = await prisma.delegate.findUnique({ where: { id } });
    if (!delegate) { const error = new Error("Delegate not found"); error.statusCode = 404; throw error; }
    const { skip, take } = parsePagination(filters);
    const where = { delegateId: id, status: "COMPLETED", paymentMethod: "CASH" };
    const [items, total] = await Promise.all([
        prisma.order.findMany({ where, select: { id: true, orderNumber: true, total: true, createdAt: true }, orderBy: { createdAt: "desc" }, skip, take }),
        prisma.order.count({ where }),
    ]);
    return { items, total };
};


module.exports = {
    getDelegates,
    getDelegateById,
    createDelegate,
    updateDelegate,
    updateDelegateStatus,
    deleteDelegate,
    getDelegateOptions,
    getDelegateOrders,
    getDelegateCollections,
};