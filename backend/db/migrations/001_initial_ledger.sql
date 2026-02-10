-- Migration: Phase 1 - Financial Foundation

-- 1. Create ACCOUNTS table
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_phone VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL, -- "Nubank", "Itaú", "Carteira"
    type VARCHAR(50) NOT NULL, -- "CHECKING", "CREDIT", "INVESTMENT", "CASH"
    initial_balance DECIMAL(15, 2) DEFAULT 0.00,
    current_balance DECIMAL(15, 2) DEFAULT 0.00, -- Cache for quick access
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for RLS on accounts
CREATE INDEX idx_accounts_user_phone ON accounts(user_phone);

-- Enable RLS on accounts
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_isolation_policy ON accounts
    USING (user_phone = current_setting('app.current_user_phone', true))
    WITH CHECK (user_phone = current_setting('app.current_user_phone', true));

-- 2. Modify TRANSACTIONS table
-- Add type (EXPENSE, INCOME, TRANSFER)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'EXPENSE';
-- Add FK to accounts
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);
-- Add transfer destination (only for TRANSFER type)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS destination_account_id UUID REFERENCES accounts(id);

-- 3. Create Default "Carteira" Account for existing users (Optional - requires script)
-- logic to be handled by application on startup or dedicated script

-- 4. Create Trigger to Update Account Balance automatically
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- IF INSERTING
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.type = 'EXPENSE') THEN
            UPDATE accounts SET current_balance = current_balance - NEW.amount 
            WHERE id = NEW.account_id;
        ELSIF (NEW.type = 'INCOME') THEN
            UPDATE accounts SET current_balance = current_balance + NEW.amount 
            WHERE id = NEW.account_id;
        ELSIF (NEW.type = 'TRANSFER') THEN
             -- Deduct from source
            UPDATE accounts SET current_balance = current_balance - NEW.amount 
            WHERE id = NEW.account_id;
            -- Add to destination
            UPDATE accounts SET current_balance = current_balance + NEW.amount 
            WHERE id = NEW.destination_account_id;
        END IF;
    -- IF DELETING
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.type = 'EXPENSE') THEN
            UPDATE accounts SET current_balance = current_balance + OLD.amount 
            WHERE id = OLD.account_id;
        ELSIF (OLD.type = 'INCOME') THEN
            UPDATE accounts SET current_balance = current_balance - OLD.amount 
            WHERE id = OLD.account_id;
        ELSIF (OLD.type = 'TRANSFER') THEN
            UPDATE accounts SET current_balance = current_balance + OLD.amount 
            WHERE id = OLD.account_id;
            UPDATE accounts SET current_balance = current_balance - OLD.amount 
            WHERE id = OLD.destination_account_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_balance ON transactions;

CREATE TRIGGER trg_update_balance
AFTER INSERT OR DELETE ON transactions
FOR EACH ROW
EXECUTE FUNCTION update_account_balance();
