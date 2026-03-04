CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`requisition_id` text NOT NULL,
	`institution_id` text NOT NULL,
	`iban` text,
	`owner_name` text,
	`name` text,
	`currency` text,
	`last_synced_at` integer,
	FOREIGN KEY (`requisition_id`) REFERENCES `requisitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6B7280' NOT NULL,
	`icon` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `category_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`pattern` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `requisitions` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`status` text DEFAULT 'CR' NOT NULL,
	`reference` text,
	`link` text,
	`max_historical_days` integer,
	`access_valid_for_days` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `token_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`access_token` text NOT NULL,
	`access_expires` integer NOT NULL,
	`refresh_token` text NOT NULL,
	`refresh_expires` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` text NOT NULL,
	`internal_transaction_id` text,
	`account_id` text NOT NULL,
	`booking_date` text NOT NULL,
	`value_date` text,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`creditor_name` text,
	`debtor_name` text,
	`merchant_name` text,
	`remittance_info` text,
	`bank_transaction_code` text,
	`merchant_category_code` text,
	`category_id` integer,
	`status` text DEFAULT 'booked' NOT NULL,
	`raw_data` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_transaction_id_unique` ON `transactions` (`transaction_id`);