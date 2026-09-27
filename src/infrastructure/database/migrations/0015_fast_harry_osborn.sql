CREATE TABLE "investor_context_settings" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"objective" varchar(160),
	"targetMonth" varchar(7),
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
