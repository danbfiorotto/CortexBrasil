-- Migration 014: Add is_default flag to accounts
-- Allows each user to define one default account for WhatsApp bot transactions.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure only one default per user (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS uix_accounts_user_default
    ON accounts (user_phone)
    WHERE is_default = TRUE AND is_active = TRUE;
