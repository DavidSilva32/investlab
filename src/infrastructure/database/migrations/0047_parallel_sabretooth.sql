ALTER TABLE "cdb_rate_configurations" DROP CONSTRAINT "cdb_rate_configurations_assetCode_unique";--> statement-breakpoint
ALTER TABLE "imports" DROP CONSTRAINT "imports_fileHash_unique";--> statement-breakpoint
ALTER TABLE "manual_portfolio_positions" DROP CONSTRAINT "manual_portfolio_positions_assetKey_unique";--> statement-breakpoint
ALTER TABLE "movement_items" DROP CONSTRAINT "movement_items_eventFingerprint_unique";--> statement-breakpoint
ALTER TABLE "portfolio_objective_positions" DROP CONSTRAINT "portfolio_objective_positions_assetKey_unique";--> statement-breakpoint
DROP INDEX "manual_portfolio_position_snapshots_asset_recorded_uidx";--> statement-breakpoint
DROP INDEX "stock_opportunity_manual_ticker_input_idx";--> statement-breakpoint
DROP INDEX "manual_portfolio_operations_idempotency_key_unique";--> statement-breakpoint
ALTER TABLE "emergency_reserve_settings" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "emergency_reserve_settings" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "personal_investment_strategy" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "personal_investment_strategy" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "portfolio_allocation_targets" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "portfolio_allocation_targets" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "portfolio_asset_classifications" DROP CONSTRAINT "portfolio_asset_classifications_pkey";--> statement-breakpoint
ALTER TABLE "stock_opportunity_analysis_settings" ALTER COLUMN "id" SET DATA TYPE text USING "id"::text;--> statement-breakpoint
ALTER TABLE "stock_opportunity_analysis_settings" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "portfolio_asset_classifications" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_asset_classifications" ADD CONSTRAINT "portfolio_asset_classifications_pkey" PRIMARY KEY("id");--> statement-breakpoint
CREATE UNIQUE INDEX "cdb_rate_configurations_user_asset_uidx" ON "cdb_rate_configurations" USING btree ("userId","assetCode");--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_reserve_settings_user_id_uidx" ON "emergency_reserve_settings" USING btree ("userId","id");--> statement-breakpoint
CREATE UNIQUE INDEX "imports_user_file_hash_uidx" ON "imports" USING btree ("userId","fileHash");--> statement-breakpoint
CREATE UNIQUE INDEX "manual_portfolio_position_snapshots_user_asset_recorded_uidx" ON "manual_portfolio_position_snapshots" USING btree ("userId","assetKey","recordedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "manual_portfolio_positions_user_asset_uidx" ON "manual_portfolio_positions" USING btree ("userId","assetKey");--> statement-breakpoint
CREATE UNIQUE INDEX "movement_items_user_event_fingerprint_uidx" ON "movement_items" USING btree ("userId","eventFingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_investment_strategy_user_id_uidx" ON "personal_investment_strategy" USING btree ("userId","id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_allocation_targets_user_id_uidx" ON "portfolio_allocation_targets" USING btree ("userId","id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_asset_classifications_user_asset_uidx" ON "portfolio_asset_classifications" USING btree ("userId","assetKey");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_objective_positions_user_asset_uidx" ON "portfolio_objective_positions" USING btree ("userId","assetKey");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_opportunity_analysis_settings_user_id_uidx" ON "stock_opportunity_analysis_settings" USING btree ("userId","id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_opportunity_manual_user_ticker_input_idx" ON "stock_opportunity_manual_inputs" USING btree ("userId","ticker","inputKey");--> statement-breakpoint
CREATE UNIQUE INDEX "manual_portfolio_operations_idempotency_key_unique" ON "manual_portfolio_operations" USING btree ("userId","idempotencyKey");
