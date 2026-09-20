CREATE TYPE "public"."mission_format" AS ENUM('EXPLAIN', 'BUILD', 'DEBUG', 'READ_CODE', 'QUERY', 'DESIGN', 'DEFEND', 'TEACH', 'REVIEW', 'INTERVIEW', 'APPLY_TO_PROJECT');--> statement-breakpoint
CREATE TABLE "daily_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_date" date NOT NULL,
	"intensity" text NOT NULL,
	"budget_minutes" integer NOT NULL,
	"weights" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_plan_user_date_unique" UNIQUE("user_id","plan_date"),
	CONSTRAINT "daily_plan_intensity" CHECK ("daily_plan"."intensity" IN ('LIGHT','NORMAL','DEEP')),
	CONSTRAINT "daily_plan_budget_positive" CHECK ("daily_plan"."budget_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "mission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_plan_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"format" "mission_format" NOT NULL,
	"title" text NOT NULL,
	"brief" text NOT NULL,
	"why" text[] NOT NULL,
	"est_minutes" integer NOT NULL,
	"priority_score" numeric(6, 3) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"actual_minutes" integer,
	"confidence" smallint,
	"reflection" text,
	"completed_at" timestamp with time zone,
	CONSTRAINT "mission_status" CHECK ("mission"."status" IN ('PENDING','IN_PROGRESS','DONE','SKIPPED','EXPIRED')),
	CONSTRAINT "mission_confidence_range" CHECK ("mission"."confidence" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "daily_plan" ADD CONSTRAINT "daily_plan_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission" ADD CONSTRAINT "mission_daily_plan_id_daily_plan_id_fk" FOREIGN KEY ("daily_plan_id") REFERENCES "public"."daily_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission" ADD CONSTRAINT "mission_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_primary_per_plan" ON "mission" USING btree ("daily_plan_id") WHERE "mission"."is_primary";--> statement-breakpoint
CREATE INDEX "mission_skill_recent_idx" ON "mission" USING btree ("skill_id","completed_at" desc) WHERE "mission"."status" = 'DONE';