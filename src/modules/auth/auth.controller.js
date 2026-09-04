const authService = require("./auth.service");

const { logAudit } = require("../../utils/audit");

const loginUser = async (req, res, next) => {

    try {
        const result = await authService.loginUser(req.body);

        // Record successful login in the audit log
        await logAudit(
            { ...req, user: { userId: result.employee.id } },
            "auth",
            "login",
            `User ${result.employee.name} logged in`
        );

        res.status(200).json({
            success: true,
            message: "Login successful",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

const getMe = async (req, res, next) => {
    try {
        const result = await authService.getMe(req.user.userId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

const refreshToken = async (req, res, next) => {
    try {
        const token = req.body.refreshToken;
        const result = await authService.refreshToken(token);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

const logoutUser = async (req, res, next) => {
    try {
        const { allDevices } = req.body || {};
        await authService.logoutUser(req.user.userId, allDevices);
        await logAudit(req, "auth", "logout", `User ${req.user.userId} logged out${allDevices ? " (all devices)" : ""}`);
        res.status(200).json({ success: true, data: { loggedOut: true } });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    loginUser,
    getMe,
    refreshToken,
    logoutUser,
}