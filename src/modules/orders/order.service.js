const prisma = require("../../lib/prisma");

const { parsePagination } = require("../../utils/pagination");
const crypto = require("crypto");
const { generateBarcode } = require("../../utils/barcode");

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

    // Batch-fetch all products and sizes to avoid N+1 queries
    const productIds = [...new Set(items.map((item) => Number(item.productId)).filter((id) => Number.isInteger(id) && id > 0))];
    const sizeIds = [...new Set(items.map((item) => Number(item.productSizeId)).filter((id) => Number.isInteger(id) && id > 0))];

    if (productIds.length === 0 || sizeIds.length === 0) {
        throw httpError("Invalid order item data");
    }

    const [products, productSizes] = await Promise.all([
        prisma.product.findMany({ where: { id: { in: productIds } } }),
        prisma.productSize.findMany({ where: { id: { in: sizeIds } } }),
    ]);

    const productMap = new Map(products.map((p) => [p.id, p]));
    const sizeMap = new Map(productSizes.map((s) => [s.id, s]));

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

        const product = productMap.get(productId);
        if (!product) {
            throw httpError(
                `Product with ID ${item.productId} not found`,
                404
            );
        }

        const productSize = sizeMap.get(productSizeId);
        if (!productSize) {
            throw httpError(
                `Product size ${item.productSizeId} not found`,
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
            typeName: item.typeName || null,
            notes: item.notes || null,
            addonIds: Array.isArray(item.addonIds) ? item.addonIds.map(Number).filter(Boolean) : [],
        });
    }

    return {
        orderItems,
        subtotal,
    };
};

const ALLOWED_ORDER_TYPES = ["tables", "online"];
const ALLOWED_STATUSES = [
    "PENDING",
    "CONFIRMED",
    "PREPARING",
    "READY",
    "ASSIGNED_TO_DELEGATE",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
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
// Order number generation (with retry for concurrency safety)
// ============================================================

const MAX_RETRIES = 5;

const generateOrderNumber = async (orderType, tableNumber) => {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const prefix = orderType === "online" ? "A-" : `T${tableNumber || "1"}-`;

        const lastOrder = await prisma.order.findFirst({
            where: { orderNumber: { startsWith: prefix } },
            orderBy: { orderNumber: "desc" },
        });

        let seq = 1;
        if (lastOrder) {
            const lastSeq = parseInt(lastOrder.orderNumber.split("-")[1], 10);
            seq = lastSeq + 1;
        }

        const orderNumber = orderType === "online"
            ? `A-${String(seq).padStart(4, "0")}`
            : `${prefix}${seq}`;

        // Check if this order number already exists (race condition guard)
        const existing = await prisma.order.findUnique({
            where: { orderNumber },
            select: { id: true },
        });

        if (!existing) {
            return orderNumber;
        }
        // If collision, retry with next sequence
    }

    // Fallback: use timestamp-based unique suffix
    const ts = Date.now().toString(36).toUpperCase();
    return orderType === "online" ? `A-${ts}` : `T${tableNumber || "1"}-${ts}`;
};

// ============================================================
// Create order
// ============================================================

