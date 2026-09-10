-- CreateTable
CREATE TABLE "order_item_addons" (
    "id" SERIAL NOT NULL,
    "orderItemId" INTEGER NOT NULL,
    "addonId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_addons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_item_addons_orderItemId_addonId_key" ON "order_item_addons"("orderItemId", "addonId");

-- CreateIndex
CREATE INDEX "order_item_addons_orderItemId_idx" ON "order_item_addons"("orderItemId");

-- CreateIndex
CREATE INDEX "order_item_addons_addonId_idx" ON "order_item_addons"("addonId");

-- AddForeignKey
ALTER TABLE "order_item_addons" ADD CONSTRAINT "order_item_addons_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_addons" ADD CONSTRAINT "order_item_addons_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "product_addons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddNotesColumn (if not exists)
ALTER TABLE "order_items" ADD COLUMN "notes" TEXT;
