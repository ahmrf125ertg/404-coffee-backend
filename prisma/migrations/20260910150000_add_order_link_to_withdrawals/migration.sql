-- AlterTable
ALTER TABLE "raw_material_withdrawals" ADD COLUMN "orderId" INTEGER;

-- CreateIndex
CREATE INDEX "raw_material_withdrawals_orderId_idx" ON "raw_material_withdrawals"("orderId");

-- AddForeignKey
ALTER TABLE "raw_material_withdrawals" ADD CONSTRAINT "raw_material_withdrawals_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