const createOrder = async (data) => {
    const {
        customerId,
        delegateId,
        orderType = "tables",
        table: tableNumber,
        customerName,
        customerPhone,
        phone,
        discount = 0,
        paymentMethod = "CASH",
        notes,
        items,
        channel,
        fulfillmentType,
        deliveryAddress,
        customer,
    } = data;

    // --------------------------------------------------------
    // Determine order type: infer from context
    // --------------------------------------------------------

    let resolvedOrderType;
    if (data.orderType) {
        resolvedOrderType = data.orderType;
    } else if (channel === "CUSTOMER_WEB") {
        resolvedOrderType = "online";
    } else if (fulfillmentType === "DINE_IN" || tableNumber) {
        resolvedOrderType = "tables";
    } else {
        resolvedOrderType = "online";
    }

    const resolvedCustomerName = customerName || (customer ? customer.name : null);
    const resolvedCustomerPhone = customerPhone || (customer ? customer.phone : null);

    validateOrderEnums({ orderType: resolvedOrderType, paymentMethod });

    // --------------------------------------------------------
    // Validate orderType-specific fields
    // --------------------------------------------------------

    if (resolvedOrderType === "tables") {
        if (!tableNumber) {
            throw httpError("table is required for tables orders");
        }
    }

    if (resolvedOrderType === "online") {
        if (!customerId && !resolvedCustomerName) {
            throw httpError("customerName or customerId is required for online orders");
        }
    }

    // --------------------------------------------------------
    // Validate or auto-create customer
    // --------------------------------------------------------

    let resolvedCustomerId = customerId ? Number(customerId) : null;

    if (!resolvedCustomerId && resolvedCustomerName && resolvedCustomerPhone) {
        let cust = await prisma.customer.findUnique({
            where: { phone: resolvedCustomerPhone.trim() },
        });

        if (!cust) {
            cust = await prisma.customer.create({
                data: {
                    name: resolvedCustomerName.trim(),
                    phone: resolvedCustomerPhone.trim(),
                },
            });
        }

        resolvedCustomerId = cust.id;
    }

    if (resolvedCustomerId) {
        const cust = await prisma.customer.findUnique({
            where: { id: resolvedCustomerId },
        });
        if (!cust) {
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

    const orderNumber = await generateOrderNumber(resolvedOrderType, tableNumber);

    // --------------------------------------------------------
    // Generate tracking token for public orders
    // --------------------------------------------------------

    const trackingToken = channel === "CUSTOMER_WEB"
        ? crypto.randomBytes(32).toString("hex")
        : null;

    // --------------------------------------------------------
    // Create order (transactional: order + items)
    // --------------------------------------------------------

    const order = await prisma.$transaction(async (tx) => {
        // Strip addonIds before Prisma create (they're stored in a separate table)
        const itemsForCreate = orderItems.map(({ addonIds, ...rest }) => rest);

        const created = await tx.order.create({
            data: {
                orderNumber,
                customerName: resolvedCustomerName,
                customerId: resolvedCustomerId,
                delegateId: delegateId ? Number(delegateId) : null,
                orderType: resolvedOrderType,
                channel: channel || null,
                fulfillmentType: fulfillmentType || null,
                table: tableNumber || null,
                phone: phone || resolvedCustomerPhone,
                deliveryAddress: deliveryAddress || null,
                subtotal,
                discount: discountValue,
                total,
                paymentMethod,
                notes: notes || null,
                trackingToken,
                items: { create: itemsForCreate },
            },
            include: getOrderInclude,
        });

        // Create OrderItemAddon records for addons
        const createdItems = await tx.orderItem.findMany({ where: { orderId: created.id } });
        const itemById = new Map(createdItems.map(ci => [ci.id, ci]));
        for (const item of orderItems) {
            if (!item.addonIds || item.addonIds.length === 0) continue;
            // Find the created item by matching productId + productSizeId
            const matchItem = createdItems.find(ci => ci.productId === item.productId && ci.productSizeId === item.productSizeId);
            if (!matchItem) continue;
            // Validate addonIds belong to the product
            const validAddons = await tx.productAddon.findMany({
                where: { id: { in: item.addonIds }, productId: item.productId },
            });
            if (validAddons.length > 0) {
                await tx.orderItemAddon.createMany({
                    data: validAddons.map(a => ({ orderItemId: matchItem.id, addonId: a.id })),
                });
            }
        }

        // Auto-transition admin/waiter orders to PREPARING (inventory deducted immediately)
        const autoPrepare = channel === "ADMIN_POS" || channel === "TABLE_WAITER";
        if (autoPrepare) {
            await deductInventoryForOrder(tx, created.id);
            await tx.orderItem.updateMany({
                where: { orderId: created.id, status: "PENDING" },
                data: { status: "PREPARING" },
            });
            await tx.order.update({
                where: { id: created.id },
                data: { status: "PREPARING", version: { increment: 1 } },
            });
            // Record status event
            await tx.orderEvent.create({
                data: {
                    orderId: created.id,
                    type: "STATUS_CHANGE",
                    fromStatus: "PENDING",
                    toStatus: "PREPARING",
                    notes: "Auto-started by admin/waiter",
                    userId: null,
                },
            });
            // Re-fetch with updated status
            const updated = await tx.order.findUnique({
                where: { id: created.id },
                include: getOrderInclude,
            });
            return { ...updated, _autoPrepared: true };
        }

        return created;
    });

    // Generate barcode for the order number
    const barcode = await generateBarcode(orderNumber);

    return { ...order, barcode };
};

// ============================================================
// Get all orders
// ============================================================

const getOrders = async (filters = {}) => {
    const { skip, take, page, pageSize } = parsePagination(filters);

    const {
        status,
        orderType,
        paymentMethod,
        customerId,
        delegateId,
        channel,
        fulfillmentType,
        scope,
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

    if (channel) {
        where.channel = channel;
    }

    if (fulfillmentType) {
        where.fulfillmentType = fulfillmentType;
    }

    if (customerId !== undefined && customerId !== "") {
        where.customerId = Number(customerId);
    }

    if (delegateId !== undefined && delegateId !== "") {
        where.delegateId = Number(delegateId);
    }

    // Scope filter: active = not completed/cancelled, history = completed/cancelled
    if (scope === "active") {
        where.status = { notIn: ["COMPLETED", "CANCELLED"] };
    } else if (scope === "history") {
        where.status = { in: ["COMPLETED", "CANCELLED"] };
    }

    const [orders, total] = await Promise.all([
        prisma.order.findMany({
            where,
            select: {
                id: true,
                orderNumber: true,
                channel: true,
                fulfillmentType: true,
                status: true,
                total: true,
                createdAt: true,
                table: true,
                customer: { select: { id: true, name: true, phone: true } },
                _count: { select: { items: true } },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take,
        }),
        prisma.order.count({ where }),
    ]);

    const items = orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        channel: o.channel,
        fulfillmentType: o.fulfillmentType,
        status: o.status,
        customerName: o.customer?.name || null,
        phone: o.customer?.phone || null,
        table: o.table,
        itemCount: o._count.items,
        total: Number(o.total),
        createdAt: o.createdAt,
    }));

    return { items, total, page, pageSize };
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
        table: tableNumber,
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
        updateData.table = tableNumber || null;
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
        // Status changes must go through updateOrderStatus to enforce
        // transition rules, inventory deduction, and financial effects.
        // Remove status from the basic update data; it will be handled separately.
        if (status !== existingOrder.status) {
            throw httpError("To change order status, use PATCH /api/orders/:id/status or the dedicated status endpoints");
        }
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

    // Prevent deletion of orders in active/completed states
    if (existingOrder.status === "COMPLETED") {
        throw httpError("Cannot delete a completed order. Use cancel instead.", 400);
    }

    if (existingOrder.status === "PREPARING" || existingOrder.status === "READY") {
        throw httpError("Cannot delete an order that is being prepared or ready. Cancel it first.", 400);
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
        table: order.table,
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
    const { status, reason } = data;

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

    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
        throw httpError("Cannot modify items on completed/cancelled order", 409);
    }

    const orderItem = await prisma.orderItem.findFirst({
        where: { id: itemIdNum, orderId: orderIdNum },
    });

    if (!orderItem) {
        throw httpError("Order item not found", 404);
    }

    // Validate item status transition
    const { guardItemTransition } = require("./order.transitions");
    guardItemTransition(orderItem.status, status);

    let inventoryEffect = null;

    const result = await prisma.$transaction(async (tx) => {
        const updatedItem = await tx.orderItem.update({
            where: { id: itemIdNum },
            data: { status },
            include: {
                product: { select: { id: true, name: true } },
                productSize: { select: { id: true, name: true } },
            },
        });

        // CANCELLED item: restore inventory if it was deducted
        if (status === "CANCELLED" && (orderItem.status === "PREPARING" || orderItem.status === "READY")) {
            inventoryEffect = await restoreItemInventory(tx, orderItem);
        }

        // Record item event
        await tx.orderEvent.create({
            data: {
                orderId: orderIdNum,
                type: "ITEM_STATUS_CHANGE",
                fromStatus: orderItem.status,
                toStatus: status,
                notes: reason || null,
                userId: null,
            },
        });

        return updatedItem;
    });

    // Auto-update order status based on item statuses
    const allItems = await prisma.orderItem.findMany({
        where: { orderId: orderIdNum },
    });

    const activeItems = allItems.filter((i) => i.status !== "CANCELLED");
    const allReady = activeItems.length > 0 && activeItems.every((i) => i.status === "READY");
    const anyPreparing = activeItems.some((i) => i.status === "PREPARING");

    let newOrderStatus = order.status;
    if (activeItems.length === 0) {
        // All items cancelled → cancel the order
        newOrderStatus = "CANCELLED";
    } else if (allReady) {
        newOrderStatus = "READY";
    } else if (anyPreparing) {
        newOrderStatus = "PREPARING";
    }

    if (newOrderStatus !== order.status) {
        await prisma.order.update({
            where: { id: orderIdNum },
            data: { status: newOrderStatus, version: { increment: 1 } },
        });

        // Record order status change
        await prisma.orderEvent.create({
            data: {
                orderId: orderIdNum,
                type: "STATUS_CHANGE",
                fromStatus: order.status,
                toStatus: newOrderStatus,
                notes: activeItems.length === 0 ? "All items cancelled" : null,
                userId: null,
            },
        });
    }

    const readyCount = allItems.filter((i) => i.status === "READY").length;

    return {
        item: result,
        orderStatus: newOrderStatus,
        readyCount,
        totalItems: allItems.length,
    };
};

// ============================================================
// Restore inventory for a single cancelled item
// ============================================================

const restoreItemInventory = async (tx, orderItem) => {
    const item = await tx.orderItem.findUnique({
        where: { id: orderItem.id },
        include: {
            productSize: {
                include: { ingredients: true },
            },
        },
    });

    if (!item) return null;

    const quantity = Number(item.quantity);
    const restoredBatches = [];

    for (const ing of item.productSize.ingredients) {
        const ingredientQty = Number(ing.quantity) * quantity;
        if (ingredientQty <= 0) continue;

        const batch = await tx.rawMaterialBatch.findFirst({
            where: { rawMaterialId: ing.rawMaterialId, quantity: { gt: 0 } },
            orderBy: { addedAt: "desc" },
        });

        if (batch) {
            await tx.rawMaterialBatch.update({
                where: { id: batch.id },
                data: { quantity: { increment: ingredientQty } },
            });
            restoredBatches.push({
                rawMaterialId: ing.rawMaterialId,
                batchId: batch.id,
                restoredQty: ingredientQty,
            });
        }
    }

    return restoredBatches;
};

// ============================================================
// Get prep orders (for kitchen screen)
// ============================================================

const getPrepOrders = async () => {
    const orders = await prisma.order.findMany({
        where: {
            status: { in: ["PENDING", "PREPARING"] },
        },
        select: {
            id: true,
            orderNumber: true,
            fulfillmentType: true,
            table: true,
            status: true,
            createdAt: true,
            items: {
                select: { id: true, status: true },
            },
        },
        orderBy: { createdAt: "asc" },
    });

    return orders
        .filter((o) => o.items.length > 0)
        .map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            fulfillmentType: o.fulfillmentType,
            table: o.table,
            status: o.status,
            itemCount: o.items.length,
            readyCount: o.items.filter(i => i.status === "READY").length,
            createdAt: o.createdAt,
        }));
};

