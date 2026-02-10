-- Migration: Phase 2 - Category Learning (Dynamic RAG)
-- Table for storing user corrections to category classifications
CREATE TABLE IF NOT EXISTS category_learning (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    user_phone VARCHAR(50) NOT NULL,
    original_description TEXT NOT NULL,
    corrected_category VARCHAR(100) NOT NULL,
    embedding vector (384), -- Sentence transformer embedding dimension
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_category_learning_user ON category_learning (user_phone);

-- Enable RLS
ALTER TABLE category_learning ENABLE ROW LEVEL SECURITY;

CREATE POLICY category_learning_isolation ON category_learning USING (
    user_phone = current_setting ('app.current_user_phone', true)
)
WITH
    CHECK (
        user_phone = current_setting ('app.current_user_phone', true)
    );

-- Phase 3: Enhanced Budgets and Goals
ALTER TABLE budgets
ADD COLUMN IF NOT EXISTS period_type VARCHAR(20) DEFAULT 'MONTHLY';

ALTER TABLE budgets
ADD COLUMN IF NOT EXISTS linked_goal_id UUID;

-- Phase 3: Net Worth History
CREATE TABLE IF NOT EXISTS net_worth_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    user_phone VARCHAR(50) NOT NULL,
    total_balance DECIMAL(15, 2) DEFAULT 0.00,
    total_investments DECIMAL(15, 2) DEFAULT 0.00,
    total_debts DECIMAL(15, 2) DEFAULT 0.00,
    net_worth DECIMAL(15, 2) DEFAULT 0.00,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_net_worth_user_date ON net_worth_history (user_phone, snapshot_date);

ALTER TABLE net_worth_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY net_worth_isolation ON net_worth_history USING (
    user_phone = current_setting ('app.current_user_phone', true)
)
WITH
    CHECK (
        user_phone = current_setting ('app.current_user_phone', true)
    );

-- Phase 4: Investment Assets
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    user_phone VARCHAR(50) NOT NULL,
    ticker VARCHAR(20) NOT NULL,
    name VARCHAR(100),
    type VARCHAR(20) NOT NULL, -- STOCK, FII, CRYPTO, FIXED_INCOME
    quantity DECIMAL(15, 8) DEFAULT 0,
    avg_price DECIMAL(15, 4) DEFAULT 0,
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_assets_user ON assets (user_phone);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY assets_isolation ON assets USING (
    user_phone = current_setting ('app.current_user_phone', true)
)
WITH
    CHECK (
        user_phone = current_setting ('app.current_user_phone', true)
    );

-- Phase 4: Market Data Cache (public, no RLS needed)
CREATE TABLE IF NOT EXISTS market_data (
    ticker VARCHAR(20) PRIMARY KEY,
    price DECIMAL(15, 4),
    change_pct DECIMAL(8, 4),
    dividend_yield DECIMAL(8, 4),
    last_updated TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);