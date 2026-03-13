-- Migration 015: Add income_mode to user_profiles
-- income_mode: 'auto' (calculates average of last 3 months) or 'manual' (uses monthly_income value)

ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS income_mode VARCHAR(10) DEFAULT 'manual';
