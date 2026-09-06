const logger = require("../lib/logger");

const ORDER_CREATED = "order:created";
const ORDER_UPDATED = "order:updated";
const ORDER_ITEM_UPDATED = "order:item:updated";
const SERVICE_REQUEST_CREATED = "service-request:created";
const SERVICE_REQUEST_RESOLVED = "service-request:resolved";

const emitOrderCreated = (order) => {
  try {
    const io = require("./socket.server").getIO();
    if (!io) return;

    io.to("orders").to("kitchen").emit(ORDER_CREATED, {
      event: ORDER_CREATED,
      order,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to emit order:created");
  }
};

const emitOrderUpdated = (order) => {
  try {
    const io = require("./socket.server").getIO();
    if (!io) return;

    io.to("orders").to("kitchen").emit(ORDER_UPDATED, {
      event: ORDER_UPDATED,
      order,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to emit order:updated");
  }
};

const emitOrderItemUpdated = ({ orderId, itemId, status, orderStatus }) => {
  try {
    const io = require("./socket.server").getIO();
    if (!io) return;

    io.to("orders").to("kitchen").emit(ORDER_ITEM_UPDATED, {
      event: ORDER_ITEM_UPDATED,
      orderId,
      itemId,
      status,
      orderStatus,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to emit order:item:updated");
  }
};

const emitServiceRequestCreated = (request) => {
  try {
    const io = require("./socket.server").getIO();
    if (!io) return;

    io.to("orders").emit(SERVICE_REQUEST_CREATED, {
      event: SERVICE_REQUEST_CREATED,
      request,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to emit service-request:created");
  }
};

const emitServiceRequestResolved = (request) => {
  try {
    const io = require("./socket.server").getIO();
    if (!io) return;

    io.to("orders").emit(SERVICE_REQUEST_RESOLVED, {
      event: SERVICE_REQUEST_RESOLVED,
      request,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to emit service-request:resolved");
  }
};

const DASHBOARD_UPDATED = "dashboard:updated";
const INVENTORY_UPDATED = "inventory:updated";

const emitDashboardUpdated = (data) => {
    try {
        const io = require("./socket.server").getIO();
        if (!io) return;
        io.emit(DASHBOARD_UPDATED, { event: DASHBOARD_UPDATED, ...data, at: new Date().toISOString() });
    } catch (error) { logger.error({ err: error }, "Failed to emit dashboard:updated"); }
};

const emitInventoryUpdated = (data) => {
    try {
        const io = require("./socket.server").getIO();
        if (!io) return;
        io.emit(INVENTORY_UPDATED, { event: INVENTORY_UPDATED, ...data, at: new Date().toISOString() });
    } catch (error) { logger.error({ err: error }, "Failed to emit inventory:updated"); }
};

module.exports = {
  ORDER_CREATED,
  ORDER_UPDATED,
  ORDER_ITEM_UPDATED,
  SERVICE_REQUEST_CREATED,
  SERVICE_REQUEST_RESOLVED,
  emitOrderCreated,
  emitOrderUpdated,
  emitOrderItemUpdated,
  emitServiceRequestCreated,
  emitServiceRequestResolved,
  emitDashboardUpdated,
  emitInventoryUpdated,
};
