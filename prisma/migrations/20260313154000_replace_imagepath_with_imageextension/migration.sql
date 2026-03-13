-- Add new explicit image extension column
ALTER TABLE "Recipe"
ADD COLUMN "imageExtension" TEXT;

-- Backfill extension from legacy imagePath values
UPDATE "Recipe"
SET "imageExtension" = CASE
  WHEN "imagePath" ~ '\\.' THEN lower(regexp_replace("imagePath", '^.*\\.', ''))
  ELSE 'jpg'
END;

-- Enforce non-null and default for future records
ALTER TABLE "Recipe"
ALTER COLUMN "imageExtension" SET NOT NULL,
ALTER COLUMN "imageExtension" SET DEFAULT 'jpg';

-- Drop legacy filename/path column
ALTER TABLE "Recipe"
DROP COLUMN "imagePath";
