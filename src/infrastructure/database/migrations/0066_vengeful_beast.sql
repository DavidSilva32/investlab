CREATE TABLE "b3_provento_items" (
	"userId" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"importId" uuid NOT NULL,
	"sourceSheet" text NOT NULL,
	"sourceRow" integer NOT NULL,
	"status" varchar(12) NOT NULL,
	"product" text NOT NULL,
	"eventType" text NOT NULL,
	"paymentDate" date NOT NULL,
	"institution" text,
	"quantity" numeric(24, 8) NOT NULL,
	"unitPrice" numeric(24, 8) NOT NULL,
	"netValue" numeric(24, 8) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "b3_provento_items" ADD CONSTRAINT "b3_provento_items_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b3_provento_items" ADD CONSTRAINT "b3_provento_items_importId_imports_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "b3_provento_import_source_row_uidx" ON "b3_provento_items" USING btree ("importId","sourceRow");--> statement-breakpoint
CREATE INDEX "b3_provento_user_status_date_idx" ON "b3_provento_items" USING btree ("userId","status","paymentDate");