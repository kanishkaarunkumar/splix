\set ON_ERROR_STOP on
-- Run only against a disposable benchmark database after applying migrations and seeds.
BEGIN;
DO $$
DECLARE v_group uuid := gen_random_uuid();
        v_user uuid := gen_random_uuid();
        v_category smallint;
        i integer;
BEGIN
  INSERT INTO users(id,email,display_name,password_hash)
  VALUES(v_user,v_user::text||'@bench.invalid','Bench user','$argon2id$fixture');
  INSERT INTO groups(id,name,owner_id) VALUES(v_group,'10k history benchmark',v_user);
  SELECT id INTO v_category FROM categories ORDER BY id LIMIT 1;
  FOR i IN 1..10000 LOOP
    PERFORM post_expense(v_group,v_user,v_user,
      date '2025-01-01'+((i-1)%365),
      'Benchmark '||i,v_category,100,'exact',
      jsonb_build_object('shares',jsonb_build_array(jsonb_build_object(
        'user_id',v_user,'share_paise',100,'percentage_bps',NULL))));
  END LOOP;
  RAISE NOTICE 'Benchmark group UUID: %',v_group;
END $$;
COMMIT;
