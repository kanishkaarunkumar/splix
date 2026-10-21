-- Run as a PostgreSQL administrator. Set the login password out of band with \password.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='splix_runtime') THEN
    CREATE ROLE splix_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='splix_api') THEN
    CREATE ROLE splix_api LOGIN;
  END IF;
END $$;
GRANT splix_runtime TO splix_api;
