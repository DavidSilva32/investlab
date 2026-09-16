CREATE TABLE "movement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"importId" uuid NOT NULL,
	"direction" varchar(10) NOT NULL,
	"occurredAt" date NOT NULL,
	"movementType" text NOT NULL,
	"product" text NOT NULL,
	"assetCode" text,
	"institution" text,
	"quantity" numeric(24, 8) NOT NULL,
	"unitPrice" numeric(24, 8),
	"operationValue" numeric(24, 8),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movement_items" ADD CONSTRAINT "movement_items_importId_imports_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;