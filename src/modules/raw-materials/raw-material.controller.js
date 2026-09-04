/**
 * controllers/raw-material.controller.js  — Controller المواد الخام
 * ================================================================================
 * الهدف: طبقة HTTP رفيعة (thin controller) - بتستقبل الـ request، بتنده الـ service 
 * المناسب، وبترجع الـ response. نفس نمط user.controller.js بالظبط.
 * 
 * getRawMaterials: يرجع كل المواد الخام (من غير pagination لسه - نفس الملاحظة اللي 
 * قلتها قبل كده على الـ service).
 * 
 * createRawMaterial: بياخد بيانات المادة من req.body ويبعتها زي ما هي لـ service، 
 * ويرجع 201 لو نجح.
 */

const rawMaterialService = require("./raw-material.service");
const { logAudit } = require("../../utils/audit");
const { parsePagination } = require("../../utils/pagination");

// Get all raw materials
const getRawMaterials = async (req, res, next) => {
    try {
        const { items, total } = await rawMaterialService.getRawMaterials(req.query);
        const { page, pageSize } = parsePagination(req.query);

        res.status(200).json({
            success: true,
            data: items,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        });

    } catch (error) {
        next(error);
    }
};

// Create raw material
const createRawMaterial = async (req, res, next) => {
    try {
        const rawMaterial = await rawMaterialService.createRawMaterial(req.body);


                // Record in audit log
                await logAudit(req, "inventory", "create_raw_material", "Raw material created successfully");        res.status(201).json({
            success: true,
            message: "Raw material created successfully",
            data: rawMaterial,
        });

    } catch (error) {
        next(error);
    }
};

// Update raw material
const updateRawMaterial = async (req, res, next) => {
    try {
        const rawMaterial = await rawMaterialService.updateRawMaterial(
            req.params.id,
            req.body
        );


                // Record in audit log
                await logAudit(req, "inventory", "edit_raw_material", "Raw material updated successfully");        res.status(200).json({
            success: true,
            message: "Raw material updated successfully",
            data: rawMaterial,
        });
    } catch (error) {
        next(error);
    }
};

// Delete raw material
const deleteRawMaterial = async (req, res, next) => {
    try {
        const rawMaterial = await rawMaterialService.deleteRawMaterial(
            req.params.id
        );


                // Record in audit log
                await logAudit(req, "inventory", "delete_raw_material", "Raw material deleted successfully");        res.status(200).json({
            success: true,
            message: "Raw material deleted successfully",
            data: rawMaterial,
        });
    } catch (error) {
        next(error);
    }
};


const addBatch = async (req, res, next) => {
    try {
        const batch =
            await rawMaterialService.addBatch(
                req.params.id,
                req.body
            );


                // Record in audit log
                await logAudit(req, "inventory", "add_batch", "Batch added successfully");        res.status(201).json({
            success: true,
            message: "Batch added successfully",
            data: batch,
        });
    } catch (error) {
        next(error);
    }
};

const getMaterialBatches = async (
    req,
    res,
    next
) => {
    try {
        const batches =
            await rawMaterialService.getMaterialBatches(
                req.params.id
            );

        res.status(200).json({
            success: true,
            data: batches,
        });
    } catch (error) {
        next(error);
    }
};

const getRawMaterialsOptions = async (req, res, next) => {
    try {
        const options = await rawMaterialService.getRawMaterialsOptions();
        res.status(200).json({ success: true, data: options });
    } catch (error) {
        next(error);
    }
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