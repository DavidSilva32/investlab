ALTER TABLE "movement_items" ADD COLUMN "eventFingerprint" varchar(32);--> statement-breakpoint
UPDATE "movement_items"
SET "eventFingerprint" = md5(concat(
  "direction", chr(31),
  "occurredAt"::text, chr(31),
  upper(btrim("movementType")), chr(31),
  upper(btrim("product")), chr(31),
  upper(btrim(coalesce("assetCode", ''))), chr(31),
  upper(btrim(coalesce("institution", ''))), chr(31),
  rtrim(rtrim("quantity"::text, '0'), '.'), chr(31),
  CASE WHEN "unitPrice" IS NULL THEN '' ELSE rtrim(rtrim("unitPrice"::text, '0'), '.') END, chr(31),
  CASE WHEN "operationValue" IS NULL THEN '' ELSE rtrim(rtrim("operationValue"::text, '0'), '.') END
));--> statement-breakpoint
DELETE FROM "movement_items"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "eventFingerprint"
        ORDER BY "createdAt", "id"
      ) AS row_number
    FROM "movement_items"
  ) AS duplicates
  WHERE row_number > 1
);--> statement-breakpoint
ALTER TABLE "movement_items" ALTER COLUMN "eventFingerprint" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "movement_items" ADD CONSTRAINT "movement_items_eventFingerprint_unique" UNIQUE("eventFingerprint");
