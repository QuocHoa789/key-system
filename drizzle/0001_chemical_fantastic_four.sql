CREATE TABLE `keyActivations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyId` int NOT NULL,
	`fingerprint` varchar(160) NOT NULL,
	`ipAddress` varchar(64),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `keyActivations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `licenseKeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`label` varchar(160),
	`maxUses` int NOT NULL DEFAULT 1,
	`usedCount` int NOT NULL DEFAULT 0,
	`status` enum('unactivated','active','exhausted','expired','revoked') NOT NULL DEFAULT 'unactivated',
	`expiresAt` timestamp,
	`activatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `licenseKeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `licenseKeys_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE INDEX `keyActivations_key_idx` ON `keyActivations` (`keyId`);--> statement-breakpoint
CREATE INDEX `keyActivations_fingerprint_idx` ON `keyActivations` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `keyActivations_created_idx` ON `keyActivations` (`createdAt`);--> statement-breakpoint
CREATE INDEX `licenseKeys_status_idx` ON `licenseKeys` (`status`);--> statement-breakpoint
CREATE INDEX `licenseKeys_created_idx` ON `licenseKeys` (`createdAt`);