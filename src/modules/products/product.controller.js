const productService = require("./product.service");
const { logAudit } = require("../../utils/audit");

// Get all products
const getProducts = async (req, res, next) => {
    try {
        const result = await productService.getProducts(req.query);

        res.status(200).json({
            success: true,
            data: result.items,
            pagination: {
                page: result.page,
                pageSize: result.pageSize,
                total: result.total,
                totalPages: result.totalPages,
            },
        });
    } catch (error) {
        next(error);
    }
};

// Get product by ID
const getProductById = async (req, res, next) => {
    try {
        const product = await productService.getProductById(
            req.params.id
        );

        res.status(200).json({
            success: true,
            data: product,
        });
    } catch (error) {
        next(error);
    }
};

// Create product
const createProduct = async (req, res, next) => {
    try {
        const product = await productService.createProduct(
            req.body
        );


                // Record in audit log
                await logAudit(req, "products", "create_product", "Product created successfully");        res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: product,
        });
    } catch (error) {
        next(error);
    }
};

// Update product
const updateProduct = async (req, res, next) => {
    try {
        const product = await productService.updateProduct(
            req.params.id,
            req.body
        );


                // Record in audit log
                await logAudit(req, "products", "edit_product", "Product updated successfully");        res.status(200).json({
            success: true,
            message: "Product updated successfully",
            data: product,
        });
    } catch (error) {
        next(error);
    }
};

// Delete product
const deleteProduct = async (req, res, next) => {
    try {
        const product = await productService.deleteProduct(
            req.params.id
        );


                // Record in audit log
                await logAudit(req, "products", "delete_product", "Product deleted successfully");        res.status(200).json({
            success: true,
            message: "Product deleted successfully",
            data: product,
        });
    } catch (error) {
        next(error);
    }
};


// Create product size
const createProductSize = async (req, res, next) => {
    try {
        const size = await productService.createProductSize({
            productId: req.params.productId,
            ...req.body,
        });

        res.status(201).json({
            success: true,
            message: "Product size created successfully",
            data: size,
        });
    } catch (error) {
        next(error);
    }
};

// Get product sizes
const getProductSizes = async (req, res, next) => {
    try {
        const sizes = await productService.getProductSizes(
            req.params.productId
        );

        res.status(200).json({
            success: true,
            data: sizes,
        });
    } catch (error) {
        next(error);
    }
};


// Add ingredient to product size
const createProductSizeIngredient = async (req, res, next) => {
    try {
        const ingredient =
            await productService.createProductSizeIngredient({
                productSizeId: req.params.sizeId,
                ...req.body,
            });

        res.status(201).json({
            success: true,
            message: "Ingredient added successfully",
            data: ingredient,
        });
    } catch (error) {
        next(error);
    }
};






// Get all product types
const getProductTypes = async (req, res, next) => {
    try {
        const types = await productService.getProductTypes(
            req.params.productId
        );

        res.status(200).json({
            success: true,
            data: types,
        });
    } catch (error) {
        next(error);
    }
};


// Create product type
const createProductType = async (req, res, next) => {
    try {
        const type = await productService.createProductType({
            productId: req.params.productId,
            ...req.body,
        });

        res.status(201).json({
            success: true,
            message: "Product type created successfully",
            data: type,
        });
    } catch (error) {
        next(error);
    }
};


// Update product type
const updateProductType = async (req, res, next) => {
    try {
        const type = await productService.updateProductType(
            req.params.typeId,
            req.body
        );

        res.status(200).json({
            success: true,
            message: "Product type updated successfully",
            data: type,
        });
    } catch (error) {
        next(error);
    }
};


// Delete product type
const deleteProductType = async (req, res, next) => {
    try {
        const type = await productService.deleteProductType(
            req.params.typeId
        );

        res.status(200).json({
            success: true,
            message: "Product type deleted successfully",
            data: type,
        });
    } catch (error) {
        next(error);
    }
};


// Add ingredient to product type
const addProductTypeIngredient = async (req, res, next) => {
    try {
        const ingredient =
            await productService.addProductTypeIngredient({
                productTypeId: req.params.typeId,
                rawMaterialId: req.params.rawMaterialId,
            });

        res.status(201).json({
            success: true,
            message: "Ingredient added successfully",
            data: ingredient,
        });
    } catch (error) {
        next(error);
    }
};


// Remove ingredient from product type
const removeProductTypeIngredient = async (req, res, next) => {
    try {
        const ingredient =
            await productService.removeProductTypeIngredient({
                productTypeId: req.params.typeId,
                rawMaterialId: req.params.rawMaterialId,
            });

        res.status(200).json({
            success: true,
            message: "Ingredient removed successfully",
            data: ingredient,
        });
    } catch (error) {
        next(error);
    }
};


// Get all addons for a product
const getAddons = async (req, res, next) => {
    try {
        const addons = await productService.getAddons(
            req.params.productId
        );

        res.status(200).json({
            success: true,
            data: addons,
        });
    } catch (error) {
        next(error);
    }
};


// Create addon
const createAddon = async (req, res, next) => {
    try {
        const addon = await productService.createAddon({
            productId: req.params.productId,
            ...req.body,
        });

        res.status(201).json({
            success: true,
            message: "Addon created successfully",
            data: addon,
        });
    } catch (error) {
        next(error);
    }
};


// Update addon
const updateAddon = async (req, res, next) => {
    try {
        const addon = await productService.updateAddon(
            req.params.addonId,
            req.body
        );

        res.status(200).json({
            success: true,
            message: "Addon updated successfully",
            data: addon,
        });
    } catch (error) {
        next(error);
    }
};


// Delete addon
const deleteAddon = async (req, res, next) => {
    try {
        const addon = await productService.deleteAddon(
            req.params.addonId
        );

        res.status(200).json({
            success: true,
            message: "Addon deleted successfully",
            data: addon,
        });
    } catch (error) {
        next(error);
    }
};




module.exports = {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    createProductSize,
    getProductSizes,
    createProductSizeIngredient,
    getProductTypes,
    createProductType,
    updateProductType,
    deleteProductType,
    addProductTypeIngredient,
    removeProductTypeIngredient,
    getAddons,
    createAddon,
    updateAddon,
    deleteAddon,
};