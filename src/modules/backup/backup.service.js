/**
 * modules/backup/backup.service.js
 * ================================
 * نسخ احتياطي آمن ومتسق لملف SQLite عبر الـ Online Backup API بتاع better-sqlite3.
 * بيضمن نسخة متسقة حتى لو في عمليات كتابة شغالة وقت التصوير.
 */

const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const Database = require("better-sqlite3");
const { logAudit } = require("../../utils/audit");

const readFile = promisify(fs.readFile);

const resolveDatabasePath = () => {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not defined");
  }

  const filePart = url.replace(/^file:/i, "");

  return path.isAbsolute(filePart)
    ? filePart
    : path.resolve(process.cwd(), filePart);
};

const performBackup = async (destinationPath) => {
  const sourcePath = resolveDatabasePath();

  if (!fs.existsSync(sourcePath)) {
    const error = new Error(`Database file not found at ${sourcePath}`);
    error.statusCode = 500;
    throw error;
  }

  // فتح المصدر read-only — مش عايزين نسبق على القاعدة ولا نغير فيها أي حاجة
  const source = new Database(sourcePath, { readonly: true });

  try {
    await source.backup(destinationPath);
  } finally {
    source.close();
  }
};

const downloadBackup = async (req, res, next) => {
  const tempFile = path.join(
    require("os").tmpdir(),
    `404-coffee-backup-${Date.now()}.db`
  );

  try {
    await performBackup(tempFile);

    const content = await readFile(tempFile);

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="404-coffee-backup-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.db"`
    );
    res.setHeader("Content-Length", content.length);

    res.send(content);

    await logAudit(req, "backup", "download_backup", "Manual database backup downloaded");
  } catch (error) {
    next(error);
  } finally {
    fs.unlink(tempFile, () => {});
  }
};

module.exports = {
  resolveDatabasePath,
  performBackup,
  downloadBackup,
};