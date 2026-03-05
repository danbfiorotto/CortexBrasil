-- Migration 009: Investment Performance History + Benchmark Tracking

-- Portfolio snapshots (one per user per day)
CREATE TABLE IF NOT EXISTS investment_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_phone VARCHAR(50) NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_value DECIMAL(15, 2) DEFAULT 0.00,
    total_cost DECIMAL(15, 2) DEFAULT 0.00,
    stocks_value DECIMAL(15, 2) DEFAULT 0.00,
    fii_value DECIMAL(15, 2) DEFAULT 0.00,
    crypto_value DECIMAL(15, 2) DEFAULT 0.00,
    fixed_income_value DECIMAL(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_phone, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_investment_snapshots_user_date ON investment_snapshots (user_phone, snapshot_date);

ALTER TABLE investment_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'investment_snapshots' AND policyname = 'investment_snapshots_isolation'
    ) THEN
        CREATE POLICY investment_snapshots_isolation ON investment_snapshots
        USING (user_phone = current_setting('app.current_user_phone', true))
        WITH CHECK (user_phone = current_setting('app.current_user_phone', true));
    END IF;
END $$;

-- Benchmark history (public data, no RLS)
CREATE TABLE IF NOT EXISTS benchmark_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    benchmark VARCHAR(20) NOT NULL,  -- IBOV, CDI, SP500
    snapshot_date DATE NOT NULL,
    close_value DECIMAL(15, 4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (benchmark, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_history_name_date ON benchmark_history (benchmark, snapshot_date);
