-- AlterTable
ALTER TABLE "User" ADD COLUMN "usernameCanonical" TEXT;

-- Backfill canonical usernames for existing rows
UPDATE "User"
SET "usernameCanonical" = lower("username")
WHERE "username" IS NOT NULL;

-- Remove old case-sensitive uniqueness and replace with canonical uniqueness
DROP INDEX "User_username_key";
CREATE UNIQUE INDEX "User_usernameCanonical_key" ON "User"("usernameCanonical");

-- CreateTable
CREATE TABLE "FavoriteRecipe" (
	"userId" TEXT NOT NULL,
	"recipeId" TEXT NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "FavoriteRecipe_pkey" PRIMARY KEY ("userId","recipeId")
);

-- CreateIndex
CREATE INDEX "FavoriteRecipe_recipeId_idx" ON "FavoriteRecipe"("recipeId");

-- AddForeignKey
ALTER TABLE "FavoriteRecipe" ADD CONSTRAINT "FavoriteRecipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteRecipe" ADD CONSTRAINT "FavoriteRecipe_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
