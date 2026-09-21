CREATE TABLE "build_project_progress" (
	"user_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"artifact_url" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "build_project_progress_user_id_project_id_pk" PRIMARY KEY("user_id","project_id"),
	CONSTRAINT "build_project_progress_artifact" CHECK ("build_project_progress"."artifact_url" <> '')
);
--> statement-breakpoint
ALTER TABLE "build_project_progress" ADD CONSTRAINT "build_project_progress_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_project_progress" ADD CONSTRAINT "build_project_progress_project_id_build_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."build_project"("id") ON DELETE cascade ON UPDATE no action;