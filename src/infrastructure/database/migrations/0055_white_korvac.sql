CREATE TABLE "learning_course_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"courseId" varchar(32) NOT NULL,
	"courseVersion" integer NOT NULL,
	"attemptId" uuid NOT NULL,
	"score" real NOT NULL,
	"passed" boolean NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_course_attempts_version_check" CHECK ("learning_course_attempts"."courseVersion" > 0),
	CONSTRAINT "learning_course_attempts_course_check" CHECK ("learning_course_attempts"."courseId" in ('fixed_income', 'brazilian_equities', 'international_etfs', 'fiis')),
	CONSTRAINT "learning_course_attempts_score_check" CHECK ("learning_course_attempts"."score" >= 0 and "learning_course_attempts"."score" <= 10)
);
--> statement-breakpoint
ALTER TABLE "learning_course_attempts" ADD CONSTRAINT "learning_course_attempts_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learning_course_attempts_owner_course_attempt_uidx" ON "learning_course_attempts" USING btree ("userId","courseId","courseVersion","attemptId");