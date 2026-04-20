-- Convert recipe ingredients from text[] to jsonb sections.
ALTER TABLE "Recipe"
ALTER COLUMN "ingredients" TYPE JSONB
USING (
  CASE
    WHEN "ingredients" IS NULL THEN '[]'::jsonb
    ELSE jsonb_build_array(
      jsonb_build_object(
        'title', 'Hauptzutaten',
        'items', to_jsonb("ingredients")
      )
    )
  END
);

UPDATE "Recipe"
SET "ingredients" = '[]'::jsonb
WHERE "ingredients" IS NULL;

ALTER TABLE "Recipe"
ALTER COLUMN "ingredients" SET DEFAULT '[]'::jsonb;

ALTER TABLE "Recipe"
ALTER COLUMN "ingredients" SET NOT NULL;
