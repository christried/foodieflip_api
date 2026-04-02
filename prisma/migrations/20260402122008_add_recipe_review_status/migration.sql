-- CreateEnum
CREATE TYPE "RecipeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "status" "RecipeStatus" NOT NULL DEFAULT 'PENDING';
