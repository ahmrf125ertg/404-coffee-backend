const http = require("http");
const { execSync } = require("child_process");
const app = require("./app");
const { port } = require("./config/env");
const logger = require("./lib/logger");
const { initSocket } = require("./websocket/socket.server");

async function start() {
  try {
    logger.info("Running prisma migrate deploy...");
    execSync("npx prisma migrate deploy", { stdio: "inherit", timeout: 60000 });
    logger.info("Migrations applied successfully");
  } catch (err) {
    logger.error({ err: err.message }, "Migration failed, trying db push...");
    try {
      execSync("npx prisma db push --accept-data-loss", { stdio: "inherit", timeout: 60000 });
      logger.info("db push applied successfully");
    } catch (err2) {
      logger.error({ err: err2.message }, "db push also failed, starting server anyway");
    }
  }

  const server = http.createServer(app);
  initSocket(server);
  server.listen(port, () => {
    logger.info(`404 Coffee API running on http://localhost:${port}`);
  });
}

start();
