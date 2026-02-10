-- Migration: Create UserProfile table
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_phone VARCHAR UNIQUE NOT NULL,
    monthly_income FLOAT DEFAULT 0.0,
    onboarding_completed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for phone number
CREATE INDEX IF NOT EXISTS idx_user_profiles_phone ON user_profiles (user_phone);

-- RLS: Only user can see/edit their own profile
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profile_all ON user_profiles FOR ALL USING (
    user_phone = current_setting ('app.current_user_phone', true)
)
WITH
    CHECK (
        user_phone = current_setting ('app.current_user_phone', true)
    );