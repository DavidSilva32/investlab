ALTER TABLE "portfolio_objectives" ADD COLUMN "purpose" varchar(32);
UPDATE "portfolio_objectives" SET "purpose" = 'RESERVE' WHERE "kind" = 'RESERVE';
