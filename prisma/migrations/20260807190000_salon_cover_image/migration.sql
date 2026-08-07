-- AlterTable
ALTER TABLE "Salon" DROP COLUMN "coverImageUrl",
ADD COLUMN     "coverImageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Salon_coverImageId_key" ON "Salon"("coverImageId");

-- AddForeignKey
ALTER TABLE "Salon" ADD CONSTRAINT "Salon_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "Image"("id") ON DELETE SET NULL ON UPDATE CASCADE;
