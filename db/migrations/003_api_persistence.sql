-- Durable identity lifecycle and the missing API write boundaries.
BEGIN;
ALTER TABLE users ADD COLUMN deleted_at timestamptz;
ALTER TABLE categories DROP CONSTRAINT categories_name_check;
ALTER TABLE categories ADD CONSTRAINT categories_name_check
  CHECK (length(btrim(name)) BETWEEN 1 AND 80);

CREATE TABLE recovery_tokens (
  token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash)=32),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at>created_at)
);
CREATE INDEX recovery_tokens_user_idx ON recovery_tokens(user_id);

CREATE FUNCTION lock_splix_user(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM 1 FROM users WHERE id=p_user AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account unavailable' USING ERRCODE='P0002'; END IF;
END;
$$;

CREATE FUNCTION lock_splix_group(p_group uuid,p_actor uuid,p_owner boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_owner uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'account unavailable' USING ERRCODE='42501'; END IF;
  SELECT owner_id INTO v_owner FROM groups WHERE id=p_group FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'group not found' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS(SELECT 1 FROM group_members WHERE group_id=p_group AND user_id=p_actor)
     OR (p_owner AND v_owner<>p_actor) THEN
    RAISE EXCEPTION 'group permission required' USING ERRCODE='42501'; END IF;
END;
$$;

CREATE FUNCTION update_splix_profile(p_user uuid,p_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'invalid display name' USING ERRCODE='22023'; END IF;
  UPDATE users SET display_name=btrim(p_name) WHERE id=p_user AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'account unavailable' USING ERRCODE='P0002'; END IF;
END;
$$;

CREATE FUNCTION delete_splix_account(p_user uuid,p_replacement_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_replacement_hash NOT LIKE '$argon2id$%' THEN
    RAISE EXCEPTION 'invalid password hash' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM users WHERE id=p_user AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account unavailable' USING ERRCODE='P0002'; END IF;
  UPDATE users SET display_name='Deleted user',email='deleted-'||id||'@invalid',
    password_hash=p_replacement_hash,deleted_at=now() WHERE id=p_user;
  UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=p_user;
  UPDATE recovery_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=p_user;
  UPDATE group_join_codes SET revoked_at=COALESCE(revoked_at,now()) WHERE created_by=p_user;
END;
$$;

CREATE FUNCTION provision_splix_recovery(p_user uuid,p_hash bytea) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM 1 FROM users WHERE id=p_user AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account unavailable' USING ERRCODE='P0002'; END IF;
  UPDATE recovery_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=p_user;
  INSERT INTO recovery_tokens(token_hash,user_id,expires_at) VALUES(p_hash,p_user,now()+interval '15 minutes');
END;
$$;

CREATE FUNCTION recover_splix_account(p_hash bytea,p_password_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_user uuid;
BEGIN
  IF p_password_hash NOT LIKE '$argon2id$%' THEN
    RAISE EXCEPTION 'invalid password hash' USING ERRCODE='22023'; END IF;
  -- Lock the user first in every identity mutation to avoid reset/delete races.
  SELECT user_id INTO v_user FROM recovery_tokens WHERE token_hash=p_hash;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM users WHERE id=v_user AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM recovery_tokens WHERE token_hash=p_hash AND used_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE users SET password_hash=p_password_hash WHERE id=v_user;
  UPDATE recovery_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=v_user;
  UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=v_user;
  RETURN true;
END;
$$;

CREATE FUNCTION add_splix_member(p_group uuid,p_actor uuid,p_email text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_user uuid;
BEGIN
  PERFORM lock_splix_group(p_group,p_actor,true);
  IF EXISTS(SELECT 1 FROM groups WHERE id=p_group AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'group archived' USING ERRCODE='55000'; END IF;
  SELECT id INTO v_user FROM users WHERE normalized_email=lower(btrim(p_email)) AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found' USING ERRCODE='P0002'; END IF;
  INSERT INTO group_members(group_id,user_id) VALUES(p_group,v_user) ON CONFLICT DO NOTHING;
  IF FOUND THEN UPDATE groups SET version=version+1 WHERE id=p_group; END IF;
END;
$$;

CREATE FUNCTION splix_category(p_name text) RETURNS smallint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id smallint;
BEGIN
  INSERT INTO categories(name) VALUES(p_name) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
COMMIT;
