CREATE TABLE `ai_cache` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`feature` text NOT NULL,
	`value_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_cache_created` ON `ai_cache` (`created_at`);--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`family_id` text NOT NULL,
	`day` text NOT NULL,
	`feature` text NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	`input_units` integer DEFAULT 0 NOT NULL,
	`output_units` integer DEFAULT 0 NOT NULL,
	`est_cost_micros` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`family_id`, `day`, `feature`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_hash_unique` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `devices_family` ON `devices` (`family_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`family_id` text NOT NULL,
	`child_id` text,
	`device_id` text NOT NULL,
	`ts` integer NOT NULL,
	`client_ts` integer,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`content_version` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_id_unique` ON `events` (`id`);--> statement-breakpoint
CREATE INDEX `events_family_seq` ON `events` (`family_id`,`seq`);--> statement-breakpoint
CREATE INDEX `events_family_child_ts` ON `events` (`family_id`,`child_id`,`ts`);--> statement-breakpoint
CREATE INDEX `events_family_type` ON `events` (`family_id`,`type`);--> statement-breakpoint
CREATE TABLE `families` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`setup_complete` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pair_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parent_credentials` (
	`family_id` text PRIMARY KEY NOT NULL,
	`passphrase_hash` text NOT NULL,
	`pin_hash` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parent_sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `parent_sessions_expires` ON `parent_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`data_json` text,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `profiles_family` ON `profiles` (`family_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`bucket` text NOT NULL,
	`key` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`bucket`, `key`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`family_id` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`family_id`, `key`)
);
