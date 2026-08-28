const { Server } = require("socket.io");
const socketAuth = require("./socket.auth");
const logger = require("../lib/logger");

let io = null;

const ORDER_ROOM = "orders";
const KITCHEN_ROOM = "kitchen";

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use(socketAuth);

  io.on("connection", (socket) => {
    const { userId, role } = socket.user;

    socket.join(ORDER_ROOM);
    socket.join(KITCHEN_ROOM);

    logger.info(
      { userId, role, socketId: socket.id },
      "Socket connected"
    );

    socket.on("disconnect", (reason) => {
      logger.info(
        { userId, socketId: socket.id, reason },
        "Socket disconnected"
      );
    });
  });

  logger.info("WebSocket server initialized");

  return io;
};

const getIO = () => io;

module.exports = { initSocket, getIO };
