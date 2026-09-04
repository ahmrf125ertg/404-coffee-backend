/**
 * services/raw-material.service.js
 * ============================================================
 * Raw Material Service
 *
 * RawMaterial = تعريف المادة الخام نفسها.
 * RawMaterialBatch = كل دفعة من المادة بكمية وسعر وتاريخ صلاحية مختلف.
 */

const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

// ============================================================
// Get all raw materials
// ============================================================

const getRawMaterials = async (reqQuery = {}) => {
    const { skip, take } = parsePagination(reqQuery);

    const [rawMaterials, total] = await Promise.all([
        prisma.rawMaterial.findMany({
            orderBy: {
                createdAt: "desc",
            },

            include: {
                batches: {
                    orderBy: [
                        {
                            expiryDate: "asc",
                        },
                        {
                            createdAt: "asc",
                        },
                    ],
                },
            },

            skip,
            take,
        }),
        prisma.rawMaterial.count(),
    ]);

    return { items: rawMaterials, total };
};

// ============================================================
// Create raw material
// ============================================================

const createRawMaterial = async ({
    name,
    unit,
    quantity,
    pricePerUnit,
    supplier,
    addedAt,
    expiryDate,
    minStockAlert,
    expiryAlertDays,
}) => {
    // Check required fields
    if (
        !name ||
        !unit ||
        quantity === undefined ||
        pricePerUnit === undefined ||
        !supplier ||
        minStockAlert === undefined
    ) {
        const error = new Error(
            "Required raw material data is missing"
        );

        error.statusCode = 400;
        throw error;
    }

    // Check if raw material already exists
    const existingMaterial = await prisma.rawMaterial.findUnique({
        where: {
            name,
        },
    });

    let rawMaterial;

    // ========================================================
    // If material already exists:
    // Create a new batch
    // ========================================================

    if (existingMaterial) {
        rawMaterial = await prisma.rawMaterial.update({
            where: {
                id: existingMaterial.id,
            },

            data: {
                batches: {
                    create: {
                        quantity,
                        pricePerUnit,
                        addedAt: addedAt
                            ? new Date(addedAt)
                            : new Date(),
                        expiryDate: expiryDate
                            ? new Date(expiryDate)
                            : null,
                    },
                },
            },

            include: {
                batches: {
                    orderBy: [
                        {
                            expiryDate: "asc",
                        },
                        {
                            createdAt: "asc",
                        },
                    ],
                },
            },
        });

        return rawMaterial;
    }

    // ========================================================
    // If material doesn't exist:
    // Create material + first batch
    // ========================================================

    rawMaterial = await prisma.rawMaterial.create({
        data: {
            name,
            unit,
            supplier,
            minStockAlert,

            expiryAlertDays:
                expiryAlertDays !== undefined
                    ? expiryAlertDays
                    : null,

            addedAt: addedAt
                ? new Date(addedAt)
                : new Date(),

            batches: {
                create: {
                    quantity,
                    pricePerUnit,
                    addedAt: addedAt
                        ? new Date(addedAt)
                        : new Date(),
                    expiryDate: expiryDate
                        ? new Date(expiryDate)
                        : null,
                },
            },
        },

        include: {
            batches: true,
        },
    });

    return rawMaterial;
};

// ============================================================
// Update raw material
// ============================================================

