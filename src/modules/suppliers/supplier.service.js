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


module.exports = {
    getSuppliers,
    getSupplierById,
    createSupplier,
    updateSupplier,
    deleteSupplier,
};