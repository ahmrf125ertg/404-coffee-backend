const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

// Get all suppliers
const getSuppliers = async (reqQuery = {}) => {
    const { skip, take } = parsePagination(reqQuery);

    const [items, total] = await Promise.all([
        prisma.supplier.findMany({
            orderBy: {
                createdAt: "desc",
            },
            skip,
            take,
        }),
        prisma.supplier.count(),
    ]);
    return { items, total };
};


// Get supplier by ID
const getSupplierById = async (id) => {
    const supplier = await prisma.supplier.findUnique({
        where: {
            id: Number(id),
        },
    });

    if (!supplier) {
        const error = new Error("Supplier not found");
        error.statusCode = 404;
        throw error;
    }

    return supplier;
};


// Create supplier
const createSupplier = async ({
    name,
    contactPerson,
    phone,
    email,
    country,
    city,
    address,
    taxRegistrationNumber,
    supplierType,
    supplierCategory,
    paymentTerms,
    creditLimit,
    openingBalance,
    notes,
}) => {

    // Required fields
    if (
        !name ||
        !contactPerson ||
        !phone ||
        !city ||
        !supplierType ||
        !supplierCategory
    ) {
        const error = new Error("Required supplier data is missing");
        error.statusCode = 400;
        throw error;
    }

    // Check duplicate supplier
    const existingSupplier = await prisma.supplier.findFirst({
        where: {
            name,
        },
    });

    if (existingSupplier) {
        const error = new Error("Supplier already exists");
        error.statusCode = 409;
        throw error;
    }

    const supplier = await prisma.supplier.create({
        data: {
            name,
            contactPerson,
            phone,
            email: email || null,
            country: country || null,
            city,
            address: address || null,
            taxRegistrationNumber: taxRegistrationNumber || null,
            supplierType,
            supplierCategory,
            paymentTerms: paymentTerms || null,
            creditLimit: creditLimit ?? 0,
            openingBalance: openingBalance ?? 0,
            notes: notes || null,
        },
    });

    return supplier;
};


// Update supplier
const updateSupplier = async (id, data) => {
    const existingSupplier = await prisma.supplier.findUnique({
        where: {
            id: Number(id),
        },
    });

    if (!existingSupplier) {
        const error = new Error("Supplier not found");
        error.statusCode = 404;
        throw error;
    }

    const {
        name,
        contactPerson,
        phone,
        email,
        country,
        city,
        address,
        taxRegistrationNumber,
        supplierType,
        supplierCategory,
        paymentTerms,
        creditLimit,
        openingBalance,
        notes,
    } = data;

    // Prevent duplicate supplier name on rename
    if (name !== undefined) {
        const duplicate = await prisma.supplier.findFirst({
            where: {
                name,
                NOT: {
                    id: Number(id),
                },
            },
        });

        if (duplicate) {
            const error = new Error("Supplier name already exists");
            error.statusCode = 409;
            throw error;
        }
    }

    const updatedSupplier = await prisma.supplier.update({
        where: {
            id: Number(id),
        },
        data: {
            ...(name !== undefined && { name }),
            ...(contactPerson !== undefined && { contactPerson }),
            ...(phone !== undefined && { phone }),
            ...(email !== undefined && { email: email || null }),
            ...(country !== undefined && { country: country || null }),
            ...(city !== undefined && { city }),
            ...(address !== undefined && { address: address || null }),
            ...(taxRegistrationNumber !== undefined && {
                taxRegistrationNumber: taxRegistrationNumber || null,
            }),
            ...(supplierType !== undefined && { supplierType }),
            ...(supplierCategory !== undefined && { supplierCategory }),
            ...(paymentTerms !== undefined && {
                paymentTerms: paymentTerms || null,
            }),
            ...(creditLimit !== undefined && { creditLimit }),
            ...(openingBalance !== undefined && { openingBalance }),
            ...(notes !== undefined && { notes: notes || null }),
        },
    });

    return updatedSupplier;
};


// Delete supplier
const deleteSupplier = async (id) => {
    const existingSupplier = await prisma.supplier.findUnique({
        where: {
            id: Number(id),
        },
    });

    if (!existingSupplier) {
        const error = new Error("Supplier not found");
        error.statusCode = 404;
        throw error;
    }

    await prisma.supplier.delete({
        where: {
            id: Number(id),
        },
    });

    return existingSupplier;
};


// Get supplier options
const getSupplierOptions = async (query = {}) => {
    const where = {};
    if (query.search && query.search.trim()) {
        where.OR = [
            { name: { contains: query.search.trim(), mode: "insensitive" } },
            { phone: { contains: query.search.trim(), mode: "insensitive" } },
        ];
    }
    return prisma.supplier.findMany({ where, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } });
};

// Get supplier transactions
const getSupplierTransactions = async (supplierId, filters = {}) => {
    const id = Number(supplierId);
    if (!Number.isInteger(id) || id <= 0) { const error = new Error("Invalid supplier ID"); error.statusCode = 400; throw error; }
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) { const error = new Error("Supplier not found"); error.statusCode = 404; throw error; }
    const { skip, take } = parsePagination(filters);
    const purchaseWhere = { supplierId: id };
    const returnWhere = { supplierId: id };
    if (filters.from) {
        purchaseWhere.invoiceDate = { ...purchaseWhere.invoiceDate, gte: new Date(filters.from) };
        returnWhere.returnDate = { ...returnWhere.returnDate, gte: new Date(filters.from) };
    }
    if (filters.to) {
        purchaseWhere.invoiceDate = { ...purchaseWhere.invoiceDate, lte: new Date(filters.to) };
        returnWhere.returnDate = { ...returnWhere.returnDate, lte: new Date(filters.to) };
    }
    let purchases = await prisma.purchase.findMany({ where: purchaseWhere, orderBy: { invoiceDate: "desc" }, select: { id: true, invoiceNo: true, invoiceDate: true, total: true, status: true } });
    let returns = await prisma.return.findMany({ where: returnWhere, orderBy: { returnDate: "desc" }, select: { id: true, returnNo: true, returnDate: true, totalValue: true, status: true } });
    if (filters.type === "PURCHASE") { returns = []; }
    if (filters.type === "RETURN") { purchases = []; }
    const allTx = [
        ...purchases.map(p => ({ ...p, type: "PURCHASE", date: p.invoiceDate, amount: Number(p.total) })),
        ...returns.map(r => ({ ...r, type: "RETURN", date: r.returnDate, amount: Number(r.totalValue) })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
    const total = allTx.length;
    const pageTx = allTx.slice(skip, skip + take);
    const totalOut = purchases.reduce((s, p) => s + Number(p.total), 0);
    const totalIn = returns.reduce((s, r) => s + Number(r.totalValue), 0);
    const summary = { totalIn, totalOut, balance: totalOut - totalIn };
    return { items: pageTx, total, summary };
};


module.exports = {
    getSuppliers,
    getSupplierById,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    getSupplierOptions,
    getSupplierTransactions,
};