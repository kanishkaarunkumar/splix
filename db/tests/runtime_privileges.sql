\set ON_ERROR_STOP on
DO $$
BEGIN
  IF NOT has_table_privilege('splix_runtime','ledger_entries','SELECT') THEN RAISE EXCEPTION 'runtime cannot read ledger'; END IF;
  IF has_table_privilege('splix_runtime','ledger_entries','INSERT')
     OR has_table_privilege('splix_runtime','ledger_entries','UPDATE')
     OR has_table_privilege('splix_runtime','ledger_entries','DELETE') THEN
    RAISE EXCEPTION 'runtime has direct ledger mutation rights';
  END IF;
  IF NOT has_function_privilege('splix_runtime','post_expense(uuid,uuid,uuid,date,text,smallint,bigint,text,jsonb)','EXECUTE')
     OR NOT has_function_privilege('splix_runtime','correct_expense(uuid,uuid,uuid,text,date,text,smallint,bigint,text,uuid,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'runtime lacks controlled posting functions';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p,
      LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
    WHERE p.oid='post_expense(uuid,uuid,uuid,date,text,smallint,bigint,text,jsonb)'::regprocedure
      AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC can execute financial posting';
  END IF;
END $$;
