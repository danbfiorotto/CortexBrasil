-- Migration 008: Unique constraint on (user_phone, name, type) for accounts
-- Allows same name for different account types (e.g. "XP" CHECKING + "XP" CREDIT)

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_accounts_user_name_type'
    ) THEN
        ALTER TABLE accounts
            ADD CONSTRAINT uq_accounts_user_name_type
            UNIQUE (user_phone, name, type);
    END IF;
END $$;
