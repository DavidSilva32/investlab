CREATE TABLE "emergency_reserve_settings" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"monthlyExpenses" numeric(18, 2),
	"targetMonths" integer,
	"selectedAssetKeys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