// ============================================================
// Get table summaries (active tables with order counts)
// ============================================================

const getTableSummaries = async () => {
    const activeOrders = await prisma.order.findMany({
        where: {
            orderType: "tables",
            status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        select: {
            id: true,
            table: true,
            status: true,
            orderNumber: true,
            total: true,
            createdAt: true,
            items: {
                select: { id: true, status: true },
            },
        },
        orderBy: { createdAt: "desc" },
    });

    // Also fetch open table sessions to get sessionId and openedAt
    const tableNumbers = [...new Set(activeOrders.map(o => o.table).filter(Boolean))];
    const sessions = await prisma.tableSession.findMany({
        where: { tableNumber: { in: tableNumbers.map(Number) }, status: "OPEN" },
        select: { tableNumber: true, id: true, openedAt: true },
    });
    const sessionMap = new Map(sessions.map(s => [String(s.tableNumber), s]));

    const tableMap = new Map();
    for (const order of activeOrders) {
        const table = order.table || "unknown";
        if (!tableMap.has(table)) {
            const session = sessionMap.get(table);
            tableMap.set(table, {
                tableNumber: Number(table),
                sessionId: session ? session.id : null,
                status: "BUSY",
                ordersCount: 0,
                itemsCount: 0,
                readyItemsCount: 0,
                total: 0,
                openedAt: session ? session.openedAt : null,
            });
        }
        const summary = tableMap.get(table);
        summary.ordersCount++;
        summary.total += Number(order.total);
        for (const item of order.items) {
            summary.itemsCount++;
            if (item.status === "READY") summary.readyItemsCount++;
        }
    }

    return Array.from(tableMap.values());
};

// ============================================================
// Update order status (with inventoryEffect/financialEffect)
// ============================================================

const updateOrderStatus = async (id, data, userId) => {
    const orderId = Number(id);
    const { status, reason, delegateId } = typeof data === "string" ? { status: data } : data;

    if (!Number.isInteger(orderId) || orderId <= 0) throw httpError("Invalid order ID");
    if (!status || !ALLOWED_STATUSES.includes(status)) throw httpError(`Invalid status. Allowed: ${ALLOWED_STATUSES.join(", ")}`);

    const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });
    if (!existingOrder) throw httpError("Order not found", 404);

    // Use the new transition guard from order.transitions.js
    const { guardOrderTransition } = require("./order.transitions");
    const { fromStatus, toStatus } = guardOrderTransition(existingOrder.status, status);

    const result = await prisma.$transaction(async (tx) => {
        const updateData = { status, version: { increment: 1 } };
        if (delegateId !== undefined) updateData.delegateId = delegateId ? Number(delegateId) : existingOrder.delegateId;

        // Set deliveredAt when transitioning to DELIVERED
        if (status === "DELIVERED") {
            updateData.deliveredAt = new Date();
        }

        const order = await tx.order.update({
            where: { id: orderId },
            data: updateData,
            include: getOrderInclude,
        });

        // Record status change event
        await tx.orderEvent.create({
            data: {
                orderId,
                type: "STATUS_CHANGE",
                fromStatus,
                toStatus,
                notes: reason || null,
                userId: userId || null,
            },
        });

        let inventoryEffect = null;
        let financialEffect = null;

        // PREPARING: deduct inventory
        if (status === "PREPARING" && existingOrder.status === "PENDING") {
            inventoryEffect = await deductInventoryForOrder(tx, orderId);
        }

        // COMPLETED: create sale + drawer transaction
        if (status === "COMPLETED" && existingOrder.status !== "COMPLETED") {
            const { sale, drawerTransaction } = await createOrderCompletionSale(tx, order, userId);
            await tx.order.update({
                where: { id: orderId },
                data: { saleId: sale.id },
            });
            financialEffect = {
                saleId: sale.id,
                total: Number(order.total),
                paymentMethod: order.paymentMethod,
                drawerTransactionId: drawerTransaction ? drawerTransaction.id : null,
                drawerTransaction,
            };
        }

        // CANCELLED: restore inventory only if it was deducted (order was at least PREPARING)
        if (status === "CANCELLED" && existingOrder.status !== "CANCELLED") {
            if (existingOrder.status === "PREPARING" || existingOrder.status === "READY" ||
                existingOrder.status === "CONFIRMED") {
                inventoryEffect = await restoreInventoryForOrder(tx, orderId);
            }
        }

        return { order, inventoryEffect, financialEffect };
    });

    return result;
};

// ============================================================
// Deduct inventory for order (ingredients from raw materials)
// Consumes across multiple batches by withdrawalPriority (lowest number first).
// Creates RawMaterialWithdrawal records for full audit trail.
// ============================================================

const deductInventoryForOrder = async (tx, orderId) => {
    const items = await tx.orderItem.findMany({
        where: { orderId },
        include: {
            productSize: {
                include: { ingredients: true },
            },
        },
    });

    const deductions = [];

    for (const item of items) {
        const quantity = Number(item.quantity);
        for (const ing of item.productSize.ingredients) {
            const ingredientQty = Number(ing.quantity) * quantity;
            if (ingredientQty <= 0) continue;

            // Fetch all batches ordered by withdrawalPriority (lowest first)
            const batches = await tx.rawMaterialBatch.findMany({
                where: { rawMaterialId: ing.rawMaterialId, quantity: { gt: 0 } },
                orderBy: { withdrawalPriority: "asc" },
            });

            const totalAvailable = batches.reduce((sum, b) => sum + Number(b.quantity), 0);
            if (totalAvailable < ingredientQty) {
                const mat = await tx.rawMaterial.findUnique({ where: { id: ing.rawMaterialId }, select: { name: true } });
                const matName = mat ? mat.name : `RawMaterial#${ing.rawMaterialId}`;
                throw httpError(`Insufficient inventory for "${matName}": need ${ingredientQty} but only ${totalAvailable} available`, 400);
            }

            let remaining = ingredientQty;
            for (const batch of batches) {
                if (remaining <= 0) break;
                const available = Number(batch.quantity);
                const toDeduct = Math.min(remaining, available);

                await tx.rawMaterialBatch.update({
                    where: { id: batch.id },
                    data: { quantity: { decrement: toDeduct } },
                });

                // Create audit trail record
                await tx.rawMaterialWithdrawal.create({
                    data: {
                        rawMaterialId: ing.rawMaterialId,
                        batchId: batch.id,
                        orderId: orderId,
                        quantity: toDeduct,
                        unitCost: Number(batch.pricePerUnit),
                        totalCost: toDeduct * Number(batch.pricePerUnit),
                        reason: `Auto-deduct for order #${orderId}`,
                        processedAt: new Date(),
                    },
                });

                deductions.push({
                    rawMaterialId: ing.rawMaterialId,
                    batchId: batch.id,
                    deductedQty: toDeduct,
                });

                remaining -= toDeduct;
            }
        }
    }

    return deductions;
};

