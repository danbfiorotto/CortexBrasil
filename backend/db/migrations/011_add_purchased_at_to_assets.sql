-- Migration 011: Add purchased_at column to assets table
ALTER TABLE assets
ADD COLUMN IF NOT EXISTS purchased_at DATE DEFAULT CURRENT_DATE;