const updateRawMaterial = async (id, data) => {
    const rawMaterialId = Number(id);

    // Check material exists
    const existingMaterial = await prisma.rawMaterial.findUnique({
        where: {
            id: rawMaterialId,
        },
    });

    if (!existingMaterial) {
        const error = new Error("Raw material not found");
        error.statusCode = 404;
        throw error;
    }

    const {
        name,
        unit,
        supplier,
        addedAt,
        minStockAlert,
        expiryAlertDays,

        // Batch fields
        quantity,
        pricePerUnit,
        expiryDate,
    } = data;

    // Update main RawMaterial data
    const updateData = {
        ...(name !== undefined && { name }),
        ...(unit !== undefined && { unit }),
        ...(supplier !== undefined && { supplier }),

        ...(addedAt !== undefined && {
            addedAt: new Date(addedAt),
        }),

        ...(minStockAlert !== undefined && {
            minStockAlert,
        }),

        ...(expiryAlertDays !== undefined && {
            expiryAlertDays,
        }),
    };

    // If batch data was sent, create a new batch
    const hasBatchData =
        quantity !== undefined ||
        pricePerUnit !== undefined ||
        expiryDate !== undefined;

    if (hasBatchData) {
        // All batch fields are required when creating
        // a new batch through update
        if (
            quantity === undefined ||
            pricePerUnit === undefined
        ) {
            const error = new Error(
                "quantity and pricePerUnit are required when creating a batch"
            );

            error.statusCode = 400;
            throw error;
        }

        updateData.batches = {
            create: {
                quantity,
                pricePerUnit,
                expiryDate: expiryDate
                    ? new Date(expiryDate)
                    : null,
            },
        };
    }

    const updatedMaterial = await prisma.rawMaterial.update({
        where: {
            id: rawMaterialId,
        },

        data: updateData,

        include: {
            batches: {
                orderBy: [
                    {
                        expiryDate: "asc",
                    },
                    {
                        createdAt: "asc",
                    },
                ],
            },
        },
    });

    return updatedMaterial;
};

// ============================================================
// Delete raw material
// ============================================================

const deleteRawMaterial = async (id) => {
    const rawMaterialId = Number(id);

    const existingMaterial = await prisma.rawMaterial.findUnique({
        where: {
            id: rawMaterialId,
        },

        include: {
            batches: true,
        },
    });

    if (!existingMaterial) {
        const error = new Error("Raw material not found");
        error.statusCode = 404;
        throw error;
    }

    await prisma.rawMaterial.delete({
        where: {
            id: rawMaterialId,
        },
    });

    return existingMaterial;
};


// Add new batch
const addBatch = async (rawMaterialId, batchData) => {
    const material = await prisma.rawMaterial.findUnique({
        where: {
            id: Number(rawMaterialId),
        },
    });

    if (!material) {
        const error = new Error("Raw material not found");
        error.statusCode = 404;
        throw error;
    }

    const { quantity, pricePerUnit, expiryDate, addedAt } =
        batchData;

    if (
        quantity === undefined ||
        pricePerUnit === undefined
    ) {
        const error = new Error(
            "quantity and pricePerUnit are required"
        );
        error.statusCode = 400;
        throw error;
    }

    const batch = await prisma.rawMaterialBatch.create({
        data: {
            rawMaterialId: Number(rawMaterialId),
            quantity,
            pricePerUnit,
            expiryDate: expiryDate
                ? new Date(expiryDate)
                : null,
            addedAt: addedAt ? new Date(addedAt) : new Date(),
        },
    });

    return batch;
};


// Get material batches
const getMaterialBatches = async (rawMaterialId) => {
    const material = await prisma.rawMaterial.findUnique({
        where: {
            id: Number(rawMaterialId),
        },
    });

    if (!material) {
        const error = new Error("Raw material not found");
        error.statusCode = 404;
        throw error;
    }

    const batches = await prisma.rawMaterialBatch.findMany({
        where: {
            rawMaterialId: Number(rawMaterialId),
        },
        orderBy: [
            {
                expiryDate: "asc",
            },
            {
                createdAt: "asc",
            },
        ],
    });

    return batches;
};

// ============================================================
// Get raw materials options (for dropdowns)
// ============================================================

const getRawMaterialsOptions = async () => {
    const materials = await prisma.rawMaterial.findMany({
        select: {
            id: true,
            name: true,
            unit: true,
        },
        orderBy: { name: "asc" },
    });
    return materials;
};

module.exports = {
    getRawMaterials,
    createRawMaterial,
    updateRawMaterial,
    deleteRawMaterial,
    addBatch,
    getMaterialBatches,
    getRawMaterialsOptions,
};