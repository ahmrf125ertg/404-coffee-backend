const app = require("./app");
const { port } = require("./config/env");
const logger = require("./lib/logger");

app.listen(port, () => {
  logger.info(`404 Coffee API running on http://localhost:${port}`);
});