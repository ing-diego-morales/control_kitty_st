
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


CREATE TABLE `accounts` (
  `id` int(10) UNSIGNED NOT NULL,
  `product_id` int(10) UNSIGNED NOT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(150) DEFAULT NULL,
  `cost` decimal(12,2) NOT NULL DEFAULT 0.00,
  `is_down` tinyint(1) NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  `delete_reason` enum('down','changed','stolen','other') DEFAULT NULL,
  `delete_note` varchar(200) DEFAULT NULL,
  `deleted_customer` varchar(120) DEFAULT NULL,
  `sale_mode` enum('full','profiles') NOT NULL DEFAULT 'full',
  `profile_slots` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `down_since` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `categories` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(80) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `customers` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(120) NOT NULL,
  `phone` varchar(30) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payments` (
  `id` int(11) NOT NULL,
  `rental_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `paid_on` date NOT NULL,
  `kind` enum('new','renewal') NOT NULL DEFAULT 'new',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `profile_sale_id` int(11) DEFAULT NULL,
  `payer_name` varchar(120) DEFAULT NULL,
  `payer_phone` varchar(30) DEFAULT NULL,
  `product_name` varchar(120) DEFAULT NULL,
  `detail` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `products` (
  `id` int(10) UNSIGNED NOT NULL,
  `category_id` int(10) UNSIGNED DEFAULT NULL,
  `name` varchar(120) NOT NULL,
  `price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `duration_days` int(11) NOT NULL DEFAULT 30
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `profile_sales` (
  `id` int(11) NOT NULL,
  `account_id` int(11) NOT NULL,
  `profile_name` varchar(60) NOT NULL DEFAULT '',
  `pin` varchar(20) DEFAULT NULL,
  `buyer_name` varchar(120) NOT NULL,
  `buyer_phone` varchar(30) DEFAULT NULL,
  `price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` enum('active','cancelled') NOT NULL DEFAULT 'active',
  `notes` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `notified_for` date DEFAULT NULL,
  `notified_at` datetime DEFAULT NULL,
  `down_notified_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `rentals` (
  `id` int(10) UNSIGNED NOT NULL,
  `customer_id` int(10) UNSIGNED NOT NULL,
  `account_id` int(10) UNSIGNED NOT NULL,
  `profile_name` varchar(60) DEFAULT NULL,
  `pin` varchar(20) DEFAULT NULL,
  `price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` enum('active','cancelled') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `notes` varchar(255) DEFAULT NULL,
  `reminded_for` date DEFAULT NULL,
  `notified_for` date DEFAULT NULL,
  `notified_at` datetime DEFAULT NULL,
  `down_notified_at` datetime DEFAULT NULL,
  `batch_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `settings` (
  `k` varchar(50) NOT NULL,
  `v` varchar(200) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `users` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password_hash` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `role` enum('admin','staff') NOT NULL DEFAULT 'staff',
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `token_version` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `accounts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `product_id` (`product_id`),
  ADD KEY `idx_accounts_deleted` (`deleted_at`);

ALTER TABLE `categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);


ALTER TABLE `customers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_customers_name` (`name`);

ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_paid_on` (`paid_on`),
  ADD KEY `idx_rental` (`rental_id`),
  ADD KEY `idx_profile_sale` (`profile_sale_id`);


ALTER TABLE `products`
  ADD PRIMARY KEY (`id`),
  ADD KEY `category_id` (`category_id`);


ALTER TABLE `profile_sales`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_account` (`account_id`,`status`),
  ADD KEY `idx_end` (`end_date`);


ALTER TABLE `rentals`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_rentals_end` (`status`,`end_date`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `account_id` (`account_id`),
  ADD KEY `idx_rentals_batch` (`batch_id`);

ALTER TABLE `settings`
  ADD PRIMARY KEY (`k`);

--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

ALTER TABLE `accounts`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=48;

ALTER TABLE `categories`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

ALTER TABLE `customers`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

ALTER TABLE `payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=46;

ALTER TABLE `products`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

ALTER TABLE `profile_sales`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

ALTER TABLE `rentals`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=34;

ALTER TABLE `users`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

ALTER TABLE `accounts`
  ADD CONSTRAINT `accounts_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`);

ALTER TABLE `products`
  ADD CONSTRAINT `products_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL;

ALTER TABLE `rentals`
  ADD CONSTRAINT `rentals_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  ADD CONSTRAINT `rentals_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`);
COMMIT;
