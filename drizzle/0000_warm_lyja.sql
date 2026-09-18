CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"weekly_hours" numeric(4, 1) DEFAULT '11.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email"),
	CONSTRAINT "app_user_email_lowercase" CHECK ("app_user"."email" = lower("app_user"."email")),
	CONSTRAINT "app_user_weekly_hours_range" CHECK ("app_user"."weekly_hours" > 0 AND "app_user"."weekly_hours" <= 60)
);
