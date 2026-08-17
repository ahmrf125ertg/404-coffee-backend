const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const { downloadBackup } = require("./backup.service");

const router = express.Router();

// Download a consistent snapshot of the SQLite database
router.get(
  "/download",
  authMiddleware,
  requirePermission("backup", "download_backup"),
  downloadBackup
);

module.exports = router;