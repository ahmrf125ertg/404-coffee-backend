const prisma = require("../../lib/prisma");

const getDashboard = async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const [
        todaySales,
        allSalesAgg,
        todayOrders,
        allOrdersAgg,
        pendingOrdersCount,
        openShift,
        productCount,
        customerCount,
        supplierCount,
        delegateCount,
        rawMaterials,
        allSales,
        allProducts,
    ] = await Promise.all([
        prisma.sale.findMany({
            where: {
                createdAt: { gte: todayStart, lt: todayEnd },
                status: "COMPLETED",
            },
            select: { total: true },
        }),
        prisma.sale.aggregate({
            where: { status: "COMPLETED" },
            _count: true,
            _sum: { total: true },
        }),
        prisma.order.findMany({
            where: {
                createdAt: { gte: todayStart, lt: todayEnd },
            },
            select: { total: true },
        }),
        prisma.order.aggregate({
            _count: true,
            _sum: { total: true },
        }),
        prisma.order.count({
            where: { status: "PENDING" },
        }),
        prisma.cashDrawerShift.findFirst({
            where: { status: "OPEN" },
            include: {
                openedByUser: {
                    select: { id: true, name: true },
                },
                transactions: {
                    select: { type: true, amount: true },
                },
            },
            orderBy: { openedAt: "desc" },
        }),
        prisma.product.count(),
        prisma.customer.count(),
        prisma.supplier.count(),
        prisma.delegate.count(),
        prisma.rawMaterial.findMany({
            include: {
                batches: true,
            },
        }),
        prisma.sale.findMany({
            where: { status: "COMPLETED" },
            select: { subtotal: true, discount: true, total: true, items: { select: { unitPrice: true, totalPrice: true, quantity: true } } },
        }),
        prisma.product.findMany({
            select: { id: true, name: true, category: true },
        }),
    ]);

    const toNumber = (value) => Number(value) || 0;

    const todaySalesTotal = todaySales.reduce(
        (sum, sale) => sum + toNumber(sale.total),
        0
    );

    const todayOrdersTotal = todayOrders.reduce(
        (sum, order) => sum + toNumber(order.total),
        0
    );

    const grossSales = allSales.reduce((sum, sale) => sum + toNumber(sale.subtotal), 0);
    const totalDiscounts = allSales.reduce((sum, sale) => sum + toNumber(sale.discount), 0);
    const profit = allSales.reduce((sum, sale) => {
        const itemCost = sale.items.reduce((s, item) => s + toNumber(item.unitPrice) * toNumber(item.quantity), 0);
        return sum + toNumber(sale.total) - itemCost;
    }, 0);

    const stock = rawMaterials
        .map((material) => {
            const currentStock = material.batches.reduce(
                (sum, batch) => sum + toNumber(batch.quantity),
                0
            );

            return {
                id: material.id,
                name: material.name,
                unit: material.unit,
                currentStock,
                minStockAlert: toNumber(material.minStockAlert),
            };
        });

    const lowStock = stock.filter((item) => item.currentStock <= item.minStockAlert);

    const expiringSoon = rawMaterials
        .flatMap((material) =>
            material.batches
                .filter((batch) => batch.expiryDate)
                .map((batch) => ({
                    id: material.id,
                    name: material.name,
                    batchId: batch.id,
                    quantity: toNumber(batch.quantity),
                    unit: material.unit,
                    expiryDate: batch.expiryDate,
                }))
        )
        .filter((batch) => {
            const daysLeft = Math.ceil(
                (new Date(batch.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)
            );

            return daysLeft >= 0 && daysLeft <= 30;
        })
        .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

    let shiftSummary = null;

    if (openShift) {
        const cashIn = openShift.transactions
            .filter((t) => ["SALES", "COLLECTION"].includes(t.type))
            .reduce((sum, t) => sum + toNumber(t.amount), 0);

        const cashOut = openShift.transactions
            .filter((t) =>
                [
                    "EXPENSE",
                    "SALARY",
                    "MAINTENANCE",
                    "PURCHASE",
                    "INCENTIVE",
                ].includes(t.type)
            )
            .reduce((sum, t) => sum + toNumber(t.amount), 0);

        shiftSummary = {
            id: openShift.id,
            status: openShift.status,
            openedAt: openShift.openedAt,
            openingBalance: toNumber(openShift.openingBalance),
            cashIn,
            cashOut,
            expectedBalance:
                toNumber(openShift.openingBalance) + cashIn - cashOut,
            openedBy: openShift.openedByUser,
        };
    }

    return {
        summary: {
            todaySales: {
                count: todaySales.length,
                total: todaySalesTotal,
            },
            totalSales: {
                count: allSalesAgg._count || 0,
                total: toNumber(allSalesAgg._sum?.total),
            },
            grossSales: Math.round(grossSales * 100) / 100,
            discounts: Math.round(totalDiscounts * 100) / 100,
            profit: Math.round(profit * 100) / 100,
            todayOrders: {
                count: todayOrders.length,
                total: todayOrdersTotal,
            },
            totalOrders: {
                count: allOrdersAgg._count || 0,
                total: toNumber(allOrdersAgg._sum?.total),
            },
            pendingOrders: pendingOrdersCount,
            activeShift: shiftSummary,
        },
        counts: {
            products: productCount,
            customers: customerCount,
            suppliers: supplierCount,
            delegates: delegateCount,
        },
        products: allProducts,
        inventory: {
            stock,
            lowStock,
            expiringSoon,
            lowStockCount: lowStock.length,
            expiringSoonCount: expiringSoon.length,
        },
        drawer: shiftSummary,
    };
};

module.exports = {
    getDashboard,
};