// ============================================================
// Hand over order to delegate (with proper validation)
// ============================================================

const handOverOrderToDelegate = async (orderId, delegateId, userId) => {
    const orderIdNum = Number(orderId);

    if (!Number.isInteger(orderIdNum) || orderIdNum <= 0) {
        throw httpError("Invalid order ID");
    }

    const existingOrder = await prisma.order.findUnique({
        where: { id: orderIdNum },
    });

    if (!existingOrder) {
        throw httpError("Order not found", 404);
    }

    // Validate: order must be READY
    if (existingOrder.status !== "READY") {
        throw httpError("Order must be READY before assigning to delegate", 409);
    }

    // Validate: order must be DELIVERY type
    if (existingOrder.fulfillmentType !== "DELIVERY") {
        throw httpError("Only DELIVERY orders can be assigned to delegates", 409);
    }

    // Validate: order must not already have a delegate
    if (existingOrder.delegateId) {
        throw httpError("Order is already assigned to a delegate", 409);
    }

    // Validate delegate exists
    if (!delegateId) {
        throw httpError("delegateId is required");
    }

    const delegate = await prisma.delegate.findUnique({
        where: { id: Number(delegateId) },
    });
    if (!delegate) {
        throw httpError("Delegate not found", 404);
    }

    // Transition to ASSIGNED_TO_DELEGATE
    const { guardOrderTransition } = require("./order.transitions");
    const result = await prisma.$transaction(async (tx) => {
        guardOrderTransition(existingOrder.status, "ASSIGNED_TO_DELEGATE");

        const order = await tx.order.update({
            where: { id: orderIdNum },
            data: {
                delegateId: Number(delegateId),
                status: "ASSIGNED_TO_DELEGATE",
                version: { increment: 1 },
            },
            include: getOrderInclude,
        });

        // Record status event
        await tx.orderEvent.create({
            data: {
                orderId: orderIdNum,
                type: "STATUS_CHANGE",
                fromStatus: "READY",
                toStatus: "ASSIGNED_TO_DELEGATE",
                notes: `Assigned to delegate ${delegate.name}`,
                userId: userId || null,
            },
        });

        return order;
    });

    return result;
};

// ============================================================
// Close table order
// ============================================================

