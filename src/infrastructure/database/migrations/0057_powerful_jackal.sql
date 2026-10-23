CREATE TABLE "billing_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"externalReference" varchar(200) NOT NULL,
	"providerCheckoutId" varchar(64),
	"providerSubscriptionId" varchar(64),
	"status" varchar(24) DEFAULT 'PENDING' NOT NULL,
	"billingType" varchar(16) NOT NULL,
	"amountCents" integer NOT NULL,
	"nextDueDate" date,
	"providerEventAt" timestamp with time zone,
	"checkoutUrl" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_checkouts_status_check" CHECK ("billing_checkouts"."status" in ('PENDING', 'PAID', 'SUBSCRIPTION_CREATED', 'COMPLETED', 'CANCELED', 'EXPIRED')),
	CONSTRAINT "billing_checkouts_billing_type_check" CHECK ("billing_checkouts"."billingType" = 'CREDIT_CARD'),
	CONSTRAINT "billing_checkouts_amount_check" CHECK ("billing_checkouts"."amountCents" > 0)
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"provider" varchar(16) DEFAULT 'ASAAS' NOT NULL,
	"providerSubscriptionId" varchar(64) NOT NULL,
	"status" varchar(24) DEFAULT 'PENDING' NOT NULL,
	"billingType" varchar(16) NOT NULL,
	"amountCents" integer NOT NULL,
	"nextDueDate" date,
	"accessUntil" timestamp with time zone,
	"providerEventAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_subscriptions_status_check" CHECK ("billing_subscriptions"."status" in ('PENDING', 'ACTIVE', 'OVERDUE', 'CANCELED', 'REFUNDED', 'CHARGEBACK')),
	CONSTRAINT "billing_subscriptions_billing_type_check" CHECK ("billing_subscriptions"."billingType" in ('CREDIT_CARD', 'PIX', 'BOLETO')),
	CONSTRAINT "billing_subscriptions_amount_check" CHECK ("billing_subscriptions"."amountCents" > 0)
);
--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"providerEventId" varchar(128) NOT NULL,
	"eventType" varchar(64) NOT NULL,
	"resourceId" varchar(64),
	"payload" jsonb NOT NULL,
	"providerCreatedAt" timestamp with time zone,
	"receivedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"processedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkouts_external_reference_uidx" ON "billing_checkouts" USING btree ("externalReference");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkouts_provider_checkout_uidx" ON "billing_checkouts" USING btree ("providerCheckoutId");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkouts_user_open_uidx" ON "billing_checkouts" USING btree ("userId") WHERE "billing_checkouts"."status" in ('PENDING', 'PAID', 'SUBSCRIPTION_CREATED');--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_provider_subscription_uidx" ON "billing_subscriptions" USING btree ("provider","providerSubscriptionId");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_user_pending_uidx" ON "billing_subscriptions" USING btree ("userId") WHERE "billing_subscriptions"."status" in ('PENDING', 'ACTIVE', 'OVERDUE');--> statement-breakpoint
CREATE UNIQUE INDEX "billing_webhook_events_provider_event_uidx" ON "billing_webhook_events" USING btree ("providerEventId");