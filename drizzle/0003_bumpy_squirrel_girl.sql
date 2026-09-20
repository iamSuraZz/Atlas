CREATE TYPE "public"."decay_class" AS ENUM('PROCEDURAL_DAILY', 'CONCEPTUAL', 'RECALL_HEAVY', 'NARRATIVE');--> statement-breakpoint
CREATE TYPE "public"."mastery_state" AS ENUM('UNASSESSED', 'INTRODUCED', 'DEVELOPING', 'PRACTICAL', 'INTERVIEW_READY', 'MASTERED');--> statement-breakpoint
CREATE TYPE "public"."skill_category" AS ENUM('ENGINEERING_CORE', 'BACKEND', 'DATA', 'SYSTEMS', 'QUALITY', 'AI_ENGINEERING', 'PROFESSIONAL');--> statement-breakpoint
CREATE TABLE "mastery_transition" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"from_state" "mastery_state" NOT NULL,
	"to_state" "mastery_state" NOT NULL,
	"reason" text NOT NULL,
	"evidence_ids" uuid[] DEFAULT '{}' NOT NULL,
	"automatic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_profile_target" (
	"profile_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"target_state" "mastery_state" NOT NULL,
	"weight" numeric(3, 2) NOT NULL,
	CONSTRAINT "role_profile_target_profile_id_skill_id_pk" PRIMARY KEY("profile_id","skill_id"),
	CONSTRAINT "role_profile_target_weight_range" CHECK ("role_profile_target"."weight" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "skill" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"category" "skill_category" NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"decay" "decay_class" NOT NULL,
	"hours_to_practical" numeric(4, 1) NOT NULL,
	"market_weight" numeric(3, 2) DEFAULT '0.50' NOT NULL,
	CONSTRAINT "skill_no_self_parent" CHECK ("skill"."id" <> "skill"."parent_id"),
	CONSTRAINT "skill_market_weight_range" CHECK ("skill"."market_weight" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "skill_prerequisite" (
	"skill_id" text NOT NULL,
	"requires_id" text NOT NULL,
	"hard" boolean DEFAULT true NOT NULL,
	CONSTRAINT "skill_prerequisite_skill_id_requires_id_pk" PRIMARY KEY("skill_id","requires_id"),
	CONSTRAINT "skill_prerequisite_no_self" CHECK ("skill_prerequisite"."skill_id" <> "skill_prerequisite"."requires_id")
);
--> statement-breakpoint
CREATE TABLE "skill_state" (
	"user_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"state" "mastery_state" DEFAULT 'UNASSESSED' NOT NULL,
	"stability_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"difficulty" numeric(3, 1) DEFAULT '5.0' NOT NULL,
	"last_practised" timestamp with time zone,
	"next_review" timestamp with time zone,
	"self_rating" smallint,
	"target_state" "mastery_state" DEFAULT 'PRACTICAL' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_state_user_id_skill_id_pk" PRIMARY KEY("user_id","skill_id"),
	CONSTRAINT "skill_state_difficulty_range" CHECK ("skill_state"."difficulty" BETWEEN 1 AND 10),
	CONSTRAINT "skill_state_self_rating_range" CHECK ("skill_state"."self_rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "user_role_blend" (
	"user_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"share" numeric(3, 2) NOT NULL,
	CONSTRAINT "user_role_blend_user_id_profile_id_pk" PRIMARY KEY("user_id","profile_id"),
	CONSTRAINT "user_role_blend_share_range" CHECK ("user_role_blend"."share" BETWEEN 0 AND 1)
);
--> statement-breakpoint
ALTER TABLE "mastery_transition" ADD CONSTRAINT "mastery_transition_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_transition" ADD CONSTRAINT "mastery_transition_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_profile_target" ADD CONSTRAINT "role_profile_target_profile_id_role_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."role_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_profile_target" ADD CONSTRAINT "role_profile_target_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_parent_id_skill_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."skill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_prerequisite" ADD CONSTRAINT "skill_prerequisite_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_prerequisite" ADD CONSTRAINT "skill_prerequisite_requires_id_skill_id_fk" FOREIGN KEY ("requires_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_state" ADD CONSTRAINT "skill_state_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_state" ADD CONSTRAINT "skill_state_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_blend" ADD CONSTRAINT "user_role_blend_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_blend" ADD CONSTRAINT "user_role_blend_profile_id_role_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."role_profile"("id") ON DELETE no action ON UPDATE no action;