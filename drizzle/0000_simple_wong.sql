CREATE TABLE `setups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`setup` text NOT NULL,
	`source` text NOT NULL,
	`thesis` text NOT NULL,
	`planned_risk` real NOT NULL,
	`created_at` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`return_pct` real,
	`followed_plan` integer,
	`outcome_note` text
);
--> statement-breakpoint
CREATE INDEX `idx_setups_status_created_at` ON `setups` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_setups_source` ON `setups` (`source`);