const closeTableOrder = async (tableNumber, userId, paymentData = {}) => {
    if (!tableNumber) {
        throw httpError("Table number is required");
    }

    const activeOrders = await prisma.order.findMany({
        where: {
            orderType: "tables",
            table: tableNumber,
            status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        include: getOrderInclude,
    });

    if (activeOrders.length === 0) {
        throw httpError("No active orders for this table", 404);
    }

    // Cannot close if any orders are PENDING or PREPARING
    const notReadyOrders = activeOrders.filter(o => ["PENDING", "CONFIRMED", "PREPARING"].includes(o.status));
    if (notReadyOrders.length > 0) {
        throw httpError(
            `Cannot close table: ${notReadyOrders.length} order(s) are still being prepared (${notReadyOrders.map(o => o.status).join(", ")})`,
            409
        );
    }

    const { paymentMethod, amountPaid } = paymentData;

    const result = await prisma.$transaction(async (tx) => {
        const updatedOrders = [];

        // Deduct inventory for all orders that haven't had it deducted yet
        // (ADMIN_POS and TABLE_WAITER orders are auto-deducted at creation;
        //  only CUSTOMER_WEB orders remain PENDING until table close)
        for (const o of activeOrders) {
            if (o.status === "PENDING" || o.status === "CONFIRMED") {
                await deductInventoryForOrder(tx, o.id);
            }
        }

        for (const o of activeOrders) {
            const updated = await tx.order.update({
                where: { id: o.id },
                data: { status: "COMPLETED", version: { increment: 1 } },
                include: getOrderInclude,
            });
            updatedOrders.push(updated);
        }

        const firstOrder = updatedOrders[0];
        const totalPaid = updatedOrders.reduce((s, o) => s + Number(o.total), 0);
        const totalDiscount = updatedOrders.reduce((s, o) => s + Number(o.discount), 0);
        const resolvedMethod = paymentMethod || firstOrder.paymentMethod;

        const sale = await tx.sale.create({
            data: {
                customerId: firstOrder.customerId,
                subtotal: updatedOrders.reduce((s, o) => s + Number(o.subtotal), 0),
                discount: totalDiscount,
                total: totalPaid,
                paymentMethod: resolvedMethod,
                status: "COMPLETED",
            },
        });

        // Set saleId on all orders
        for (const o of updatedOrders) {
            await tx.order.update({
                where: { id: o.id },
                data: {
                    saleId: sale.id,
                    paymentMethod: resolvedMethod,
                    paymentStatus: "PAID",
                    version: { increment: 1 },
                },
            });
        }

        for (const o of updatedOrders) {
            const orderItems = await tx.orderItem.findMany({ where: { orderId: o.id } });
            if (orderItems.length > 0) {
                await tx.saleItem.createMany({
                    data: orderItems.map((item) => ({
                        saleId: sale.id,
                        productId: item.productId,
                        productSizeId: item.productSizeId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        totalPrice: item.totalPrice,
                    })),
                });
            }
        }

        if (resolvedMethod === "CASH") {
            const openShift = await tx.cashDrawerShift.findFirst({
                where: { status: "OPEN" },
                orderBy: { openedAt: "desc" },
            });
            if (openShift) {
                await tx.cashDrawerTransaction.create({
                    data: {
                        shiftId: openShift.id,
                        type: "SALES",
                        amount: Number(amountPaid) || totalPaid,
                        description: `Table ${tableNumber} closed`,
                        recordedByUserId: userId,
                    },
                });
            }
        }

        // Find and close the table session
        let sessionId = null;
        let closedAt = new Date();
        const tableSession = await tx.tableSession.findFirst({
            where: { tableNumber: Number(tableNumber), status: "OPEN" },
            orderBy: { openedAt: "desc" },
        });
        if (tableSession) {
            await tx.tableSession.update({
                where: { id: tableSession.id },
                data: { status: "CLOSED", closedAt },
            });
            sessionId = tableSession.id;
        }

        return {
            orders: updatedOrders,
            sessionId,
            ordersCount: updatedOrders.length,
            paymentStatus: "PAID",
            total: totalPaid,
            closedAt,
        };
    });

    return result;
};

// ============================================================
// Get public order tracking (no auth required)
// ============================================================

const getPublicOrderTracking = async (code, token) => {
    if (!token) {
        throw httpError("Tracking token is required", 401);
    }

    const order = await prisma.order.findFirst({
        where: { orderNumber: code, trackingToken: token },
        include: {
            items: {
                include: {
                    product: { select: { id: true, name: true, image: true } },
                    productSize: { select: { id: true, name: true, typeName: true } },
                },
            },
            statusHistory: {
                orderBy: { createdAt: "asc" },
                select: {
                    id: true,
                    toStatus: true,
                    createdAt: true,
                    user: { select: { id: true, name: true } },
                },
            },
        },
    });

    if (!order) {
        throw httpError("Order not found or token does not match", 404);
    }

    const STATUS_TEXT = {
        PENDING: "تم استلام طلبك",
        CONFIRMED: "تم تأكيد طلبك",
        PREPARING: "جاري تحضير طلبك",
        READY: "طلبك جاهز",
        ASSIGNED_TO_DELEGATE: "جاري التوصيل",
        OUT_FOR_DELIVERY: "المندوب في الطريق",
        DELIVERED: "تم التسليم",
        COMPLETED: "تم الطلب",
        CANCELLED: "تم إلغاء الطلب",
    };

    const TIMELINE_TITLES = {
        PENDING: "تم استلام الطلب",
        CONFIRMED: "تم التأكيد",
        PREPARING: "جاري التحضير",
        READY: "جاهز",
        ASSIGNED_TO_DELEGATE: "تم التسليم للمندوب",
        OUT_FOR_DELIVERY: "في الطريق",
        DELIVERED: "تم التسليم",
        COMPLETED: "مكتمل",
        CANCELLED: "ملغى",
    };

    return {
        orderNumber: order.orderNumber,
        status: order.status,
        statusText: STATUS_TEXT[order.status] || order.status,
        fulfillmentType: order.fulfillmentType,
        estimatedMinutes: order.status === "PREPARING" ? 15 : null,
        items: order.items.map((i) => ({
            id: i.id,
            name: i.product.name,
            image: i.product.image,
            sizeName: i.productSize.name,
            typeName: i.productSize.typeName,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            totalPrice: Number(i.totalPrice),
            status: i.status,
        })),
        pricing: {
            subtotal: Number(order.subtotal),
            deliveryFee: Number(order.deliveryFee || 0),
            serviceFee: Number(order.serviceFee || 0),
            tax: Number(order.tax || 0),
            discount: Number(order.discount || 0),
            total: Number(order.total),
        },
        timeline: order.statusHistory.map((h) => ({
            status: h.toStatus,
            title: TIMELINE_TITLES[h.toStatus] || h.toStatus,
            createdAt: h.createdAt,
        })),
        delegate: order.delegate ? {
            id: order.delegate.id,
            name: order.delegate.name,
            phone: order.delegate.phone,
        } : null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
    };
};

// ============================================================
// Get active table order (for table screen)
// ============================================================

const getActiveTableOrder = async (tableNumber) => {
    if (!tableNumber) {
        throw httpError("Table number is required");
    }

    const order = await prisma.order.findFirst({
        where: {
            orderType: "tables",
            table: tableNumber,
            status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        include: getOrderInclude,
        orderBy: { createdAt: "desc" },
    });

    return order;
};

// ============================================================
// Calculate cost for an order (sum of ingredient costs)
// ============================================================

const calculateOrderCost = async (orderId) => {
    const items = await prisma.orderItem.findMany({
        where: { orderId },
        include: {
            productSize: {
                include: {
                    ingredients: {
                        include: {
                            rawMaterial: {
                                include: { batches: { orderBy: { addedAt: "desc" }, take: 1 } },
                            },
                        },
                    },
                },
            },
        },
    });

    let costTotal = 0;
    for (const item of items) {
        const quantity = Number(item.quantity);
        for (const ing of item.productSize.ingredients) {
            const ingredientQty = Number(ing.quantity);
            const latestBatch = ing.rawMaterial.batches[0];
            const pricePerUnit = latestBatch ? Number(latestBatch.pricePerUnit) : 0;
            costTotal += ingredientQty * quantity * pricePerUnit;
        }
    }

    return costTotal;
};

// ============================================================
// Shared: Create sale + sale items for order completion
// Reused by: updateOrderStatus (COMPLETED), checkoutTable, completeDelivery
// ============================================================

const createOrderCompletionSale = async (tx, order, userId) => {
    const sale = await tx.sale.create({
        data: {
            customerId: order.customerId,
            subtotal: order.subtotal,
            discount: order.discount,
            total: order.total,
            paymentMethod: order.paymentMethod,
            status: "COMPLETED",
        },
    });

    const orderItems = await tx.orderItem.findMany({ where: { orderId: order.id } });
    if (orderItems.length > 0) {
        await tx.saleItem.createMany({
            data: orderItems.map((item) => ({
                saleId: sale.id,
                productId: item.productId,
                productSizeId: item.productSizeId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
            })),
        });
    }

    let drawerTransaction = null;
    if (order.paymentMethod === "CASH") {
        const openShift = await tx.cashDrawerShift.findFirst({
            where: { status: "OPEN" },
            orderBy: { openedAt: "desc" },
        });

        if (openShift) {
            drawerTransaction = await tx.cashDrawerTransaction.create({
                data: {
                    shiftId: openShift.id,
                    type: "SALES",
                    amount: order.total,
                    description: `Order ${order.orderNumber} sale`,
                    recordedByUserId: userId,
                },
            });
        }
    }

    return { sale, drawerTransaction };
};

// ============================================================
// Restore inventory for cancelled order
// Restores to exact batches from which stock was originally deducted,
// using RawMaterialWithdrawal records as the source of truth.
// ============================================================

const restoreInventoryForOrder = async (tx, orderId) => {
    // Look up original deduction records for this order
    const withdrawals = await tx.rawMaterialWithdrawal.findMany({
        where: { orderId },
        orderBy: { id: "asc" },
    });

    const restoredBatches = [];

    for (const w of withdrawals) {
        const batch = await tx.rawMaterialBatch.findUnique({ where: { id: w.batchId } });
        if (!batch) continue;

        const restoreQty = Number(w.quantity);

        await tx.rawMaterialBatch.update({
            where: { id: batch.id },
            data: { quantity: { increment: restoreQty } },
        });

        // Remove the original withdrawal record since stock is restored
        await tx.rawMaterialWithdrawal.delete({ where: { id: w.id } });

        restoredBatches.push({
            rawMaterialId: w.rawMaterialId,
            batchId: batch.id,
            restoredQty: restoreQty,
        });
    }

    // Fallback: if no withdrawal records exist (legacy orders), restore by ingredients
    if (restoredBatches.length === 0) {
        const items = await tx.orderItem.findMany({
            where: { orderId },
            include: {
                productSize: {
                    include: { ingredients: true },
                },
            },
        });

        for (const item of items) {
            const quantity = Number(item.quantity);
            for (const ing of item.productSize.ingredients) {
                const ingredientQty = Number(ing.quantity) * quantity;
                const batch = await tx.rawMaterialBatch.findFirst({
                    where: { rawMaterialId: ing.rawMaterialId, quantity: { gt: 0 } },
                    orderBy: { withdrawalPriority: "asc" },
                });

                if (batch) {
                    await tx.rawMaterialBatch.update({
                        where: { id: batch.id },
                        data: { quantity: { increment: ingredientQty } },
                    });
                    restoredBatches.push({
                        rawMaterialId: ing.rawMaterialId,
                        batchId: batch.id,
                        restoredQty: ingredientQty,
                    });
                }
            }
        }
    }

    return restoredBatches;
};

// ============================================================
// Cancel order (with optional restoreInventory)
// ============================================================

const cancelOrder = async (id, data = {}, userId) => {
    const orderId = Number(id);
    const { reason = "Cancelled by admin", restoreInventory = true } = typeof data === "string" ? { reason: data } : data;

    if (!Number.isInteger(orderId) || orderId <= 0) throw httpError("Invalid order ID");

    const existing = await prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) throw httpError("Order not found", 404);
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
        throw httpError("Cannot cancel a completed or already cancelled order");
    }

    const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.update({
            where: { id: orderId },
            data: { status: "CANCELLED", version: { increment: 1 } },
            include: getOrderInclude,
        });

        // Store cancellation reason as an OrderEvent
        await tx.orderEvent.create({
            data: {
                orderId,
                type: "CANCELLED",
                status: "CANCELLED",
                notes: reason,
                userId: userId || null,
            },
        });

        let restoredBatches = [];
        // Restore inventory only if it was deducted (order was at least PREPARING)
        if (restoreInventory && (existing.status === "PREPARING" || existing.status === "READY")) {
            restoredBatches = await restoreInventoryForOrder(tx, orderId);
        }

        return { order, restoredBatches };
    });

    return result;
};

