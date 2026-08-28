const http = require("http");
const app = require("./app");
const { port } = require("./config/env");
const logger = require("./lib/logger");
const { initSocket } = require("./websocket/socket.server");

const server = http.createServer(app);

initSocket(server);

server.listen(port, () => {
  logger.info(`404 Coffee API running on http://localhost:${port}`);
});
