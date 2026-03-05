-- Migration 007: Recalculate all account balances from scratch
-- Fixes any balance drift caused by trigger edge cases (NULL account_id, etc.)

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
    WHERE t.account_id = a.id
), 0) + COALESCE((
    SELECT SUM(t.amount)
    FROM transactions t
    WHERE t.destination_account_id = a.id AND t.type = 'TRANSFER'
), 0);
