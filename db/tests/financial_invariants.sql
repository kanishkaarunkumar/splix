\set ON_ERROR_STOP on
-- Run with psql as the migration owner against a freshly migrated throwaway database.
BEGIN;

INSERT INTO users(id,email,display_name,password_hash) VALUES
 ('f1000000-0000-4000-8000-000000000001','dbtest-a@example.test','DB Test A','$argon2id$v=19$m=65536,t=3,p=1$fixture$fixture'),
 ('f1000000-0000-4000-8000-000000000002','dbtest-b@example.test','DB Test B','$argon2id$v=19$m=65536,t=3,p=1$fixture$fixture'),
 ('f1000000-0000-4000-8000-000000000003','dbtest-c@example.test','DB Test C','$argon2id$v=19$m=65536,t=3,p=1$fixture$fixture'),
 ('f1000000-0000-4000-8000-000000000004','dbtest-d@example.test','DB Test D','$argon2id$v=19$m=65536,t=3,p=1$fixture$fixture');
INSERT INTO groups(id,name,owner_id) VALUES
 ('f2000000-0000-4000-8000-000000000001','DB invariant test','f1000000-0000-4000-8000-000000000001'),
 ('f2000000-0000-4000-8000-000000000002','Other DB test group','f1000000-0000-4000-8000-000000000004');
INSERT INTO group_members(group_id,user_id) VALUES
 ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002'),
 ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003');
INSERT INTO categories(name) VALUES ('DB Test') ON CONFLICT(name) DO NOTHING;

