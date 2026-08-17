const prisma = require("../../lib/prisma");

const { parsePagination } = require("../../utils/pagination");

// ============================================================
// Helpers
// ============================================================

const httpError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const getOrderInclude = {
    customer: true,
    delegate: true,

    items: {
        include: {
            product: true,
            productSize: true,
        },
    },
};

const validateAndPrepareItems = async (items) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw httpError("Order must contain at least one item");
    }

    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
        const productId = Number(item.productId);
        const productSizeId = Number(item.productSizeId);
        const quantity = Number(item.quantity);

        if (
            !Number.isInteger(productId) ||
            productId <= 0 ||
            !Number.isInteger(productSizeId) ||
            productSizeId <= 0 ||
            !Number.isFinite(quantity) ||
            quantity <= 0
        ) {
            throw httpError("Invalid order item data");
        }

        const product = await prisma.product.findUnique({
            where: {
                id: productId,
            },
        });

        if (!product) {
            throw httpError(
                `Product with ID ${item.productId} not found`,
                404
            );
        }

        const productSize = await prisma.productSize.findUnique({
            where: {
                id: productSizeId,
            },
        });

        if (!productSize) {
            throw httpError(
                `Product size with ID ${item.productSizeId} not found`,
                404
            );
        }

        if (productSize.productId !== product.id) {
            throw httpError(
                `Product size ${item.productSizeId} does not belong to product ${item.productId}`
            );
        }

        const unitPrice = Number(productSize.finalPrice);
        const totalPrice = unitPrice * quantity;

        subtotal += totalPrice;

        orderItems.push({
            productId: product.id,
            productSizeId: productSize.id,
            quantity,
            unitPrice,
            totalPrice,
        });
    }

    return {
        orderItems,
        subtotal,
    };
};

const ALLOWED_ORDER_TYPES = ["DINE_IN", "TAKEAWAY", "ONLINE"];
const ALLOWED_STATUSES = [
    "PENDING",
    "PREPARING",
    "READY",
    "COMPLETED",
    "CANCELLED",
];
const ALLOWED_PAYMENT_METHODS = ["CASH", "CARD", "WALLET"];

const validateOrderEnums = ({
    orderType,
    paymentMethod,
    status,
}) => {
    if (orderType !== undefined && !ALLOWED_ORDER_TYPES.includes(orderType)) {
        throw httpError("Invalid order type");
    }

    if (
        paymentMethod !== undefined &&
        !ALLOWED_PAYMENT_METHODS.includes(paymentMethod)
    ) {
        throw httpError("Invalid payment method");
    }

    if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
        throw httpError("Invalid order status");
    }
};

// ============================================================
// Create order
// ============================================================

const createOrder = async (data) => {
    const {
        customerId,
        delegateId,
        orderType = "DINE_IN",
        phone,
        discount = 0,
        paymentMethod = "CASH",
        notes,
        items,
    } = data;

    validateOrderEnums({ orderType, paymentMethod });

    // --------------------------------------------------------
    // Validate customer
    // --------------------------------------------------------

    if (customerId !== undefined && customerId !== null) {
        const customer = await prisma.customer.findUnique({
            where: {
                id: Number(customerId),
            },
        });

        if (!customer) {
            throw httpError("Customer not found", 404);
        }
    }

    // --------------------------------------------------------
    // Validate delegate
    // --------------------------------------------------------

    if (delegateId !== undefined && delegateId !== null) {
        const delegate = await prisma.delegate.findUnique({
            where: {
                id: Number(delegateId),
            },
        });

        if (!delegate) {
            throw httpError("Delegate not found", 404);
        }
    }

    // --------------------------------------------------------
    // Validate items + calculate subtotal
    // --------------------------------------------------------

    const { orderItems, subtotal } =
        await validateAndPrepareItems(items);

    // --------------------------------------------------------
    // Calculate total
    // --------------------------------------------------------

    const discountValue = Number(discount) || 0;

    if (discountValue < 0) {
        throw httpError("Discount cannot be negative");
    }

    if (discountValue > subtotal) {
        throw httpError("Discount cannot be greater than subtotal");
    }

    const total = subtotal - discountValue;

    // --------------------------------------------------------
    // Create order
    // --------------------------------------------------------

    const order = await prisma.order.create({
        data: {
            customerId:
                customerId !== undefined && customerId !== null
                    ? Number(customerId)
                    : null,

            delegateId:
                delegateId !== undefined && delegateId !== null
                    ? Number(delegateId)
                    : null,

            orderType,
            phone: phone || null,

            subtotal,
            discount: discountValue,
            total,

            paymentMethod,
            notes: notes || null,

            items: {
                create: orderItems,
            },
        },

        include: getOrderInclude,
    });

    return order;
};

// ============================================================
// Get all orders
// ============================================================

