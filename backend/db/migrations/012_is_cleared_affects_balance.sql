-- Migration 012: Only cleared transactions affect account balance
-- Transactions with is_cleared = FALSE (Não pago) do not deduct/add from account balance.

CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- INSERT: Apply new transaction effect only if cleared
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.is_cleared = TRUE) THEN
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

    -- DELETE: Reverse old transaction effect only if it was cleared
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.is_cleared = TRUE) THEN
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

    -- UPDATE: Reverse OLD cleared effect, apply NEW cleared effect
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.amount IS DISTINCT FROM NEW.amount
            OR OLD.account_id IS DISTINCT FROM NEW.account_id
            OR OLD.type IS DISTINCT FROM NEW.type
            OR OLD.destination_account_id IS DISTINCT FROM NEW.destination_account_id
            OR OLD.is_cleared IS DISTINCT FROM NEW.is_cleared) THEN

            -- 1. Reverse OLD transaction effect (if it was cleared)
            IF (OLD.is_cleared = TRUE) THEN
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

            -- 2. Apply NEW transaction effect (only if now cleared)
            IF (NEW.is_cleared = TRUE) THEN
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
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (no changes needed to trigger definition, only the function above)
DROP TRIGGER IF EXISTS trg_update_balance ON transactions;

CREATE TRIGGER trg_update_balance
AFTER INSERT OR UPDATE OR DELETE ON transactions
FOR EACH ROW
EXECUTE FUNCTION update_account_balance();

-- Recalculate all balances from scratch with the new is_cleared logic
UPDATE accounts a
SET current_balance = a.initial_balance + COALESCE((
    SELECT SUM(
        CASE
            WHEN t.type = 'INCOME' THEN t.amount
            WHEN t.type = 'EXPENSE' THEN -t.amount
            WHEN t.type = 'TRANSFER' THEN -t.amount
            ELSE 0
        END
    )
    FROM transactions t
    WHERE t.account_id = a.id AND t.is_cleared = TRUE
), 0) + COALESCE((
    SELECT SUM(t.amount)
    FROM transactions t
    WHERE t.destination_account_id = a.id AND t.type = 'TRANSFER' AND t.is_cleared = TRUE
), 0);
