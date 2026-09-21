CREATE TYPE "public"."resource_kind" AS ENUM('WATCH', 'PLAY', 'COURSE', 'READ_FREE', 'READ_BOOK', 'PRACTISE', 'TOOL');--> statement-breakpoint
CREATE TYPE "public"."skill_track" AS ENUM('ENGINEERING', 'DATA_ML');--> statement-breakpoint
CREATE TABLE "active_phase" (
	"user_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "active_phase_user_id_phase_pk" PRIMARY KEY("user_id","phase"),
	CONSTRAINT "active_phase_shape" CHECK ("active_phase"."phase" ~ '^[ED][0-9]{1,2}$')
);
--> statement-breakpoint
CREATE TABLE "build_project" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence" integer NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"phase" text NOT NULL,
	"data_source" text NOT NULL,
	"proves" text NOT NULL,
	"est_hours_min" integer NOT NULL,
	"est_hours_max" integer NOT NULL,
	"brief" text NOT NULL,
	CONSTRAINT "build_project_sequence_unique" UNIQUE("sequence"),
	CONSTRAINT "build_project_phase_shape" CHECK ("build_project"."phase" ~ '^[ED][0-9]{1,2}$'),
	CONSTRAINT "build_project_hours_order" CHECK ("build_project"."est_hours_min" <= "build_project"."est_hours_max"),
	CONSTRAINT "build_project_hours_positive" CHECK ("build_project"."est_hours_min" > 0)
);
--> statement-breakpoint
CREATE TABLE "build_project_skill" (
	"project_id" text NOT NULL,
	"skill_id" text NOT NULL,
	CONSTRAINT "build_project_skill_project_id_skill_id_pk" PRIMARY KEY("project_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "resource" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "resource_kind" NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"free" boolean,
	"phases" text[] NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "resource_skill" (
	"resource_id" text NOT NULL,
	"skill_id" text NOT NULL,
	CONSTRAINT "resource_skill_resource_id_skill_id_pk" PRIMARY KEY("resource_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "track" "skill_track" DEFAULT 'ENGINEERING' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "phase" text;--> statement-breakpoint
ALTER TABLE "active_phase" ADD CONSTRAINT "active_phase_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_project_skill" ADD CONSTRAINT "build_project_skill_project_id_build_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."build_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_project_skill" ADD CONSTRAINT "build_project_skill_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_skill" ADD CONSTRAINT "resource_skill_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_skill" ADD CONSTRAINT "resource_skill_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_phase_idx" ON "skill" USING btree ("track","phase");--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_phase_shape" CHECK ("skill"."phase" ~ '^[ED][0-9]{1,2}$');--> statement-breakpoint
-- Hand-added: the third role profile. DATA_ML_TRACK.md §2 — ML Engineer, with
-- data engineering as the bridge. Reference data, not user data, so it belongs
-- with the schema rather than in a seeder that could be skipped.
INSERT INTO "role_profile" ("id", "name", "description") VALUES
  ('C_ML_ENGINEER', 'ML Engineer',
   'Machine learning in production, with data engineering as the bridge from backend work. Ships models, not notebooks.')
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name", "description" = EXCLUDED."description";
