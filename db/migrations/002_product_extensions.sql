-- Product schema and controlled financial extensions. Preserve 001 after it has been applied.
BEGIN;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER TABLE groups ADD COLUMN archived_at timestamptz;
ALTER TABLE groups ADD COLUMN archived_by uuid;
ALTER TABLE groups ADD CONSTRAINT groups_archived_by_member_fk
  FOREIGN KEY (id, archived_by) REFERENCES group_members(group_id, user_id) ON DELETE RESTRICT;
ALTER TABLE groups ADD CONSTRAINT groups_archive_state_check
  CHECK ((archived_at IS NULL AND archived_by IS NULL) OR (archived_at IS NOT NULL AND archived_by IS NOT NULL));
ALTER TABLE expenses ADD COLUMN note text CHECK (note IS NULL OR length(note) <= 1000);
ALTER TABLE expense_shares ADD COLUMN weight_value bigint CHECK (weight_value IS NULL OR weight_value > 0);
ALTER TABLE expenses DROP CONSTRAINT expenses_split_method_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_split_method_check
  CHECK (split_method IN ('equal', 'percentage', 'exact', 'weighted'));

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  device_label text CHECK (device_label IS NULL OR length(device_label) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX sessions_active_user_idx ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE group_join_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL,
  code_hash bytea NOT NULL UNIQUE CHECK (octet_length(code_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (group_id, created_by) REFERENCES group_members(group_id, user_id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  UNIQUE (id, group_id)
);
CREATE INDEX group_join_codes_active_idx ON group_join_codes(group_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE group_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  join_code_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by uuid,
  decided_at timestamptz,
  FOREIGN KEY (join_code_id, group_id) REFERENCES group_join_codes(id, group_id) ON DELETE RESTRICT,
  FOREIGN KEY (group_id, decided_by) REFERENCES group_members(group_id, user_id) ON DELETE RESTRICT,
  CHECK ((status = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
      OR (status <> 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  UNIQUE (id, group_id)
);
CREATE UNIQUE INDEX group_join_requests_one_pending_idx
  ON group_join_requests(group_id, user_id) WHERE status = 'pending';
CREATE INDEX group_join_requests_owner_queue_idx
  ON group_join_requests(group_id, requested_at) WHERE status = 'pending';

CREATE TABLE group_split_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  split_method text NOT NULL CHECK (split_method IN ('equal', 'percentage', 'exact', 'weighted')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (group_id, created_by) REFERENCES group_members(group_id, user_id) ON DELETE RESTRICT,
  UNIQUE (group_id, name),
  UNIQUE (id, group_id)
);
CREATE TABLE group_split_preset_members (
  preset_id uuid NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  percentage_bps integer CHECK (percentage_bps BETWEEN 0 AND 10000),
  weight_value bigint CHECK (weight_value IS NULL OR weight_value > 0),
  exact_share_paise bigint CHECK (exact_share_paise IS NULL OR exact_share_paise >= 0),
  CHECK (num_nonnulls(percentage_bps,weight_value,exact_share_paise) <= 1),
  PRIMARY KEY (preset_id, user_id),
  FOREIGN KEY (preset_id, group_id) REFERENCES group_split_presets(id, group_id) ON DELETE RESTRICT,
  FOREIGN KEY (group_id, user_id) REFERENCES group_members(group_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX group_split_presets_group_idx ON group_split_presets(group_id, name);

CREATE FUNCTION validate_group_split_preset(p_preset_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_method text; v_count integer; v_valid integer;
BEGIN
  SELECT split_method INTO v_method FROM group_split_presets WHERE id=p_preset_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*),count(*) FILTER (
    WHERE (v_method='equal' AND percentage_bps IS NULL AND weight_value IS NULL AND exact_share_paise IS NULL)
       OR (v_method='percentage' AND percentage_bps IS NOT NULL AND weight_value IS NULL AND exact_share_paise IS NULL)
       OR (v_method='weighted' AND weight_value IS NOT NULL AND weight_value>0 AND percentage_bps IS NULL AND exact_share_paise IS NULL)
       OR (v_method='exact' AND exact_share_paise IS NOT NULL AND percentage_bps IS NULL AND weight_value IS NULL)
  ) INTO v_count,v_valid FROM group_split_preset_members WHERE preset_id=p_preset_id;
  IF v_count=0 OR v_count<>v_valid THEN RAISE EXCEPTION 'preset members do not match split method' USING ERRCODE='23514'; END IF;
  IF v_method='percentage' AND (SELECT sum(percentage_bps) FROM group_split_preset_members WHERE preset_id=p_preset_id)<>10000 THEN
    RAISE EXCEPTION 'percentage preset must total 10000 bps' USING ERRCODE='23514';
  END IF;
END;
$$;
CREATE FUNCTION check_split_preset_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM validate_group_split_preset(NEW.id); RETURN NULL; END; $$;
CREATE FUNCTION check_split_preset_member_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM validate_group_split_preset(NEW.preset_id); RETURN NULL; END; $$;
CREATE FUNCTION check_split_preset_member_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM validate_group_split_preset(OLD.preset_id); RETURN NULL; END; $$;
CREATE CONSTRAINT TRIGGER split_preset_valid_ct AFTER INSERT OR UPDATE ON group_split_presets
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_split_preset_row();
CREATE CONSTRAINT TRIGGER split_preset_member_write_valid_ct AFTER INSERT OR UPDATE ON group_split_preset_members
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_split_preset_member_write();
CREATE CONSTRAINT TRIGGER split_preset_member_delete_valid_ct AFTER DELETE ON group_split_preset_members
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_split_preset_member_delete();

CREATE FUNCTION save_group_split_preset(
  p_group_id uuid,p_actor_id uuid,p_preset_id uuid,p_name text,p_method text,p_members jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid := COALESCE(p_preset_id,gen_random_uuid());
BEGIN
  PERFORM 1 FROM groups WHERE id=p_group_id AND owner_id=p_actor_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active group owner required' USING ERRCODE='42501'; END IF;
  IF p_method NOT IN ('equal','percentage','exact','weighted') OR jsonb_typeof(p_members) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid preset method or member list' USING ERRCODE='22023'; END IF;
  IF p_preset_id IS NULL THEN
    INSERT INTO group_split_presets(id,group_id,name,split_method,created_by) VALUES(v_id,p_group_id,p_name,p_method,p_actor_id);
  ELSE
    UPDATE group_split_presets SET name=p_name,split_method=p_method,updated_at=now()
      WHERE id=p_preset_id AND group_id=p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'preset not found' USING ERRCODE='P0002'; END IF;
    DELETE FROM group_split_preset_members WHERE preset_id=v_id;
  END IF;
  INSERT INTO group_split_preset_members(preset_id,group_id,user_id,percentage_bps,weight_value,exact_share_paise)
  SELECT v_id,p_group_id,m.user_id,m.percentage_bps,m.weight_value,m.exact_share_paise
  FROM jsonb_to_recordset(p_members) AS m(user_id uuid,percentage_bps integer,weight_value bigint,exact_share_paise bigint);
  RETURN v_id;
END;
$$;
CREATE FUNCTION delete_group_split_preset(p_group_id uuid,p_actor_id uuid,p_preset_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_count integer;
BEGIN
  PERFORM 1 FROM groups WHERE id=p_group_id AND owner_id=p_actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'group owner required' USING ERRCODE='42501'; END IF;
  DELETE FROM group_split_preset_members WHERE preset_id=p_preset_id AND group_id=p_group_id;
  DELETE FROM group_split_presets WHERE id=p_preset_id AND group_id=p_group_id;
  GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count=1;
END;
$$;

CREATE TABLE group_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('archived', 'reopened')),
  reason text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (group_id, actor_id) REFERENCES group_members(group_id, user_id) ON DELETE RESTRICT
);

CREATE FUNCTION enforce_group_member_cap() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_count integer;
BEGIN
  PERFORM 1 FROM groups WHERE id=NEW.group_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM group_members WHERE group_id=NEW.group_id AND user_id=NEW.user_id) THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM group_members WHERE group_id=NEW.group_id;
  IF v_count>=50 THEN RAISE EXCEPTION 'group member limit reached' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER group_member_cap_before_insert BEFORE INSERT ON group_members
FOR EACH ROW EXECUTE FUNCTION enforce_group_member_cap();

-- Block any financial event insert after archive; financial functions take the group lock first.
CREATE FUNCTION reject_archived_financial_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM groups WHERE id=NEW.group_id AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'group is archived; owner must reopen it before financial writes' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_events_archived_guard BEFORE INSERT ON financial_events
FOR EACH ROW EXECUTE FUNCTION reject_archived_financial_event();

-- The deferred weight check verifies largest-remainder allocation using integer arithmetic.
CREATE FUNCTION validate_weighted_event_id(v_event_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_method text;
        v_count integer;
        v_weight_count integer;
        v_bad integer;
BEGIN
  SELECT split_method INTO v_method FROM expenses WHERE event_id=v_event_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*), count(weight_value) INTO v_count, v_weight_count
    FROM expense_shares WHERE expense_event_id=v_event_id;
  IF v_method='weighted' THEN
    IF v_count=0 OR v_count<>v_weight_count THEN
      RAISE EXCEPTION 'weighted expense requires a positive weight for every share' USING ERRCODE = '23514';
    END IF;
    WITH raw AS (
      SELECT s.user_id, s.share_paise, s.weight_value,
             x.amount_paise::numeric * s.weight_value / sum(s.weight_value) OVER () AS exact_part
      FROM expense_shares s JOIN expenses x ON x.event_id=s.expense_event_id
      WHERE s.expense_event_id=v_event_id
    ), portions AS (
      SELECT user_id, share_paise, floor(exact_part) AS base_part,
             exact_part-floor(exact_part) AS remainder,
             sum(floor(exact_part)) OVER () AS base_total,
             row_number() OVER (ORDER BY exact_part-floor(exact_part) DESC, user_id) AS rank
      FROM raw
    ), expected AS (
      SELECT share_paise,
             base_part + CASE WHEN rank <= (SELECT amount_paise FROM expenses WHERE event_id=v_event_id)-base_total
                              THEN 1 ELSE 0 END AS expected_share
      FROM portions
    )
    SELECT count(*) INTO v_bad FROM expected WHERE share_paise<>expected_share;
    IF v_bad<>0 THEN RAISE EXCEPTION 'weighted shares do not match deterministic largest-remainder allocation' USING ERRCODE = '23514'; END IF;
  ELSIF v_weight_count<>0 THEN
    RAISE EXCEPTION 'weights are only valid for weighted expenses' USING ERRCODE = '23514';
  END IF;
END;
$$;
CREATE FUNCTION validate_weighted_expense_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM validate_weighted_event_id(NEW.event_id); RETURN NULL; END; $$;
CREATE FUNCTION validate_weighted_share_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM validate_weighted_event_id(NEW.expense_event_id); RETURN NULL; END; $$;
CREATE CONSTRAINT TRIGGER expenses_weighted_check_ct
AFTER INSERT ON expenses DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_weighted_expense_trigger();
CREATE CONSTRAINT TRIGGER shares_weighted_check_ct
AFTER INSERT ON expense_shares DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_weighted_share_trigger();

-- Preserve immutable financial events while allowing the one-time correction link set by
-- correct_expense() below. Runtime roles cannot update financial_events directly.
CREATE OR REPLACE FUNCTION reject_financial_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF TG_TABLE_NAME='financial_events'
       AND current_setting('splix.allow_correction_link', true)='on' THEN
      IF OLD.kind='expense' AND OLD.correction_of_event_id IS NULL
         AND NEW.correction_of_event_id IS NOT NULL
         AND (to_jsonb(NEW)-'correction_of_event_id')=(to_jsonb(OLD)-'correction_of_event_id') THEN
        RETURN NEW;
      END IF;
    END IF;
    IF TG_TABLE_NAME='expenses'
       AND current_setting('splix.allow_expense_note', true)='on' THEN
      IF OLD.note IS NULL AND NEW.note IS NOT NULL
         AND (to_jsonb(NEW)-'note')=(to_jsonb(OLD)-'note') THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'financial history is append-only' USING ERRCODE = '55000';
END;
$$;

-- Additive weighted posting entry point; existing post_expense remains unchanged for old clients.
CREATE FUNCTION post_weighted_expense(
  p_group_id uuid, p_actor_id uuid, p_payer_id uuid, p_effective_date date, p_title text,
  p_category_id smallint, p_amount_paise bigint, p_note text, p_shares jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_event_id uuid := gen_random_uuid(); v_total numeric; v_count integer;
        v_weight_total numeric;
BEGIN
  PERFORM 1 FROM groups WHERE id=p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'group not found' USING ERRCODE='23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id=p_group_id AND user_id=p_actor_id)
     OR NOT EXISTS (SELECT 1 FROM group_members WHERE group_id=p_group_id AND user_id=p_payer_id) THEN
    RAISE EXCEPTION 'actor and payer must be group members' USING ERRCODE='42501';
  END IF;
  IF p_amount_paise NOT BETWEEN 1 AND 1000000000 OR jsonb_typeof(p_shares) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_shares)=0 THEN RAISE EXCEPTION 'invalid amount or weighted shares' USING ERRCODE='22023'; END IF;
  SELECT count(*),sum(share_paise),sum(weight_value) INTO v_count,v_total,v_weight_total
  FROM jsonb_to_recordset(p_shares) AS s(user_id uuid,share_paise bigint,weight_value bigint);
  IF v_count<>jsonb_array_length(p_shares) OR v_total<>p_amount_paise OR v_weight_total<=0 THEN
    RAISE EXCEPTION 'weighted shares must be unique, positive-weighted, and sum to amount' USING ERRCODE='23514';
  END IF;
  INSERT INTO financial_events(id,group_id,kind,actor_id,effective_date,correction_of_event_id)
  VALUES(v_event_id,p_group_id,'expense',p_actor_id,p_effective_date,NULL);
  INSERT INTO expenses(event_id,group_id,payer_id,title,category_id,amount_paise,split_method,note)
  VALUES(v_event_id,p_group_id,p_payer_id,p_title,p_category_id,p_amount_paise,'weighted',p_note);
  INSERT INTO expense_shares(expense_event_id,group_id,user_id,share_paise,weight_value)
  SELECT v_event_id,p_group_id,s.user_id,s.share_paise,s.weight_value
  FROM jsonb_to_recordset(p_shares) AS s(user_id uuid,share_paise bigint,weight_value bigint);
  INSERT INTO ledger_entries(event_id,group_id,user_id,delta_paise)
  SELECT v_event_id,p_group_id,user_id,sum(delta)::bigint FROM (
    SELECT p_payer_id AS user_id,p_amount_paise::numeric AS delta
    UNION ALL SELECT user_id,-share_paise::numeric FROM expense_shares WHERE expense_event_id=v_event_id
  ) p GROUP BY user_id;
  UPDATE groups SET version=version+1 WHERE id=p_group_id;
  RETURN v_event_id;
END;
$$;

CREATE FUNCTION post_expense_with_note(
  p_group_id uuid,p_actor_id uuid,p_payer_id uuid,p_effective_date date,p_title text,
  p_category_id smallint,p_amount_paise bigint,p_split_method text,p_shares jsonb,p_note text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_event_id uuid;
BEGIN
  v_event_id := post_expense(p_group_id,p_actor_id,p_payer_id,p_effective_date,p_title,
    p_category_id,p_amount_paise,p_split_method,p_shares);
  IF p_note IS NOT NULL THEN
    PERFORM set_config('splix.allow_expense_note','on',true);
    UPDATE expenses SET note=p_note WHERE event_id=v_event_id;
    PERFORM set_config('splix.allow_expense_note','off',true);
  END IF;
  RETURN v_event_id;
END;
$$;

-- Atomic correction overload supports equal/percentage/exact via post_expense, or weighted via
-- post_weighted_expense. Caller passes a frozen JSON shape; both events commit or neither does.
CREATE FUNCTION correct_expense(
  p_group_id uuid, p_original_event_id uuid, p_actor_id uuid, p_reason text,
  p_effective_date date, p_title text, p_category_id smallint, p_amount_paise bigint,
  p_split_method text, p_payer_id uuid, p_shares jsonb, p_note text DEFAULT NULL
) RETURNS TABLE(reversal_event_id uuid,replacement_event_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_original financial_events%ROWTYPE;
BEGIN
  PERFORM 1 FROM groups WHERE id=p_group_id FOR UPDATE;
  SELECT * INTO v_original FROM financial_events WHERE id=p_original_event_id AND group_id=p_group_id;
  IF NOT FOUND OR v_original.kind<>'expense' OR NOT EXISTS(
    SELECT 1 FROM expenses WHERE event_id=p_original_event_id AND group_id=p_group_id
  ) THEN RAISE EXCEPTION 'expense not found' USING ERRCODE='P0002'; END IF;
  IF p_actor_id<>v_original.actor_id AND NOT EXISTS(SELECT 1 FROM groups WHERE id=p_group_id AND owner_id=p_actor_id) THEN
    RAISE EXCEPTION 'only expense creator or group owner may correct it' USING ERRCODE='42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))=0 THEN RAISE EXCEPTION 'correction reason required' USING ERRCODE='22023'; END IF;
  reversal_event_id := reverse_financial_event(p_group_id,p_original_event_id,p_actor_id,p_reason);
  IF p_split_method='weighted' THEN
    replacement_event_id := post_weighted_expense(p_group_id,p_actor_id,p_payer_id,p_effective_date,p_title,
      p_category_id,p_amount_paise,p_note,p_shares);
    PERFORM set_config('splix.allow_correction_link','on',true);
    UPDATE financial_events SET correction_of_event_id=p_original_event_id WHERE id=replacement_event_id;
    PERFORM set_config('splix.allow_correction_link','off',true);
  ELSE
    replacement_event_id := post_expense(p_group_id,p_actor_id,p_payer_id,p_effective_date,p_title,
      p_category_id,p_amount_paise,p_split_method,p_shares);
    PERFORM set_config('splix.allow_correction_link','on',true);
    UPDATE financial_events SET correction_of_event_id=p_original_event_id WHERE id=replacement_event_id;
    PERFORM set_config('splix.allow_correction_link','off',true);
    IF p_note IS NOT NULL THEN
      PERFORM set_config('splix.allow_expense_note','on',true);
      UPDATE expenses SET note=p_note WHERE event_id=replacement_event_id;
      PERFORM set_config('splix.allow_expense_note','off',true);
    END IF;
  END IF;
  RETURN NEXT;
END;
$$;

CREATE FUNCTION create_group_session(p_user_id uuid,p_token_hash bytea,p_expires_at timestamptz,p_device_label text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  IF octet_length(p_token_hash)<>32 OR p_expires_at<=now() OR p_expires_at>now()+interval '90 days' THEN
    RAISE EXCEPTION 'invalid token hash or expiry' USING ERRCODE='22023';
  END IF;
  INSERT INTO sessions(id,user_id,token_hash,expires_at,device_label)
  VALUES(v_id,p_user_id,p_token_hash,p_expires_at,p_device_label);
  RETURN v_id;
END;
$$;
CREATE FUNCTION register_user(p_email text,p_display_name text,p_password_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  IF length(btrim(p_email)) NOT BETWEEN 3 AND 320 OR length(btrim(p_display_name)) NOT BETWEEN 1 AND 100
     OR p_password_hash NOT LIKE '$argon2id$%' THEN
    RAISE EXCEPTION 'invalid user profile or password hash format' USING ERRCODE='22023';
  END IF;
  INSERT INTO users(id,email,display_name,password_hash) VALUES(v_id,btrim(p_email),btrim(p_display_name),p_password_hash);
  RETURN v_id;
END;
$$;
CREATE FUNCTION create_splix_group(p_owner_id uuid,p_name text,p_timezone text DEFAULT 'Asia/Kolkata') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_group_id uuid := gen_random_uuid();
BEGIN
  IF length(btrim(p_name)) NOT BETWEEN 1 AND 100 OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN
    RAISE EXCEPTION 'invalid group name or timezone' USING ERRCODE='22023';
  END IF;
  INSERT INTO groups(id,name,owner_id,timezone) VALUES(v_group_id,btrim(p_name),p_owner_id,p_timezone);
  RETURN v_group_id;
END;
$$;
CREATE FUNCTION revoke_group_session(p_token_hash bytea) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE sessions SET revoked_at=now() WHERE token_hash=p_token_hash AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count=1;
END;
$$;

CREATE FUNCTION create_group_join_code(p_group_id uuid,p_actor_id uuid,p_code_hash bytea,p_expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  PERFORM 1 FROM groups WHERE id=p_group_id AND owner_id=p_actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'only group owner may invite' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM groups WHERE id=p_group_id AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'archived group cannot create join codes' USING ERRCODE='55000'; END IF;
  IF octet_length(p_code_hash)<>32 OR p_expires_at<=now() OR p_expires_at>now()+interval '30 days' THEN
    RAISE EXCEPTION 'invalid code hash or expiry' USING ERRCODE='22023'; END IF;
  INSERT INTO group_join_codes(id,group_id,created_by,code_hash,expires_at)
  VALUES(v_id,p_group_id,p_actor_id,p_code_hash,p_expires_at); RETURN v_id;
END;
$$;
CREATE FUNCTION request_group_join(p_user_id uuid,p_code_hash bytea) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_code group_join_codes%ROWTYPE; v_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v_code FROM group_join_codes WHERE code_hash=p_code_hash AND revoked_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'join code is invalid or expired' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM groups WHERE id=v_code.group_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'group is archived' USING ERRCODE='55000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM group_join_codes WHERE id=v_code.id AND revoked_at IS NULL AND expires_at>now()) THEN
    RAISE EXCEPTION 'join code is invalid or expired' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM group_members WHERE group_id=v_code.group_id AND user_id=p_user_id) THEN
    RAISE EXCEPTION 'already a group member' USING ERRCODE='23505'; END IF;
  INSERT INTO group_join_requests(id,group_id,join_code_id,user_id)
  VALUES(v_id,v_code.group_id,v_code.id,p_user_id); RETURN v_id;
END;
$$;
CREATE FUNCTION decide_group_join(p_group_id uuid,p_request_id uuid,p_actor_id uuid,p_approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_request group_join_requests%ROWTYPE;
BEGIN
  PERFORM 1 FROM groups WHERE id=p_group_id AND owner_id=p_actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'only group owner may decide requests' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM groups WHERE id=p_group_id AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'archived group cannot add members' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_request FROM group_join_requests WHERE id=p_request_id AND group_id=p_group_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pending request not found' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS(SELECT 1 FROM group_join_codes c WHERE c.id=v_request.join_code_id AND c.revoked_at IS NULL AND c.expires_at>now()) THEN
    RAISE EXCEPTION 'join code expired or revoked' USING ERRCODE='55000'; END IF;
  UPDATE group_join_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    decided_by=p_actor_id,decided_at=now() WHERE id=p_request_id;
  IF p_approve THEN
    INSERT INTO group_members(group_id,user_id) VALUES(p_group_id,v_request.user_id);
    UPDATE groups SET version=version+1 WHERE id=p_group_id;
  END IF;
END;
$$;
CREATE FUNCTION revoke_group_join_code(p_group_id uuid,p_code_id uuid,p_actor_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_count integer;
BEGIN
  PERFORM 1 FROM groups WHERE id=p_group_id AND owner_id=p_actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'only group owner may revoke invites' USING ERRCODE='42501'; END IF;
  UPDATE group_join_codes SET revoked_at=now() WHERE id=p_code_id AND group_id=p_group_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count=1;
END;
$$;

CREATE FUNCTION archive_group(p_group_id uuid,p_actor_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM 1 FROM groups WHERE id=p_group_id AND owner_id=p_actor_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active group owned by actor not found' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM member_balances WHERE group_id=p_group_id AND balance_paise<>0) THEN
    RAISE EXCEPTION 'group cannot be archived with nonzero balances' USING ERRCODE='23514'; END IF;
  UPDATE groups SET archived_at=now(),archived_by=p_actor_id,version=version+1 WHERE id=p_group_id;
  INSERT INTO group_lifecycle_events(group_id,actor_id,action) VALUES(p_group_id,p_actor_id,'archived');
END;
$$;
CREATE FUNCTION reopen_group(p_group_id uuid,p_actor_id uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM 1 FROM groups WHERE id=p_group_id AND owner_id=p_actor_id AND archived_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'archived group owned by actor not found' USING ERRCODE='42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))=0 THEN RAISE EXCEPTION 'reopen reason required' USING ERRCODE='22023'; END IF;
  UPDATE groups SET archived_at=NULL,archived_by=NULL,version=version+1 WHERE id=p_group_id;
  INSERT INTO group_lifecycle_events(group_id,actor_id,action,reason) VALUES(p_group_id,p_actor_id,'reopened',p_reason);
END;
$$;

REVOKE ALL ON FUNCTION validate_weighted_event_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_weighted_expense_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_weighted_share_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_group_split_preset(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION check_split_preset_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION check_split_preset_member_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION check_split_preset_member_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION enforce_group_member_cap() FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_archived_financial_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION post_weighted_expense(uuid,uuid,uuid,date,text,smallint,bigint,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION post_expense_with_note(uuid,uuid,uuid,date,text,smallint,bigint,text,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION correct_expense(uuid,uuid,uuid,text,date,text,smallint,bigint,text,uuid,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION register_user(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_splix_group(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_group_session(uuid,bytea,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_group_session(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_group_join_code(uuid,uuid,bytea,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION request_group_join(uuid,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION decide_group_join(uuid,uuid,uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_group_join_code(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION save_group_split_preset(uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_group_split_preset(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION archive_group(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION reopen_group(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

COMMIT;
