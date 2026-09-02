const delegateService = require("./delegate.service");
const { logAudit } = require("../../utils/audit");
const { parsePagination } = require("../../utils/pagination");

// Get all delegates
const getDelegates = async (req, res, next) => {
    try {
        const { page, pageSize } = parsePagination(req.query);
        const { items, total } = await delegateService.getDelegates(req.query);

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


// Get delegate by ID
const getDelegateById = async (req, res, next) => {
    try {
        const delegate = await delegateService.getDelegateById(
            req.params.id
        );

        res.status(200).json({
            success: true,
            data: delegate,
        });
    } catch (error) {
        next(error);
    }
};


// Create delegate
const createDelegate = async (req, res, next) => {
    try {
        const delegate = await delegateService.createDelegate(
            req.body
        );


                // Record in audit log
                await logAudit(req, "delegates", "create_delegate", "Delegate created successfully");        res.status(201).json({
            success: true,
            message: "Delegate created successfully",
            data: delegate,
        });
    } catch (error) {
        next(error);
    }
};


// Update delegate
const updateDelegate = async (req, res, next) => {
    try {
        const delegate = await delegateService.updateDelegate(
            req.params.id,
            req.body
        );


                // Record in audit log
                await logAudit(req, "delegates", "edit_delegate", "Delegate updated successfully");        res.status(200).json({
            success: true,
            message: "Delegate updated successfully",
            data: delegate,
        });
    } catch (error) {
        next(error);
    }
};


// Update delegate status
const updateDelegateStatus = async (req, res, next) => {
    try {
        const delegate = await delegateService.updateDelegateStatus(
            req.params.id,
            req.body.status
        );


                // Record in audit log
                await logAudit(req, "delegates", "change_delegate_status", "Delegate status updated successfully");        res.status(200).json({
            success: true,
            message: "Delegate status updated successfully",
            data: delegate,
        });
    } catch (error) {
        next(error);
    }
};


// Delete delegate
const deleteDelegate = async (req, res, next) => {
    try {
        const delegate = await delegateService.deleteDelegate(
            req.params.id
        );


                // Record in audit log
                await logAudit(req, "delegates", "delete_delegate", "Delegate deleted successfully");        res.status(200).json({
            success: true,
            message: "Delegate deleted successfully",
            data: delegate,
        });
    } catch (error) {
        next(error);
    }
};


// Get delegate options
const getDelegateOptions = async (req, res, next) => {
    try {
        const options = await delegateService.getDelegateOptions(req.query);
        res.status(200).json({ success: true, data: options });
    } catch (error) { next(error); }
};


// Get delegate orders
const getDelegateOrders = async (req, res, next) => {
    try {
        const { page, pageSize } = parsePagination(req.query);
        const { items, total } = await delegateService.getDelegateOrders(req.params.id, req.query);
        res.status(200).json({ success: true, data: items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    } catch (error) { next(error); }
};


// Get delegate collections
const getDelegateCollections = async (req, res, next) => {
    try {
        const { page, pageSize } = parsePagination(req.query);
        const { items, total } = await delegateService.getDelegateCollections(req.params.id, req.query);
        res.status(200).json({ success: true, data: items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    } catch (error) { next(error); }
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