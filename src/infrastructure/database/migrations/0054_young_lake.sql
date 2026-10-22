CREATE TABLE "learning_course_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"courseId" varchar(32) NOT NULL,
	"courseVersion" integer NOT NULL,
	"completedLessonIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lastLessonId" varchar(64),
	"latestScore" real,
	"bestScore" real,
	"quizAttemptCount" integer DEFAULT 0 NOT NULL,
	"lastAttemptId" varchar(64),
	"passedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_course_progress_version_check" CHECK ("learning_course_progress"."courseVersion" > 0),
	CONSTRAINT "learning_course_progress_course_check" CHECK ("learning_course_progress"."courseId" in ('fixed_income', 'brazilian_equities', 'international_etfs', 'fiis')),
	CONSTRAINT "learning_course_progress_latest_score_check" CHECK ("learning_course_progress"."latestScore" is null or ("learning_course_progress"."latestScore" >= 0 and "learning_course_progress"."latestScore" <= 10)),
	CONSTRAINT "learning_course_progress_best_score_check" CHECK ("learning_course_progress"."bestScore" is null or ("learning_course_progress"."bestScore" >= 0 and "learning_course_progress"."bestScore" <= 10)),
	CONSTRAINT "learning_course_progress_attempt_count_check" CHECK ("learning_course_progress"."quizAttemptCount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "auth_users" ADD COLUMN "phone" varchar(11);--> statement-breakpoint
ALTER TABLE "learning_course_progress" ADD CONSTRAINT "learning_course_progress_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learning_course_progress_user_course_version_uidx" ON "learning_course_progress" USING btree ("userId","courseId","courseVersion");