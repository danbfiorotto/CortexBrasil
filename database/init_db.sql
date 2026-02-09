-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE EXTENSION IF NOT EXISTS "vector";

-- Users Table (Tenants)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50) UNIQUE NOT NULL, -- WhatsApp Number
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Transactions Table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    user_phone VARCHAR(50) NOT NULL, -- Match Python model
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT, -- Encrypted content should be handled by app or pgcrypto function
    category VARCHAR(100),
    date TIMESTAMP
    WITH
        TIME ZONE, -- Match Python model "date" field
        raw_message TEXT,
        -- Installments Logic
        installments_count INTEGER,
        installment_number INTEGER,
        group_id UUID,
        created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        -- RLS Column
        tenant_id UUID DEFAULT uuid_generate_v4 () -- In a real app, this should link effectively to user_id or a family_id
);

-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS Policy
-- This policy assumes the application sets 'app.current_user_phone' in the session
CREATE POLICY transaction_isolation_policy ON transactions USING (
    user_phone = current_setting ('app.current_user_phone', true)
)
WITH
    CHECK (
        user_phone = current_setting ('app.current_user_phone', true)
    );

-- Create Index for RLS Performance
CREATE INDEX idx_transactions_user_phone ON transactions (user_phone);

CREATE INDEX idx_transactions_category ON transactions (category);