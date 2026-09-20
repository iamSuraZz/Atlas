CREATE TYPE "public"."confidentiality" AS ENUM('PUBLIC', 'EMPLOYER_CONFIDENTIAL', 'PRIVATE');--> statement-breakpoint
CREATE TYPE "public"."evidence_kind" AS ENUM('CODE_ARTIFACT', 'DESIGN_DOC', 'QUERY_OPTIMISATION', 'INCIDENT', 'DECISION', 'LEADERSHIP_EVENT', 'COMMUNICATION_REP', 'INTERVIEW_RESULT', 'PUBLISHED_WRITING', 'ASSESSMENT');--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "evidence_kind" NOT NULL,
	"title" text NOT NULL,
	"occurred_on" date NOT NULL,
	"classification" "confidentiality" DEFAULT 'EMPLOYER_CONFIDENTIAL' NOT NULL,
	"raw_body" text NOT NULL,
	"shareable_body" text,
	"ai_allowed" boolean DEFAULT false NOT NULL,
	"publish_allowed" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp with time zone,
	"metric_value" numeric,
	"metric_unit" text,
	"metric_source" text,
	"artifact_url" text,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_requires_source" CHECK ("evidence"."metric_value" IS NULL OR ("evidence"."metric_source" IS NOT NULL AND "evidence"."metric_unit" IS NOT NULL)),
	CONSTRAINT "verified_requires_artifact" CHECK ("evidence"."verified" = false OR "evidence"."artifact_url" IS NOT NULL),
	CONSTRAINT "ai_needs_shareable" CHECK ("evidence"."ai_allowed" = false OR "evidence"."shareable_body" IS NOT NULL),
	CONSTRAINT "publish_needs_ai_ok" CHECK ("evidence"."publish_allowed" = false OR "evidence"."ai_allowed" = true),
	CONSTRAINT "approval_is_explicit" CHECK (("evidence"."ai_allowed" = false AND "evidence"."publish_allowed" = false) OR "evidence"."approved_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "evidence_skill" (
	"evidence_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"objective" boolean DEFAULT false NOT NULL,
	CONSTRAINT "evidence_skill_evidence_id_skill_id_pk" PRIMARY KEY("evidence_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_skill" ADD CONSTRAINT "evidence_skill_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_skill" ADD CONSTRAINT "evidence_skill_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_skill_objective_idx" ON "evidence_skill" USING btree ("skill_id") WHERE "evidence_skill"."objective";