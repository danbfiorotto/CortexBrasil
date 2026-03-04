-- Migration 006: Fix balance trigger to handle UPDATE operations
-- This replaces the previous trigger that only handled INSERT and DELETE.
-- Now it also handles UPDATE (e.g., changing amount, account_id, or type).

CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- INSERT: Apply new transaction effect
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.type = 'EXPENSE') THEN
            UPDATE accounts SET current_balance = current_balance - NEW.amount
            WHERE id = NEW.account_id;
        ELSIF (NEW.type = 'INCOME') THEN
            UPDATE accounts SET current_balance = current_balance + NEW.amount
            WHERE id = NEW.account_id;
        ELSIF (NEW.type = 'TRANSFER') THEN
            UPDATE accounts SET current_balance = current_balance - NEW.amount
            WHERE id = NEW.account_id;
            UPDATE accounts SET current_balance = current_balance + NEW.amount
            WHERE id = NEW.destination_account_id;
        END IF;

    -- DELETE: Reverse old transaction effect
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

    -- UPDATE: Reverse OLD effect, then apply NEW effect
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Only recalculate if relevant fields changed
        IF (OLD.amount IS DISTINCT FROM NEW.amount
            OR OLD.account_id IS DISTINCT FROM NEW.account_id
            OR OLD.type IS DISTINCT FROM NEW.type
            OR OLD.destination_account_id IS DISTINCT FROM NEW.destination_account_id) THEN

            -- 1. Reverse OLD transaction effect
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

            -- 2. Apply NEW transaction effect
            IF (NEW.type = 'EXPENSE') THEN
                UPDATE accounts SET current_balance = current_balance - NEW.amount
                WHERE id = NEW.account_id;
            ELSIF (NEW.type = 'INCOME') THEN
                UPDATE accounts SET current_balance = current_balance + NEW.amount
                WHERE id = NEW.account_id;
            ELSIF (NEW.type = 'TRANSFER') THEN
                UPDATE accounts SET current_balance = current_balance - NEW.amount
                WHERE id = NEW.account_id;
                UPDATE accounts SET current_balance = current_balance + NEW.amount
                WHERE id = NEW.destination_account_id;
            END IF;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger to include UPDATE
DROP TRIGGER IF EXISTS trg_update_balance ON transactions;

CREATE TRIGGER trg_update_balance
AFTER INSERT OR UPDATE OR DELETE ON transactions
FOR EACH ROW
EXECUTE FUNCTION update_account_balance();
