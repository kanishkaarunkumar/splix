-- Demo fixture matching PLAN.md: A +₹500, B -₹500, C ₹0 before settlement.
BEGIN;

INSERT INTO categories(id, name) VALUES
  (1, 'Food'), (2, 'Transport'), (3, 'Home'), (4, 'Travel'), (5, 'Other')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
SELECT setval(pg_get_serial_sequence('categories', 'id'), (SELECT max(id) FROM categories));

-- Set these password_hash values before exposing seeded accounts outside a local demo.
INSERT INTO users(id, email, display_name, password_hash) VALUES
 ('00000000-0000-4000-8000-000000000001','a@example.test','A','replace-with-argon2id-hash'),
 ('00000000-0000-4000-8000-000000000002','b@example.test','B','replace-with-argon2id-hash'),
 ('00000000-0000-4000-8000-000000000003','c@example.test','C','replace-with-argon2id-hash')
ON CONFLICT (id) DO NOTHING;

INSERT INTO groups(id, name, owner_id) VALUES
 ('10000000-0000-4000-8000-000000000001','SplitWise+ demonstration','00000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO group_members(group_id, user_id) VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003')
ON CONFLICT DO NOTHING;

-- Financial examples go through controlled posting functions, just like API writes.
-- Only initialize an empty demo group; later seed runs must not add duplicate expenses.
DO $$
DECLARE v_group uuid := '10000000-0000-4000-8000-000000000001';
        v_a uuid := '00000000-0000-4000-8000-000000000001';
        v_b uuid := '00000000-0000-4000-8000-000000000002';
        v_c uuid := '00000000-0000-4000-8000-000000000003';
        v_other smallint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM financial_events WHERE group_id=v_group) THEN
    SELECT id INTO v_other FROM categories WHERE name='Other';
    PERFORM post_expense(v_group,v_a,v_a,current_date,'Demo: A paid ₹1,500',v_other,150000,'exact',
      jsonb_build_object('shares',jsonb_build_array(
        jsonb_build_object('user_id',v_a,'share_paise',50000,'percentage_bps',NULL),
        jsonb_build_object('user_id',v_b,'share_paise',50000,'percentage_bps',NULL),
        jsonb_build_object('user_id',v_c,'share_paise',50000,'percentage_bps',NULL))));
    PERFORM post_expense(v_group,v_b,v_b,current_date,'Demo: B paid ₹500',v_other,50000,'exact',
      jsonb_build_object('shares',jsonb_build_array(
        jsonb_build_object('user_id',v_a,'share_paise',16666,'percentage_bps',NULL),
        jsonb_build_object('user_id',v_b,'share_paise',16667,'percentage_bps',NULL),
        jsonb_build_object('user_id',v_c,'share_paise',16667,'percentage_bps',NULL))));
    PERFORM post_expense(v_group,v_c,v_c,current_date,'Demo: C paid ₹1,000',v_other,100000,'exact',
      jsonb_build_object('shares',jsonb_build_array(
        jsonb_build_object('user_id',v_a,'share_paise',33334,'percentage_bps',NULL),
        jsonb_build_object('user_id',v_b,'share_paise',33333,'percentage_bps',NULL),
        jsonb_build_object('user_id',v_c,'share_paise',33333,'percentage_bps',NULL))));
    PERFORM post_settlement(v_group,v_b,current_date,v_b,v_a,50000,'Demo full settlement');
  END IF;
END $$;

COMMIT;
