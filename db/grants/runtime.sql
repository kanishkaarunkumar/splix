-- Run as the migration owner after every migration. The runtime role has no direct
-- financial-table writes; SECURITY DEFINER functions are the only posting boundary.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO splix_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM splix_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM splix_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

GRANT SELECT ON users, groups, group_members, categories, financial_events, expenses,
  expense_shares, settlements, ledger_entries, idempotency_requests, sessions,
  group_join_codes, group_join_requests, group_split_presets,
  group_split_preset_members, group_lifecycle_events, member_balances, recovery_tokens
TO splix_runtime;
-- Idempotency results are stored in the same service transaction as posting.
GRANT INSERT, UPDATE ON idempotency_requests TO splix_runtime;

GRANT EXECUTE ON FUNCTION post_expense(uuid,uuid,uuid,date,text,smallint,bigint,text,jsonb) TO splix_runtime;
GRANT EXECUTE ON FUNCTION post_expense_with_note(uuid,uuid,uuid,date,text,smallint,bigint,text,jsonb,text) TO splix_runtime;
GRANT EXECUTE ON FUNCTION post_weighted_expense(uuid,uuid,uuid,date,text,smallint,bigint,text,jsonb) TO splix_runtime;
GRANT EXECUTE ON FUNCTION post_settlement(uuid,uuid,date,uuid,uuid,bigint,text) TO splix_runtime;
GRANT EXECUTE ON FUNCTION reverse_financial_event(uuid,uuid,uuid,text) TO splix_runtime;
GRANT EXECUTE ON FUNCTION correct_expense(uuid,uuid,uuid,text,date,text,smallint,bigint,text,uuid,jsonb,text) TO splix_runtime;
GRANT EXECUTE ON FUNCTION create_group_session(uuid,bytea,timestamptz,text) TO splix_runtime;
GRANT EXECUTE ON FUNCTION register_user(text,text,text) TO splix_runtime;
GRANT EXECUTE ON FUNCTION create_splix_group(uuid,text,text) TO splix_runtime;
GRANT EXECUTE ON FUNCTION revoke_group_session(bytea) TO splix_runtime;
GRANT EXECUTE ON FUNCTION create_group_join_code(uuid,uuid,bytea,timestamptz) TO splix_runtime;
GRANT EXECUTE ON FUNCTION request_group_join(uuid,bytea) TO splix_runtime;
GRANT EXECUTE ON FUNCTION decide_group_join(uuid,uuid,uuid,boolean) TO splix_runtime;
GRANT EXECUTE ON FUNCTION revoke_group_join_code(uuid,uuid,uuid) TO splix_runtime;
GRANT EXECUTE ON FUNCTION save_group_split_preset(uuid,uuid,uuid,text,text,jsonb) TO splix_runtime;
GRANT EXECUTE ON FUNCTION delete_group_split_preset(uuid,uuid,uuid) TO splix_runtime;
GRANT EXECUTE ON FUNCTION archive_group(uuid,uuid) TO splix_runtime;
GRANT EXECUTE ON FUNCTION reopen_group(uuid,uuid,text) TO splix_runtime;
GRANT EXECUTE ON FUNCTION lock_splix_user(uuid) TO splix_runtime;
GRANT EXECUTE ON FUNCTION lock_splix_group(uuid,uuid,boolean) TO splix_runtime;
GRANT EXECUTE ON FUNCTION update_splix_profile(uuid,text) TO splix_runtime;
GRANT EXECUTE ON FUNCTION delete_splix_account(uuid,text) TO splix_runtime;
GRANT EXECUTE ON FUNCTION provision_splix_recovery(uuid,bytea) TO splix_runtime;
GRANT EXECUTE ON FUNCTION recover_splix_account(bytea,text) TO splix_runtime;
GRANT EXECUTE ON FUNCTION add_splix_member(uuid,uuid,text) TO splix_runtime;
GRANT EXECUTE ON FUNCTION splix_category(text) TO splix_runtime;

-- Future routines created by the migration owner must still be explicitly granted.
