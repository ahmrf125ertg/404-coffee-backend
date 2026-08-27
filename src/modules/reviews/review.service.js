const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

const httpError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const createReview = async ({ customerId, orderId, productId, rating, comment }) => {
    if (!customerId || !Number.isInteger(Number(customerId)) || Number(customerId) <= 0) {
        throw httpError("Valid customerId is required");
    }

    if (!productId || !Number.isInteger(Number(productId)) || Number(productId) <= 0) {
        throw httpError("Valid productId is required");
    }

    const parsedRating = Number(rating);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        throw httpError("Rating must be an integer between 1 and 5");
    }

    const customer = await prisma.customer.findUnique({ where: { id: Number(customerId) } });
    if (!customer) {
        throw httpError("Customer not found", 404);
    }

    const product = await prisma.product.findUnique({ where: { id: Number(productId) } });
    if (!product) {
        throw httpError("Product not found", 404);
    }

    if (orderId !== undefined && orderId !== null) {
        const order = await prisma.order.findUnique({ where: { id: Number(orderId) } });
        if (!order) {
            throw httpError("Order not found", 404);
        }
    }

    return prisma.review.create({
        data: {
            customerId: Number(customerId),
            orderId: orderId ? Number(orderId) : null,
            productId: Number(productId),
            rating: parsedRating,
            comment: comment || null,
        },
        include: {
            customer: { select: { id: true, name: true, phone: true } },
            product: { select: { id: true, name: true } },
            order: { select: { id: true, orderNumber: true } },
        },
    });
};

const getReviews = async (filters = {}) => {
    const { page, pageSize, skip, take } = parsePagination(filters);
    const { customerId, productId } = filters;

    const where = {};
    if (customerId) where.customerId = Number(customerId);
    if (productId) where.productId = Number(productId);

    const [reviews, total] = await Promise.all([
        prisma.review.findMany({
            where,
            include: {
                customer: { select: { id: true, name: true, phone: true } },
                product: { select: { id: true, name: true } },
                order: { select: { id: true, orderNumber: true } },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take,
        }),
        prisma.review.count({ where }),
    ]);

    return {
        items: reviews,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    };
};

const getReviewById = async (id) => {
    const reviewId = Number(id);
    if (!Number.isInteger(reviewId) || reviewId <= 0) {
        throw httpError("Invalid review ID");
    }

    const review = await prisma.review.findUnique({
        where: { id: reviewId },
        include: {
            customer: { select: { id: true, name: true, phone: true } },
            product: { select: { id: true, name: true } },
            order: { select: { id: true, orderNumber: true } },
        },
    });

    if (!review) {
        throw httpError("Review not found", 404);
    }

    return review;
};

const deleteReview = async (id) => {
    const reviewId = Number(id);
    if (!Number.isInteger(reviewId) || reviewId <= 0) {
        throw httpError("Invalid review ID");
    }

    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
        throw httpError("Review not found", 404);
    }

    await prisma.review.delete({ where: { id: reviewId } });
    return review;
};

module.exports = {
    createReview,
    getReviews,
    getReviewById,
    deleteReview,
};
