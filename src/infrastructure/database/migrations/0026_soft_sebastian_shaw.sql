CREATE TABLE "personal_investment_strategy" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"answers" jsonb NOT NULL,
	"selectedDirection" varchar(40) NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
