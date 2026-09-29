CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"quiz_id" uuid,
	"host_id" uuid NOT NULL,
	"room_code" text NOT NULL,
	"status" text DEFAULT 'lobby' NOT NULL,
	"current_question" integer DEFAULT -1 NOT NULL,
	"quiz_snapshot" jsonb NOT NULL,
	"engine_state" jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"room_code_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_sessions_status_check" CHECK ("game_sessions"."status" in ('lobby', 'running', 'finished', 'ended'))
);
--> statement-breakpoint
CREATE TABLE "leaderboard_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"question_index" integer NOT NULL,
	"entries" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_snapshots_session_question" UNIQUE("session_id","question_index")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_file_name_unique" UNIQUE("file_name")
);
--> statement-breakpoint
CREATE TABLE "player_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"player_id" text NOT NULL,
	"question_id" text NOT NULL,
	"answer_id" text,
	"answer_payload" jsonb NOT NULL,
	"is_correct" boolean,
	"response_time_ms" integer,
	"points_awarded" integer,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_answers_one_per_question" UNIQUE("session_id","player_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text NOT NULL,
	"session_id" text NOT NULL,
	"nickname" text NOT NULL,
	"avatar_seed" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"answered_count" integer DEFAULT 0 NOT NULL,
	"total_response_ms" bigint DEFAULT 0 NOT NULL,
	"is_kicked" boolean DEFAULT false NOT NULL,
	"connected" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_pkey" PRIMARY KEY("session_id","id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"description" text,
	"explanation" text,
	"media_url" text,
	"time_limit" integer NOT NULL,
	"points" integer DEFAULT 1000 NOT NULL,
	"topic" text,
	"learning_outcome" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "questions_type_check" CHECK ("questions"."type" in ('single', 'multiple', 'true_false', 'short_answer', 'poll', 'ordering', 'numeric', 'image_hotspot', 'word_cloud', 'matching')),
	CONSTRAINT "questions_time_limit_check" CHECK ("questions"."time_limit" in (5, 10, 15, 20, 30, 45, 60, 90, 120)),
	CONSTRAINT "questions_points_check" CHECK ("questions"."points" between 0 and 10000),
	CONSTRAINT "questions_metadata_object" CHECK (jsonb_typeof("questions"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"course_code" text,
	"course_name" text,
	"class_name" text,
	"lecturer_name" text,
	"learning_outcome" text,
	"topic" text,
	"difficulty" text DEFAULT 'sedang' NOT NULL,
	"language" text DEFAULT 'id' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"mode" text DEFAULT 'classic' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quizzes_difficulty_check" CHECK ("quizzes"."difficulty" in ('mudah', 'sedang', 'sulit')),
	CONSTRAINT "quizzes_language_check" CHECK ("quizzes"."language" in ('id', 'en')),
	CONSTRAINT "quizzes_visibility_check" CHECK ("quizzes"."visibility" in ('private', 'unlisted', 'public')),
	CONSTRAINT "quizzes_mode_check" CHECK ("quizzes"."mode" in ('classic', 'team', 'mastery', 'practice'))
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "session_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"salutation" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'lecturer' NOT NULL,
	"locale" text DEFAULT 'id' NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'lecturer')),
	CONSTRAINT "users_locale_check" CHECK ("users"."locale" in ('id', 'en'))
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_answers" ADD CONSTRAINT "player_answers_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_answers" ADD CONSTRAINT "player_answers_player_fk" FOREIGN KEY ("session_id","player_id") REFERENCES "public"."players"("session_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answers_question_position_idx" ON "answers" USING btree ("question_id","position");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "game_sessions_host_created_idx" ON "game_sessions" USING btree ("host_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "game_sessions_quiz_idx" ON "game_sessions" USING btree ("quiz_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_sessions_active_room_code" ON "game_sessions" USING btree ("room_code") WHERE "game_sessions"."status" in ('lobby', 'running');--> statement-breakpoint
CREATE INDEX "player_answers_session_question_idx" ON "player_answers" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE INDEX "questions_quiz_position_idx" ON "questions" USING btree ("quiz_id","position");--> statement-breakpoint
CREATE INDEX "quizzes_owner_updated_idx" ON "quizzes" USING btree ("owner_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "session_events_session_created_idx" ON "session_events" USING btree ("session_id","created_at");