// ============================================================
// Get order invoice (with costTotal/profitTotal)
// ============================================================

const getOrderInvoice = async (id) => {
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) throw httpError("Invalid order ID");
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: getOrderInclude });
    if (!order) throw httpError("Order not found", 404);

    const items = order.items.map(i => ({
        name: i.product.name,
        sizeName: i.productSize.name,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        totalPrice: Number(i.totalPrice),
    }));

    const costTotal = await calculateOrderCost(orderId);
    const profitTotal = Number(order.total) - costTotal;

    return {
        invoiceNumber: order.orderNumber,
        items,
        subtotal: Number(order.subtotal),
        discount: Number(order.discount),
        total: Number(order.total),
        costTotal,
        profitTotal,
        payment: order.paymentMethod,
        customer: order.customer,
        completedAt: order.updatedAt,
    };
};

// ============================================================
// Get order events
// ============================================================

const getOrderEvents = async (orderId, filters = {}) => {
    const id = Number(orderId);
    if (!Number.isInteger(id) || id <= 0) throw httpError("Invalid order ID");
    const { skip, take } = parsePagination(filters);
    const where = { orderId: id };
    const [items, total] = await Promise.all([
        prisma.orderEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
        prisma.orderEvent.count({ where }),
    ]);
    return { items, total };
};

// ============================================================
// Start preparation
// ============================================================

const startPreparation = async (id, userId) => {
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) throw httpError("Invalid order ID");
    const existing = await prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) throw httpError("Order not found", 404);

    if (existing.status !== "PENDING") {
        throw httpError(`Cannot start preparation from status ${existing.status}. Order must be PENDING.`);
    }

    const result = await prisma.$transaction(async (tx) => {
        // Deduct inventory (same as updateOrderStatus PENDING→PREPARING)
        const inventoryEffect = await deductInventoryForOrder(tx, orderId);

        await tx.orderItem.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "PREPARING" } });
        const order = await tx.order.update({
            where: { id: orderId },
            data: { status: "PREPARING", version: { increment: 1 } },
            include: getOrderInclude,
        });

        return { order, inventoryEffect };
    });

    return result;
};

// ============================================================
// Mark item ready
// ============================================================

const markItemReady = async (orderId, itemId) => {
    const orderIdNum = Number(orderId);
    const itemIdNum = Number(itemId);
    if (!Number.isInteger(orderIdNum) || orderIdNum <= 0) throw httpError("Invalid order ID");
    if (!Number.isInteger(itemIdNum) || itemIdNum <= 0) throw httpError("Invalid item ID");
    const item = await prisma.orderItem.findFirst({ where: { id: itemIdNum, orderId: orderIdNum } });
    if (!item) throw httpError("Order item not found", 404);
    const updatedItem = await prisma.orderItem.update({ where: { id: itemIdNum }, data: { status: "READY" } });
    const allItems = await prisma.orderItem.findMany({ where: { orderId: orderIdNum } });
    const activeItems = allItems.filter(i => i.status !== "CANCELLED");
    const allReady = activeItems.length > 0 && activeItems.every(i => i.status === "READY");
    let newOrderStatus = allReady ? "READY" : (await prisma.order.findUnique({ where: { id: orderIdNum } })).status;
    await prisma.order.update({ where: { id: orderIdNum }, data: { status: newOrderStatus } });
    return { item: updatedItem, orderStatus: newOrderStatus };
};

// ============================================================
// Reopen item
// ============================================================

const reopenItem = async (orderId, itemId, reason) => {
    const orderIdNum = Number(orderId);
    const itemIdNum = Number(itemId);
    if (!Number.isInteger(orderIdNum) || orderIdNum <= 0) throw httpError("Invalid order ID");
    if (!Number.isInteger(itemIdNum) || itemIdNum <= 0) throw httpError("Invalid item ID");
    const item = await prisma.orderItem.findFirst({ where: { id: itemIdNum, orderId: orderIdNum } });
    if (!item) throw httpError("Order item not found", 404);
    const updatedItem = await prisma.orderItem.update({ where: { id: itemIdNum }, data: { status: "PREPARING" } });
    await prisma.order.update({ where: { id: orderIdNum }, data: { status: "PREPARING" } });
    return { item: updatedItem, orderStatus: "PREPARING" };
};

// ============================================================
// Get table details
// ============================================================

const getTableDetails = async (tableNumber) => {
    if (!tableNumber) throw httpError("Table number is required");
    const activeOrders = await prisma.order.findMany({ where: { orderType: "tables", table: tableNumber, status: { notIn: ["COMPLETED", "CANCELLED"] } }, include: getOrderInclude, orderBy: { createdAt: "desc" } });
    if (activeOrders.length === 0) return { tableNumber, status: "EMPTY", activeOrder: null, orders: [], subtotal: 0, total: 0 };
    const subtotal = activeOrders.reduce((s, o) => s + Number(o.subtotal), 0);
    const total = activeOrders.reduce((s, o) => s + Number(o.total), 0);
    return { tableNumber, status: "OCCUPIED", activeOrder: activeOrders[0], orders: activeOrders, subtotal, total };
};

// ============================================================
// Create table order
// ============================================================

const createTableOrder = async (tableNumber, data) => {
    if (!tableNumber) throw httpError("Table number is required");
    return createOrder({ ...data, orderType: "tables", table: tableNumber, channel: "ADMIN_POS" });
};

// ============================================================
// Add items to table
// ============================================================

const addTableItems = async (tableNumber, data) => {
    if (!tableNumber) throw httpError("Table number is required");
    const activeOrder = await prisma.order.findFirst({ where: { orderType: "tables", table: tableNumber, status: { notIn: ["COMPLETED", "CANCELLED"] } }, orderBy: { createdAt: "desc" } });
    if (!activeOrder) throw httpError("No active order for this table", 404);
    const { items } = data;
    if (!Array.isArray(items) || items.length === 0) throw httpError("Items array is required");
    const { orderItems, subtotal: newItemsTotal } = await validateAndPrepareItems(items);
    const newSubtotal = Number(activeOrder.subtotal) + newItemsTotal;
    const newTotal = newSubtotal - Number(activeOrder.discount);
    await prisma.orderItem.createMany({ data: orderItems.map(i => ({ ...i, orderId: activeOrder.id })) });
    const updatedOrder = await prisma.order.update({ where: { id: activeOrder.id }, data: { subtotal: newSubtotal, total: newTotal }, include: getOrderInclude });
    return updatedOrder;
};

// ============================================================
// Table checkout (with invoice + sale)
// ============================================================

