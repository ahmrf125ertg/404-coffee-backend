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
// Order number generation
// ============================================================

const generateOrderNumber = async () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `ORD-${dateStr}-`;

    const lastOrder = await prisma.order.findFirst({
        where: {
            orderNumber: { startsWith: prefix },
        },
        orderBy: { orderNumber: "desc" },
    });

    let seq = 1;
    if (lastOrder) {
        const lastSeq = parseInt(lastOrder.orderNumber.slice(-4), 10);
        seq = lastSeq + 1;
    }

    return `${prefix}${String(seq).padStart(4, "0")}`;
};

// ============================================================
// Create order
// ============================================================

const createOrder = async (data) => {
    const {
        customerId,
        delegateId,
        orderType = "DINE_IN",
        tableNumber,
        customerName,
        customerPhone,
        phone,
        discount = 0,
        paymentMethod = "CASH",
        notes,
        items,
    } = data;

    validateOrderEnums({ orderType, paymentMethod });

    // --------------------------------------------------------
    // Validate orderType-specific fields
    // --------------------------------------------------------

    if (orderType === "DINE_IN") {
        if (!tableNumber) {
            throw httpError("tableNumber is required for DINE_IN orders");
        }
    }

    if (orderType === "ONLINE" || orderType === "TAKEAWAY") {
        if (!customerId && !customerName) {
            throw httpError("customerName or customerId is required for ONLINE/TAKEAWAY orders");
        }
    }

    // --------------------------------------------------------
    // Validate or auto-create customer
    // --------------------------------------------------------

    let resolvedCustomerId = customerId ? Number(customerId) : null;

    if (!resolvedCustomerId && customerName && customerPhone) {
        let customer = await prisma.customer.findUnique({
            where: { phone: customerPhone.trim() },
        });

        if (!customer) {
            customer = await prisma.customer.create({
                data: {
                    name: customerName.trim(),
                    phone: customerPhone.trim(),
                },
            });
        }

        resolvedCustomerId = customer.id;
    }

    if (resolvedCustomerId) {
        const customer = await prisma.customer.findUnique({
            where: { id: resolvedCustomerId },
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
            where: { id: Number(delegateId) },
        });
        if (!delegate) {
            throw httpError("Delegate not found", 404);
        }
    }

    // --------------------------------------------------------
    // Validate items + calculate subtotal
    // --------------------------------------------------------

    const { orderItems, subtotal } = await validateAndPrepareItems(items);

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
    // Generate order number
    // --------------------------------------------------------

    const orderNumber = await generateOrderNumber();

    // --------------------------------------------------------
    // Create order
    // --------------------------------------------------------

    const order = await prisma.order.create({
        data: {
            orderNumber,
            customerName: customerName || null,
            customerId: resolvedCustomerId,
            delegateId: delegateId ? Number(delegateId) : null,
            orderType,
            tableNumber: tableNumber || null,
            phone: phone || customerPhone || null,
            subtotal,
            discount: discountValue,
            total,
            paymentMethod,
            notes: notes || null,
            items: { create: orderItems },
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
        tableNumber,
        customerName,
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
            where: { id: Number(customerId) },
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
            where: { id: Number(delegateId) },
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
        updateData.customerId = customerId === null ? null : Number(customerId);
    }

    if (delegateId !== undefined) {
        updateData.delegateId = delegateId === null ? null : Number(delegateId);
    }

    if (orderType !== undefined) {
        updateData.orderType = orderType;
    }

    if (tableNumber !== undefined) {
        updateData.tableNumber = tableNumber || null;
    }

    if (customerName !== undefined) {
        updateData.customerName = customerName || null;
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
        where: { id: orderId },
    });

    if (!existingOrder) {
        throw httpError("Order not found", 404);
    }

    const order = await prisma.order.delete({
        where: { id: orderId },
        include: getOrderInclude,
    });

    return order;
};

// ============================================================
// Get order tracking
// ============================================================

const getOrderTracking = async (id) => {
    const orderId = Number(id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
        throw httpError("Invalid order ID");
    }

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            items: {
                include: {
                    product: { select: { id: true, name: true } },
                    productSize: { select: { id: true, name: true, typeName: true } },
                },
            },
        },
    });

    if (!order) {
        throw httpError("Order not found", 404);
    }

    const totalItems = order.items.length;
    const readyItems = order.items.filter((i) => i.status === "READY");
    const pendingItems = order.items.filter((i) => i.status !== "READY" && i.status !== "CANCELLED");

    return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        orderType: order.orderType,
        tableNumber: order.tableNumber,
        total: Number(order.total),
        totalItems,
        readyCount: readyItems.length,
        pendingCount: pendingItems.length,
        readyItems: readyItems.map((i) => ({
            id: i.id,
            productName: i.product.name,
            sizeName: i.productSize.name,
            quantity: Number(i.quantity),
            status: i.status,
        })),
        pendingItems: pendingItems.map((i) => ({
            id: i.id,
            productName: i.product.name,
            sizeName: i.productSize.name,
            quantity: Number(i.quantity),
            status: i.status,
        })),
    };
};

// ============================================================
// Update order item status
// ============================================================

const ALLOWED_ITEM_STATUSES = ["PENDING", "PREPARING", "READY", "CANCELLED"];

const updateOrderItemStatus = async (orderId, itemId, data) => {
    const orderIdNum = Number(orderId);
    const itemIdNum = Number(itemId);
    const { status } = data;

    if (!Number.isInteger(orderIdNum) || orderIdNum <= 0) {
        throw httpError("Invalid order ID");
    }

    if (!Number.isInteger(itemIdNum) || itemIdNum <= 0) {
        throw httpError("Invalid item ID");
    }

    if (!status || !ALLOWED_ITEM_STATUSES.includes(status)) {
        throw httpError(`Invalid status. Allowed: ${ALLOWED_ITEM_STATUSES.join(", ")}`);
    }

    const order = await prisma.order.findUnique({
        where: { id: orderIdNum },
    });

    if (!order) {
        throw httpError("Order not found", 404);
    }

    const orderItem = await prisma.orderItem.findFirst({
        where: { id: itemIdNum, orderId: orderIdNum },
    });

    if (!orderItem) {
        throw httpError("Order item not found", 404);
    }

    const updatedItem = await prisma.orderItem.update({
        where: { id: itemIdNum },
        data: { status },
        include: {
            product: { select: { id: true, name: true } },
            productSize: { select: { id: true, name: true } },
        },
    });

    // Auto-update order status based on item statuses
    const allItems = await prisma.orderItem.findMany({
        where: { orderId: orderIdNum },
    });

    const activeItems = allItems.filter((i) => i.status !== "CANCELLED");
    const allReady = activeItems.length > 0 && activeItems.every((i) => i.status === "READY");
    const anyPreparing = activeItems.some((i) => i.status === "PREPARING");

    let newOrderStatus = order.status;
    if (allReady) {
        newOrderStatus = "READY";
    } else if (anyPreparing) {
        newOrderStatus = "PREPARING";
    }

    if (newOrderStatus !== order.status) {
        await prisma.order.update({
            where: { id: orderIdNum },
            data: { status: newOrderStatus },
        });
    }

    return {
        item: updatedItem,
        orderStatus: newOrderStatus,
    };
};

module.exports = {
    createOrder,
    getOrders,
    getOrderById,
    updateOrder,
    deleteOrder,
    getOrderTracking,
    updateOrderItemStatus,
};