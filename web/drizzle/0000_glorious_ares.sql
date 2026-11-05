CREATE TYPE "public"."case_priority" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('new', 'planned', 'in_progress', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."clip_status" AS ENUM('transcribing', 'categorizing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"priority" "case_priority" NOT NULL,
	"priority_manual" boolean DEFAULT false NOT NULL,
	"status" "case_status" DEFAULT 'new' NOT NULL,
	"last_feedback_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"device_clip" integer NOT NULL,
	"facility_id" uuid,
	"case_id" uuid,
	"sample_rate" integer NOT NULL,
	"samples" integer NOT NULL,
	"missing_chunks" integer DEFAULT 0 NOT NULL,
	"audio" "bytea" NOT NULL,
	"status" "clip_status" DEFAULT 'transcribing' NOT NULL,
	"transcript" text,
	"summary" text,
	"sentiment" "sentiment",
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"facility_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facilities_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "facilities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "facility_admins" (
	"user_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	CONSTRAINT "facility_admins_user_id_facility_id_pk" PRIMARY KEY("user_id","facility_id")
);
--> statement-breakpoint
ALTER TABLE "facility_admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_admins" ADD CONSTRAINT "facility_admins_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cases_facility_idx" ON "cases" USING btree ("facility_id","status");--> statement-breakpoint
CREATE INDEX "clips_facility_idx" ON "clips" USING btree ("facility_id","created_at");--> statement-breakpoint
CREATE INDEX "clips_case_idx" ON "clips" USING btree ("case_id");