const checkoutTable = async (tableNumber, data, userId) => {
    if (!tableNumber) throw httpError("Table number is required");
    const { paymentMethod, discount, actualPaid } = data;
    const activeOrders = await prisma.order.findMany({
        where: { orderType: "tables", table: tableNumber, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        include: getOrderInclude,
    });
    if (activeOrders.length === 0) throw httpError("No active orders for this table", 404);

    const result = await prisma.$transaction(async (tx) => {
        const updatedOrders = [];
        let totalPaid = 0;

        // Deduct inventory for all orders that haven't had it deducted yet
        for (const o of activeOrders) {
            if (o.status === "PENDING") {
                await deductInventoryForOrder(tx, o.id);
            }
        }

        for (const o of activeOrders) {
            const updated = await tx.order.update({
                where: { id: o.id },
                data: {
                    status: "COMPLETED",
                    paymentMethod: paymentMethod || o.paymentMethod,
                    version: { increment: 1 },
                },
                include: getOrderInclude,
            });
            totalPaid += Number(updated.total);
            updatedOrders.push(updated);
        }

        // Create a single sale covering all table orders
        // Use checkout-level discount only (not per-order discounts, which are already in order.total)
        const firstOrder = updatedOrders[0];
        const checkoutDiscount = discount || 0;
        const sale = await tx.sale.create({
            data: {
                customerId: firstOrder.customerId,
                subtotal: totalPaid,
                discount: checkoutDiscount,
                total: totalPaid - checkoutDiscount,
                paymentMethod: paymentMethod || firstOrder.paymentMethod,
                status: "COMPLETED",
            },
        });

        // Set saleId on all orders
        for (const o of updatedOrders) {
            await tx.order.update({
                where: { id: o.id },
                data: { saleId: sale.id },
            });
        }

        for (const o of updatedOrders) {
            const orderItems = await tx.orderItem.findMany({ where: { orderId: o.id } });
            if (orderItems.length > 0) {
                await tx.saleItem.createMany({
                    data: orderItems.map((item) => ({
                        saleId: sale.id,
                        productId: item.productId,
                        productSizeId: item.productSizeId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        totalPrice: item.totalPrice,
                    })),
                });
            }
        }

        // Create drawer transaction if CASH
        let drawerTransaction = null;
        const effectivePayment = paymentMethod || firstOrder.paymentMethod;
        if (effectivePayment === "CASH") {
            const openShift = await tx.cashDrawerShift.findFirst({
                where: { status: "OPEN" },
                orderBy: { openedAt: "desc" },
            });
            if (openShift) {
                drawerTransaction = await tx.cashDrawerTransaction.create({
                    data: {
                        shiftId: openShift.id,
                        type: "SALES",
                        amount: totalPaid - checkoutDiscount,
                        description: `Table ${tableNumber} checkout`,
                        recordedByUserId: userId,
                    },
                });
            }
        }

        // Build invoice
        const allItems = [];
        for (const o of updatedOrders) {
            const items = await tx.orderItem.findMany({
                where: { orderId: o.id },
                include: { product: true, productSize: true },
            });
            for (const i of items) {
                allItems.push({
                    name: i.product.name,
                    sizeName: i.productSize.name,
                    quantity: Number(i.quantity),
                    unitPrice: Number(i.unitPrice),
                    totalPrice: Number(i.totalPrice),
                });
            }
        }

        const invoice = {
            invoiceNumber: firstOrder.orderNumber,
            items: allItems,
            subtotal: totalPaid,
            discount: checkoutDiscount,
            total: totalPaid - checkoutDiscount,
            paymentMethod: effectivePayment,
        };

        return {
            order: updatedOrders[0],
            orders: updatedOrders,
            invoice,
            sale,
            drawerTransaction,
            totalPaid,
            tableStatus: "EMPTY",
        };
    });

    return result;
};

// ============================================================
// Get table history
// ============================================================

const getTableHistory = async (tableNumber, filters = {}) => {
    if (!tableNumber) throw httpError("Table number is required");
    const { skip, take } = parsePagination(filters);
    const where = { orderType: "tables", table: tableNumber };
    const [items, total] = await Promise.all([
        prisma.order.findMany({ where, include: getOrderInclude, orderBy: { createdAt: "desc" }, skip, take }),
        prisma.order.count({ where }),
    ]);
    return { items, total };
};

// ============================================================
// Complete delivery (delegate confirms delivery)
// ============================================================

const completeDelivery = async (orderId, data = {}, userId) => {
    const orderIdNum = Number(orderId);
    const { collectedAmount, notes } = data;

    if (!Number.isInteger(orderIdNum) || orderIdNum <= 0) throw httpError("Invalid order ID");

    const existing = await prisma.order.findUnique({ where: { id: orderIdNum } });
    if (!existing) throw httpError("Order not found", 404);
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
        throw httpError("Order is already completed or cancelled");
    }

    // Allow completing from DELIVERED, ASSIGNED_TO_DELEGATE, OUT_FOR_DELIVERY, or READY (legacy)
    const completableStatuses = ["READY", "ASSIGNED_TO_DELEGATE", "OUT_FOR_DELIVERY", "DELIVERED"];
    if (!completableStatuses.includes(existing.status)) {
        throw httpError(`Order must be in one of [${completableStatuses.join(", ")}] status to complete delivery. Current: ${existing.status}`, 409);
    }

    const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.update({
            where: { id: orderIdNum },
            data: {
                status: "COMPLETED",
                deliveredAt: existing.deliveredAt || new Date(),
                paymentStatus: "PAID",
                version: { increment: 1 },
                notes: notes || existing.notes,
            },
            include: getOrderInclude,
        });

        // Record status event
        await tx.orderEvent.create({
            data: {
                orderId: orderIdNum,
                type: "STATUS_CHANGE",
                fromStatus: existing.status,
                toStatus: "COMPLETED",
                notes: "Delivery completed",
                userId: userId || null,
            },
        });

        // Create sale + drawer transaction (shared helper)
        const { sale, drawerTransaction } = await createOrderCompletionSale(tx, order, userId);

        // Link sale to order
        await tx.order.update({
            where: { id: orderIdNum },
            data: { saleId: sale.id },
        });

        return { order, sale, drawerTransaction, deliveredAt: order.deliveredAt };
    });

    return result;
};

// ============================================================
// Lookup order by orderNumber + phone (public, no auth)
// ============================================================

const lookupOrderByNumberAndPhone = async (orderNumber, phone) => {
    if (!orderNumber || !phone) {
        throw httpError("orderNumber and phone are required");
    }

    const order = await prisma.order.findFirst({
        where: {
            orderNumber: orderNumber.trim(),
            OR: [
                { phone: phone.trim() },
                { customer: { phone: phone.trim() } },
            ],
        },
        include: {
            items: {
                include: {
                    product: { select: { id: true, name: true, image: true } },
                    productSize: { select: { id: true, name: true } },
                },
            },
        },
    });

    if (!order) {
        throw httpError("Order not found or phone does not match", 404);
    }

    return {
        orderNumber: order.orderNumber,
        status: order.status,
        statusText: STATUS_TEXT[order.status] || order.status,
        fulfillmentType: order.fulfillmentType,
        total: Number(order.total),
        items: order.items.map((i) => ({
            id: i.id,
            name: i.product.name,
            image: i.product.image,
            sizeName: i.productSize.name,
            typeName: i.typeName || null,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            totalPrice: Number(i.totalPrice),
            status: i.status,
        })),
        pricing: {
            subtotal: Number(order.subtotal),
            deliveryFee: Number(order.deliveryFee || 0),
            serviceFee: Number(order.serviceFee || 0),
            tax: Number(order.tax || 0),
            discount: Number(order.discount),
            total: Number(order.total),
        },
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
    };
};