const getOrders = async (filters = {}) => {
    const { skip, take } = parsePagination(filters);

    const {
        status,
        orderType,
        paymentMethod,
        customerId,
        delegateId,
    } = filters;

    const where = {};

    if (status) {
        where.status = status;
    }

    if (orderType) {
        where.orderType = orderType;
    }

    if (paymentMethod) {
        where.paymentMethod = paymentMethod;
    }

    if (customerId !== undefined && customerId !== "") {
        where.customerId = Number(customerId);
    }

    if (delegateId !== undefined && delegateId !== "") {
        where.delegateId = Number(delegateId);
    }

    const [orders, total] = await Promise.all([
        prisma.order.findMany({
            where,

            include: getOrderInclude,

            orderBy: {
                createdAt: "desc",
            },

            skip,
            take,
        }),
        prisma.order.count({ where }),
    ]);

    return { items: orders, total };
};

// ============================================================
// Get order by ID
// ============================================================

const getOrderById = async (id) => {
    const orderId = Number(id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
        throw httpError("Invalid order ID");
    }

    const order = await prisma.order.findUnique({
        where: {
            id: orderId,
        },

        include: getOrderInclude,
    });

    if (!order) {
        throw httpError("Order not found", 404);
    }

    return order;
};

// ============================================================
// Update order
// ============================================================

const updateOrder = async (id, data) => {
    const orderId = Number(id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
        throw httpError("Invalid order ID");
    }

    const existingOrder = await prisma.order.findUnique({
        where: {
            id: orderId,
        },
    });

    if (!existingOrder) {
        throw httpError("Order not found", 404);
    }

    const {
        customerId,
        delegateId,
        orderType,
        phone,
        discount,
        paymentMethod,
        status,
        notes,
        items,
    } = data;

    validateOrderEnums({ orderType, paymentMethod, status });

    // --------------------------------------------------------
    // Validate customer
    // --------------------------------------------------------

    if (customerId !== undefined && customerId !== null) {
        const customer = await prisma.customer.findUnique({
            where: {
                id: Number(customerId),
            },
        });

        if (!customer) {
            throw httpError("Customer not found", 404);
        }
    }

    // --------------------------------------------------------
    // Validate delegate
    // --------------------------------------------------------

    if (delegateId !== undefined && delegateId !== null) {
        const delegate = await prisma.delegate.findUnique({
            where: {
                id: Number(delegateId),
            },
        });

        if (!delegate) {
            throw httpError("Delegate not found", 404);
        }
    }

    // --------------------------------------------------------
    // Prepare basic update data
    // --------------------------------------------------------

    const updateData = {};

    if (customerId !== undefined) {
        updateData.customerId =
            customerId === null ? null : Number(customerId);
    }

    if (delegateId !== undefined) {
        updateData.delegateId =
            delegateId === null ? null : Number(delegateId);
    }

    if (orderType !== undefined) {
        updateData.orderType = orderType;
    }

    if (phone !== undefined) {
        updateData.phone = phone;
    }

    if (paymentMethod !== undefined) {
        updateData.paymentMethod = paymentMethod;
    }

    if (status !== undefined) {
        updateData.status = status;
    }

    if (notes !== undefined) {
        updateData.notes = notes;
    }

    // --------------------------------------------------------
    // Update items
    // --------------------------------------------------------

    if (items !== undefined) {
        const { orderItems, subtotal } =
            await validateAndPrepareItems(items);

        const discountValue =
            discount !== undefined
                ? Number(discount)
                : Number(existingOrder.discount);

        if (discountValue < 0) {
            throw httpError("Discount cannot be negative");
        }

        if (discountValue > subtotal) {
            throw httpError(
                "Discount cannot be greater than subtotal"
            );
        }

        updateData.subtotal = subtotal;
        updateData.discount = discountValue;
        updateData.total = subtotal - discountValue;

        // ----------------------------------------------------
        // Delete and recreate items inside transaction
        // ----------------------------------------------------

        const order = await prisma.$transaction(async (tx) => {
            await tx.orderItem.deleteMany({
                where: {
                    orderId,
                },
            });

            return tx.order.update({
                where: {
                    id: orderId,
                },

                data: {
                    ...updateData,

                    items: {
                        create: orderItems,
                    },
                },

                include: getOrderInclude,
            });
        });

        return order;
    }

    // --------------------------------------------------------
    // Update discount only
    // --------------------------------------------------------

    if (discount !== undefined) {
        const discountValue = Number(discount);

        if (discountValue < 0) {
            throw httpError("Discount cannot be negative");
        }

        if (
            discountValue >
            Number(existingOrder.subtotal)
        ) {
            throw httpError(
                "Discount cannot be greater than subtotal"
            );
        }

        updateData.discount = discountValue;

        updateData.total =
            Number(existingOrder.subtotal) - discountValue;
    }

    // --------------------------------------------------------
    // Update order
    // --------------------------------------------------------

    const order = await prisma.order.update({
        where: {
            id: orderId,
        },

        data: updateData,

        include: getOrderInclude,
    });

    return order;
};

// ============================================================
// Delete order
// ============================================================

const deleteOrder = async (id) => {
    const orderId = Number(id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
        throw httpError("Invalid order ID");
    }

    const existingOrder = await prisma.order.findUnique({
        where: {
            id: orderId,
        },
    });

    if (!existingOrder) {
        throw httpError("Order not found", 404);
    }

    const order = await prisma.order.delete({
        where: {
            id: orderId,
        },

        include: getOrderInclude,
    });

    return order;
};

module.exports = {
    createOrder,
    getOrders,
    getOrderById,
    updateOrder,
    deleteOrder,
};