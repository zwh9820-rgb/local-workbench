CREATE TABLE `agent_session` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '新会话' NOT NULL,
	`model` text DEFAULT 'deepseek' NOT NULL,
	`system_prompt` text,
	`messages` text DEFAULT '[]' NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_message_at` integer,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_session_updated` ON `agent_session` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_session_status` ON `agent_session` (`status`);--> statement-breakpoint
CREATE TABLE `agent_tool_log` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`step_index` integer DEFAULT 0 NOT NULL,
	`tool_name` text NOT NULL,
	`args` text DEFAULT '{}' NOT NULL,
	`result` text DEFAULT 'null',
	`status` text DEFAULT 'success' NOT NULL,
	`error` text,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_toollog_session` ON `agent_tool_log` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_toollog_created` ON `agent_tool_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `canvas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cover_image` text,
	`is_template` integer DEFAULT false NOT NULL,
	`source_canvas_id` text,
	`view_state` text DEFAULT '{"x":0,"y":0,"zoom":1}' NOT NULL,
	`edges` text DEFAULT '[]' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_canvas_updated` ON `canvas` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_canvas_template` ON `canvas` (`is_template`);--> statement-breakpoint
CREATE TABLE `canvas_node` (
	`id` text PRIMARY KEY NOT NULL,
	`canvas_id` text NOT NULL,
	`node_type` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`file_path` text,
	`image_path` text,
	`position_x` real DEFAULT 0 NOT NULL,
	`position_y` real DEFAULT 0 NOT NULL,
	`width` real DEFAULT 320 NOT NULL,
	`height` real DEFAULT 200 NOT NULL,
	`z_index` integer DEFAULT 0 NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`canvas_id`) REFERENCES `canvas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_node_canvas` ON `canvas_node` (`canvas_id`);--> statement-breakpoint
CREATE INDEX `idx_node_type` ON `canvas_node` (`node_type`);--> statement-breakpoint
CREATE INDEX `idx_node_canvas_z` ON `canvas_node` (`canvas_id`,`z_index`);--> statement-breakpoint
CREATE TABLE `daily_review` (
	`id` text PRIMARY KEY NOT NULL,
	`review_date` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`summary` text,
	`mood` text,
	`score` integer,
	`ai_generated` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_review_date` ON `daily_review` (`review_date`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_at` integer NOT NULL,
	`end_at` integer,
	`all_day` integer DEFAULT false NOT NULL,
	`location` text,
	`kind` text DEFAULT 'event' NOT NULL,
	`related_type` text,
	`related_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_event_start` ON `events` (`start_at`);--> statement-breakpoint
CREATE TABLE `inspiration` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`type` text DEFAULT 'idea' NOT NULL,
	`status` text DEFAULT 'ongoing' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`source` text,
	`canvas_id` text,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_insp_status` ON `inspiration` (`status`);--> statement-breakpoint
CREATE INDEX `idx_insp_type` ON `inspiration` (`type`);--> statement-breakpoint
CREATE INDEX `idx_insp_updated` ON `inspiration` (`updated_at`);--> statement-breakpoint
CREATE TABLE `todo_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`due_date` integer,
	`completed_at` integer,
	`tags` text DEFAULT '[]' NOT NULL,
	`canvas_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_todo_status` ON `todo_items` (`status`);--> statement-breakpoint
CREATE INDEX `idx_todo_due` ON `todo_items` (`due_date`);--> statement-breakpoint
CREATE INDEX `idx_todo_canvas` ON `todo_items` (`canvas_id`);