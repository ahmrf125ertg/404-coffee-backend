#!/bin/sh
set -e

echo "=== Prisma db push ===" >&2
npx prisma db push --accept-data-loss 2>&1 || true

echo "=== Starting Server ===" >&2
exec node src/server.js
