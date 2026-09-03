const deviceService = require("./device.service");
const { logAudit } = require("../../utils/audit");

// POST /api/auth/devices/register
const registerDevice = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { name, deviceFingerprint, deviceInfo } = req.body;
        const device = await deviceService.registerDevice({ userId, name, deviceFingerprint, deviceInfo });
        await logAudit(req, "devices", "register_device", `Device registered for user #${userId}: ${deviceFingerprint}`);
        res.status(201).json({
            success: true,
            message: device.status === "APPROVED" ? "Device registered and approved" : "Device registered, pending approval",
            data: { status: device.status, device },
        });
    } catch (error) { next(error); }
};

// GET /api/users/:id/devices
const getUserDevices = async (req, res, next) => {
    try {
        const userId = Number(req.params.id);
        if (!Number.isInteger(userId) || userId <= 0) {
            const error = new Error("Invalid user ID"); error.statusCode = 400; throw error;
        }
        const devices = await deviceService.getUserDevices(userId);
        res.status(200).json({ success: true, data: devices });
    } catch (error) { next(error); }
};

// PATCH /api/users/:id/devices/:deviceId
const approveOrRejectDevice = async (req, res, next) => {
    try {
        const userId = Number(req.params.id);
        const deviceId = Number(req.params.deviceId);
        const { status } = req.body;

        if (!Number.isInteger(userId) || userId <= 0) {
            const error = new Error("Invalid user ID"); error.statusCode = 400; throw error;
        }
        if (!Number.isInteger(deviceId) || deviceId <= 0) {
            const error = new Error("Invalid device ID"); error.statusCode = 400; throw error;
        }
        if (!["APPROVED", "REJECTED"].includes(status)) {
            const error = new Error("Status must be APPROVED or REJECTED"); error.statusCode = 400; throw error;
        }

        let device;
        if (status === "APPROVED") {
            device = await deviceService.approveDevice(userId, deviceId, req.user.userId);
            await logAudit(req, "devices", "approve_device", `Device #${deviceId} approved for user #${userId}`);
        } else {
            device = await deviceService.rejectDevice(userId, deviceId, req.user.userId);
            await logAudit(req, "devices", "reject_device", `Device #${deviceId} rejected for user #${userId}`);
        }

        res.status(200).json({ success: true, message: `Device ${status.toLowerCase()}`, data: device });
    } catch (error) { next(error); }
};

// DELETE /api/users/:id/devices/:deviceId
const revokeDevice = async (req, res, next) => {
    try {
        const userId = Number(req.params.id);
        const deviceId = Number(req.params.deviceId);

        if (!Number.isInteger(userId) || userId <= 0) {
            const error = new Error("Invalid user ID"); error.statusCode = 400; throw error;
        }
        if (!Number.isInteger(deviceId) || deviceId <= 0) {
            const error = new Error("Invalid device ID"); error.statusCode = 400; throw error;
        }

        const device = await deviceService.revokeDevice(userId, deviceId);
        await logAudit(req, "devices", "revoke_device", `Device #${deviceId} revoked for user #${userId}`);
        res.status(200).json({ success: true, message: "Device revoked", data: device });
    } catch (error) { next(error); }
};

module.exports = { registerDevice, getUserDevices, approveOrRejectDevice, revokeDevice };
