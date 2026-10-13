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

-- Deliberately only seeds the schema and three members. Financial records should be created
-- through the posting functions so the same lock and validation protocol is exercised.
COMMIT;