DO $$
DECLARE v_expense uuid; v_correction record; v_weighted uuid; v_before integer;
BEGIN
  -- Membership is created atomically for the group owner by migration 001's trigger.
  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id='f2000000-0000-4000-8000-000000000001' AND user_id='f1000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'group owner membership missing';
  END IF;

  v_expense := post_expense(
    'f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',current_date,'DB fixture',
    (SELECT id FROM categories WHERE name='DB Test'),150000,'exact',
    '{"shares":[{"user_id":"f1000000-0000-4000-8000-000000000001","share_paise":50000,"percentage_bps":null},{"user_id":"f1000000-0000-4000-8000-000000000002","share_paise":50000,"percentage_bps":null},{"user_id":"f1000000-0000-4000-8000-000000000003","share_paise":50000,"percentage_bps":null}]}'::jsonb
  );
  IF (SELECT sum(balance_paise) FROM member_balances WHERE group_id='f2000000-0000-4000-8000-000000000001')<>0 THEN
    RAISE EXCEPTION 'expense balances do not sum to zero';
  END IF;

  -- Cross-group payer identity is rejected at the controlled database boundary.
  BEGIN
    PERFORM post_expense(
      'f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000004',current_date,'Scope probe',
      (SELECT id FROM categories WHERE name='DB Test'),100,'exact',
      '{"shares":[{"user_id":"f1000000-0000-4000-8000-000000000002","share_paise":100,"percentage_bps":null}]}'::jsonb
    );
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='cross-group membership was accepted';
  EXCEPTION WHEN SQLSTATE '23503' THEN NULL;
  END;

  -- Direct mutation is rejected even for the migration-owner test transaction.
  BEGIN
    UPDATE ledger_entries SET delta_paise=delta_paise+1
    WHERE event_id=v_expense AND user_id='f1000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='append-only guard did not fire';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  -- Over-settlement is rejected while the current debit/credit is still live.
  BEGIN
    PERFORM post_settlement('f2000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000002',current_date,
      'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001',50001,NULL);
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='over-settlement was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;

  -- Atomic rollback: a forced error after posting must leave no event or version increment.
  SELECT count(*) INTO v_before FROM financial_events WHERE group_id='f2000000-0000-4000-8000-000000000001';
  BEGIN
    PERFORM post_expense(
      'f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000001',current_date,'Rollback probe',
      (SELECT id FROM categories WHERE name='DB Test'),100,'exact',
      '{"shares":[{"user_id":"f1000000-0000-4000-8000-000000000002","share_paise":100,"percentage_bps":null}]}'::jsonb
    );
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='rollback sentinel';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
  END;
  IF (SELECT count(*) FROM financial_events WHERE group_id='f2000000-0000-4000-8000-000000000001')<>v_before THEN
    RAISE EXCEPTION 'failed write did not roll back';
  END IF;

  -- Deterministic weighted allocation: 100 paise / weights 1,1,1 gives 34,33,33 by user UUID.
  v_weighted := post_weighted_expense(
    'f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',current_date,'Weighted fixture',
    (SELECT id FROM categories WHERE name='DB Test'),100,NULL,
    '[{"user_id":"f1000000-0000-4000-8000-000000000001","share_paise":34,"weight_value":1},{"user_id":"f1000000-0000-4000-8000-000000000002","share_paise":33,"weight_value":1},{"user_id":"f1000000-0000-4000-8000-000000000003","share_paise":33,"weight_value":1}]'::jsonb
  );

  SELECT * INTO v_correction FROM correct_expense(
    'f2000000-0000-4000-8000-000000000001',v_expense,'f1000000-0000-4000-8000-000000000001','fix fixture',current_date,
    'Replacement fixture',(SELECT id FROM categories WHERE name='DB Test'),90000,'equal',
    'f1000000-0000-4000-8000-000000000001',
    '{"shares":[{"user_id":"f1000000-0000-4000-8000-000000000001","share_paise":30000,"percentage_bps":null},{"user_id":"f1000000-0000-4000-8000-000000000002","share_paise":30000,"percentage_bps":null},{"user_id":"f1000000-0000-4000-8000-000000000003","share_paise":30000,"percentage_bps":null}]}',
    'corrected note'
  );
  IF NOT EXISTS (SELECT 1 FROM financial_events WHERE id=v_correction.replacement_event_id AND correction_of_event_id=v_expense) THEN
    RAISE EXCEPTION 'replacement event missing correction link';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ledger_entries r JOIN ledger_entries o ON o.event_id=v_expense AND o.user_id=r.user_id
                 WHERE r.event_id=v_correction.reversal_event_id AND r.delta_paise=-o.delta_paise) THEN
    RAISE EXCEPTION 'reversal rows do not negate original';
  END IF;

  -- Duplicate reversal is rejected; reverse remaining events to demonstrate zero-balance closeout.
  BEGIN
    PERFORM reverse_financial_event('f2000000-0000-4000-8000-000000000001',v_expense,
      'f1000000-0000-4000-8000-000000000001','duplicate probe');
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='duplicate reversal was accepted';
  EXCEPTION WHEN SQLSTATE '23505' THEN NULL;
  END;
  PERFORM reverse_financial_event('f2000000-0000-4000-8000-000000000001',v_correction.replacement_event_id,
    'f1000000-0000-4000-8000-000000000001','closeout fixture');
  PERFORM reverse_financial_event('f2000000-0000-4000-8000-000000000001',v_weighted,
    'f1000000-0000-4000-8000-000000000001','closeout fixture');
  IF EXISTS (SELECT 1 FROM member_balances WHERE group_id='f2000000-0000-4000-8000-000000000001' AND balance_paise<>0) THEN
    RAISE EXCEPTION 'reversals failed to restore zero balances';
  END IF;
  PERFORM archive_group('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM post_expense('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000001',current_date,'Archived probe',
      (SELECT id FROM categories WHERE name='DB Test'),100,'exact',
      '{"shares":[{"user_id":"f1000000-0000-4000-8000-000000000001","share_paise":100,"percentage_bps":null}]}'::jsonb);
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='archived group accepted a write';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  PERFORM reopen_group('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','test correction window');

END $$;

-- Run all deferred financial and weighted checks before the outer rollback.
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
