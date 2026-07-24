-- Required by tasks.wbs_path (ltree, §3.3/§3.7) and users.email (citext, §3.1).
-- Hand-added: drizzle-kit has no notion of extensions, it only emits the bare
-- type names used by the customType() columns.
CREATE EXTENSION IF NOT EXISTS "ltree";
CREATE EXTENSION IF NOT EXISTS "citext";
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "project_members_user_id_project_id_pk" PRIMARY KEY("user_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "calendar_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"exception_date" date NOT NULL,
	"is_working" boolean NOT NULL,
	"start_time" time,
	"finish_time" time,
	"name" text,
	"recurrence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid,
	"working_days" smallint[] NOT NULL,
	"hours_per_day" numeric NOT NULL,
	"default_start" time NOT NULL,
	"default_finish" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"start_date" timestamp with time zone,
	"finish_date" timestamp with time zone,
	"calendar_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"wbs_path" "ltree",
	"wbs_code" text,
	"sort_order" integer,
	"name" text NOT NULL,
	"notes" text,
	"is_milestone" boolean DEFAULT false NOT NULL,
	"is_summary" boolean DEFAULT false NOT NULL,
	"scheduling_mode" text DEFAULT 'cpm' NOT NULL,
	"duration_minutes" integer,
	"task_type" text,
	"is_effort_driven" boolean DEFAULT true NOT NULL,
	"is_manually_scheduled" boolean DEFAULT false NOT NULL,
	"constraint_type" text,
	"constraint_date" timestamp with time zone,
	"deadline" timestamp with time zone,
	"calendar_id" uuid,
	"early_start" timestamp with time zone,
	"early_finish" timestamp with time zone,
	"late_start" timestamp with time zone,
	"late_finish" timestamp with time zone,
	"total_float_minutes" integer,
	"free_float_minutes" integer,
	"is_critical" boolean DEFAULT false NOT NULL,
	"percent_complete" numeric(5, 2),
	"actual_start" timestamp with time zone,
	"actual_finish" timestamp with time zone,
	"actual_duration_minutes" integer,
	"remaining_duration_minutes" integer,
	"story_points" numeric,
	"sprint_id" uuid,
	"board_column_id" uuid,
	"backlog_rank" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"predecessor_id" uuid NOT NULL,
	"successor_id" uuid NOT NULL,
	"link_type" text NOT NULL,
	"lag_minutes" integer DEFAULT 0 NOT NULL,
	"lag_percent" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependencies_predecessor_id_successor_id_key" UNIQUE("predecessor_id","successor_id"),
	CONSTRAINT "task_dependencies_no_self_link" CHECK ("task_dependencies"."predecessor_id" <> "task_dependencies"."successor_id")
);
--> statement-breakpoint
-- PARTITION BY RANGE (period_date), monthly (§3.5). drizzle-kit has no
-- partitioning primitive, so the PARTITION BY clause and partitions below are
-- hand-added. A new partition must exist before any row for that month can be
-- inserted — create the next one or two months ahead of time, either by hand
-- in a future migration or via a scheduled job (e.g. pg_partman).
CREATE TABLE "assignment_timephased" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"period_date" date NOT NULL,
	"planned_work_minutes" integer,
	"actual_work_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_timephased_id_period_date_pk" PRIMARY KEY("id","period_date")
) PARTITION BY RANGE ("period_date");
--> statement-breakpoint
CREATE TABLE "assignment_timephased_2026_07" PARTITION OF "assignment_timephased"
	FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
--> statement-breakpoint
CREATE TABLE "assignment_timephased_2026_08" PARTITION OF "assignment_timephased"
	FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"units" numeric,
	"work_minutes" integer,
	"actual_work_minutes" integer,
	"cost" numeric,
	"actual_cost" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_task_id_resource_id_key" UNIQUE("task_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"resource_type" text NOT NULL,
	"email" text,
	"max_units" numeric,
	"standard_rate" numeric,
	"overtime_rate" numeric,
	"cost_per_use" numeric,
	"accrual_type" text,
	"calendar_id" uuid,
	"skills" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baseline_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baseline_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"start" timestamp with time zone,
	"finish" timestamp with time zone,
	"duration_minutes" integer,
	"work_minutes" integer,
	"cost" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"baseline_number" smallint NOT NULL,
	"name" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"captured_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "baselines_project_id_baseline_number_key" UNIQUE("project_id","baseline_number")
);
--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "calendar_exceptions_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessor_id_tasks_id_fk" FOREIGN KEY ("predecessor_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_successor_id_tasks_id_fk" FOREIGN KEY ("successor_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_timephased" ADD CONSTRAINT "assignment_timephased_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_tasks" ADD CONSTRAINT "baseline_tasks_baseline_id_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."baselines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_tasks" ADD CONSTRAINT "baseline_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_captured_by_users_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_exceptions_calendar_id_exception_date_idx" ON "calendar_exceptions" USING btree ("calendar_id","exception_date");--> statement-breakpoint
CREATE INDEX "tasks_project_id_parent_id_idx" ON "tasks" USING btree ("project_id","parent_id");--> statement-breakpoint
CREATE INDEX "tasks_wbs_path_gist_idx" ON "tasks" USING gist ("wbs_path");--> statement-breakpoint
CREATE INDEX "tasks_project_id_critical_idx" ON "tasks" USING btree ("project_id") WHERE "tasks"."is_critical" = true;--> statement-breakpoint
CREATE INDEX "task_dependencies_successor_id_idx" ON "task_dependencies" USING btree ("successor_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_predecessor_id_idx" ON "task_dependencies" USING btree ("predecessor_id");--> statement-breakpoint
CREATE INDEX "assignment_timephased_assignment_id_period_date_idx" ON "assignment_timephased" USING btree ("assignment_id","period_date");--> statement-breakpoint
CREATE INDEX "audit_log_project_id_created_at_idx" ON "audit_log" USING btree ("project_id","created_at" DESC NULLS LAST);