const { STATUS_TEXT } = require("./order.constants");

// ============================================================
// Get orders by phone (public, no auth)
// ============================================================

const getOrdersByPhone = async (phone) => {
    if (!phone) {
        throw httpError("phone is required");
    }

    const orders = await prisma.order.findMany({
        where: {
            OR: [
                { phone: phone.trim() },
                { customer: { phone: phone.trim() } },
            ],
        },
        select: {
            orderNumber: true,
            status: true,
            fulfillmentType: true,
            items: { select: { id: true } },
            total: true,
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
    });

    return orders.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        statusText: STATUS_TEXT[o.status] || o.status,
        fulfillmentType: o.fulfillmentType,
        itemsCount: o.items.length,
        total: Number(o.total),
        createdAt: o.createdAt,
    }));
};

// ============================================================
// Record payment for an order
// ============================================================

const recordPayment = async (orderId, data, userId) => {
    const orderIdNum = Number(orderId);
    const { paymentMethod, amount, reference } = data;
    const method = paymentMethod || data.method;

    if (!Number.isInteger(orderIdNum) || orderIdNum <= 0) throw httpError("Invalid order ID");
    if (!method || !["CASH", "CARD", "WALLET"].includes(method)) throw httpError("Invalid payment method");
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw httpError("Amount must be a positive number");

    const existing = await prisma.order.findUnique({ where: { id: orderIdNum } });
    if (!existing) throw httpError("Order not found", 404);
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
        throw httpError("Cannot record payment for completed/cancelled order", 409);
    }

    const amountNum = Number(amount);
    const orderTotal = Number(existing.total);

    let newPaymentStatus;
    if (amountNum >= orderTotal) {
        newPaymentStatus = "PAID";
    } else if (amountNum > 0) {
        newPaymentStatus = "PARTIALLY_PAID";
    } else {
        newPaymentStatus = "PENDING";
    }

    const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.update({
            where: { id: orderIdNum },
            data: {
                paymentMethod: method,
                paymentStatus: newPaymentStatus,
                version: { increment: 1 },
            },
            include: getOrderInclude,
        });

        await tx.orderEvent.create({
            data: {
                orderId: orderIdNum,
                type: "PAYMENT",
                status: newPaymentStatus,
                notes: reference || `Payment of ${amountNum} via ${method}`,
                userId: userId || null,
            },
        });

        // Create drawer transaction if CASH
        let drawerTransaction = null;
        if (method === "CASH") {
            const openShift = await tx.cashDrawerShift.findFirst({
                where: { status: "OPEN" },
                orderBy: { openedAt: "desc" },
            });
            if (openShift) {
                drawerTransaction = await tx.cashDrawerTransaction.create({
                    data: {
                        shiftId: openShift.id,
                        type: "SALES",
                        amount: amountNum,
                        description: `Order ${existing.orderNumber} payment`,
                        recordedByUserId: userId,
                    },
                });
            }
        }

        return { order, drawerTransaction, paymentStatus: newPaymentStatus };
    });

    return {
        paymentId: result.order.id,
        orderId: orderIdNum,
        method,
        amount: amountNum,
        status: result.paymentStatus,
        paidAt: new Date(),
        drawerTransaction: result.drawerTransaction,
    };
};

// ============================================================
// Get unified order shape (per spec section 3)
// ============================================================

const getUnifiedOrder = async (id) => {
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) throw httpError("Invalid order ID");

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            customer: { select: { id: true, name: true, phone: true } },
            delegate: { select: { id: true, name: true, phone: true } },
            items: {
                include: {
                    product: { select: { id: true, name: true, image: true } },
                    productSize: { select: { id: true, name: true } },
                },
            },
            events: {
                orderBy: { createdAt: "desc" },
                take: 50,
                select: {
                    id: true,
                    type: true,
                    fromStatus: true,
                    toStatus: true,
                    notes: true,
                    createdAt: true,
                    userId: true,
                },
            },
        },
    });

    if (!order) throw httpError("Order not found", 404);

    // Resolve userIds to names for statusHistory
    const userIds = [...new Set(order.events.filter(e => e.userId).map(e => e.userId))];
    let userMap = {};
    if (userIds.length > 0) {
        const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
        userMap = Object.fromEntries(users.map(u => [u.id, u.name]));
    }

    // Calculate paidAmount from sale payments
    let paidAmount = 0;
    if (order.saleId) {
        const saleItems = await prisma.saleItem.findMany({ where: { saleId: order.saleId } });
        paidAmount = saleItems.reduce((sum, si) => sum + Number(si.totalPrice), 0);
    }

    // Resolve addons for each order item
    const orderItemIds = order.items.map(i => i.id);
    const addonRows = orderItemIds.length > 0
        ? await prisma.orderItemAddon.findMany({
            where: { orderItemId: { in: orderItemIds } },
            include: { addon: { select: { id: true, name: true, price: true } } },
        })
        : [];
    const addonMap = new Map();
    for (const row of addonRows) {
        if (!addonMap.has(row.orderItemId)) addonMap.set(row.orderItemId, []);
        addonMap.get(row.orderItemId).push({ id: row.addon.id, name: row.addon.name, unitPrice: Number(row.addon.price) });
    }

    return {
        id: order.id,
        orderNumber: order.orderNumber,
        channel: order.channel,
        fulfillmentType: order.fulfillmentType,
        status: order.status,

        customer: order.customer,
        table: order.table,
        deliveryAddress: order.deliveryAddress,

        items: order.items.map((i) => ({
            id: i.id,
            productId: i.productId,
            productSizeId: i.productSizeId,
            product: i.product,
            productSize: i.productSize,
            typeName: i.typeName,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            totalPrice: Number(i.totalPrice),
            status: i.status,
            notes: i.notes || null,
            addons: addonMap.get(i.id) || [],
        })),

        pricing: {
            subtotal: Number(order.subtotal),
            deliveryFee: Number(order.deliveryFee || 0),
            serviceFee: Number(order.serviceFee || 0),
            tax: Number(order.tax || 0),
            discount: Number(order.discount),
            total: Number(order.total),
        },

        payment: {
            method: order.paymentMethod,
            status: order.paymentStatus,
            paidAmount,
        },

        delegate: order.delegate,
        trackingToken: order.trackingToken,

        statusHistory: order.events
            .filter(e => e.type === "STATUS_CHANGE" || e.fromStatus || e.toStatus)
            .map(e => ({
                id: e.id,
                fromStatus: e.fromStatus,
                toStatus: e.toStatus,
                changedBy: e.userId ? { id: e.userId, name: userMap[e.userId] || null } : null,
                createdAt: e.createdAt,
            })),

        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
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
    getPrepOrders,
    getTableSummaries,
    updateOrderStatus,
    handOverOrderToDelegate,
    closeTableOrder,
    getPublicOrderTracking,
    getActiveTableOrder,
    cancelOrder,
    getOrderInvoice,
    getOrderEvents,
    startPreparation,
    markItemReady,
    reopenItem,
    getTableDetails,
    createTableOrder,
    addTableItems,
    checkoutTable,
    getTableHistory,
    completeDelivery,
    lookupOrderByNumberAndPhone,
    getOrdersByPhone,
    recordPayment,
    getUnifiedOrder,
};