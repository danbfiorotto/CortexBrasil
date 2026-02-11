-- Add credit card specific fields to the accounts table
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS credit_limit FLOAT DEFAULT 0.0;

ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS due_day INTEGER;

ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS closing_day INTEGER;

-- Ensure existing CREDIT type accounts have a default limit if they don't
UPDATE accounts
SET
    credit_limit = 0.0
WHERE
    type = 'CREDIT'
    AND credit_limit IS NULL;