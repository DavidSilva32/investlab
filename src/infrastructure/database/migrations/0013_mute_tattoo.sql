CREATE TABLE "portfolio_allocation_targets" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"percentages" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
