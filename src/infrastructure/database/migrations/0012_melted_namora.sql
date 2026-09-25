CREATE TABLE "portfolio_asset_classifications" (
	"assetKey" varchar(64) PRIMARY KEY NOT NULL,
	"assetClass" varchar(80),
	"subClass" varchar(120),
	"geography" varchar(40),
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
