-- Migration: 003_add_is_cleared_to_transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS is_cleared BOOLEAN DEFAULT TRUE;