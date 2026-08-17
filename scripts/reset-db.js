/**
 * scripts/reset-db.js — إعادة بناء الداتابيز من الصفر (تنظيف + migrate + seed)
 * يستخدم لبيئة التطوير فقط — لا تستخدمه مع بيانات حقيقية!
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

const DB_PATH = path.resolve(ROOT, "prisma", "dev.db");

for (const suffix of ["", "-wal", "-shm"]) {
  const file = DB_PATH + suffix;
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}

console.log("Removed dev.db — applying migrations...");

execSync("npx prisma migrate deploy", { cwd: ROOT, stdio: "inherit" });

execSync("node prisma/seed.js", { cwd: ROOT, stdio: "inherit" });

console.log("Database reset complete.");