CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin" varchar(40) DEFAULT 'B3' NOT NULL,
	"documentType" varchar(40) DEFAULT 'B3_POSITION_XLSX' NOT NULL,
	"fileName" text NOT NULL,
	"fileHash" varchar(64) NOT NULL,
	"referenceDate" date,
	"status" varchar(20) DEFAULT 'CONFIRMED' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imports_fileHash_unique" UNIQUE("fileHash")
);
--> statement-breakpoint
CREATE TABLE "position_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshotId" uuid NOT NULL,
	"product" text NOT NULL,
	"institution" text,
	"issuer" text,
	"assetCode" text,
	"indexer" text,
	"regimeType" text,
	"issuedAt" date,
	"maturityAt" date,
	"quantity" numeric(24, 8) NOT NULL,
	"availableQuantity" numeric(24, 8),
	"unavailableQuantity" numeric(24, 8),
	"source" varchar(40) DEFAULT 'B3' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"importId" uuid NOT NULL,
	"referenceDate" date,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "position_snapshots_importId_unique" UNIQUE("importId")
);
--> statement-breakpoint
ALTER TABLE "position_items" ADD CONSTRAINT "position_items_snapshotId_position_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."position_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_snapshots" ADD CONSTRAINT "position_snapshots_importId_imports_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;