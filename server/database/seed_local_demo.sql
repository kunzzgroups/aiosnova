-- Local development only; run once after V1 in the empty aiosnova database.
-- These identities match frontend demo data, but do not grant backend sessions.
USE aiosnova;
SET time_zone = '+00:00';
START TRANSACTION;

-- user-demo: owner onboarding/MFA is still required for backend authentication.
INSERT INTO users (id, email, full_name, display_name, phone, language, timezone, status)
VALUES ('00000000-0000-4000-8000-000000000001', 'demo@aios.dev', 'Demo User',
        'Demo User', '+60 12-345 0001', 'en', 'Asia/Kuala_Lumpur', 'invited');

-- merchant-acme
INSERT INTO merchants (id, owner_user_id, name, status)
VALUES ('00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000001', 'Acme', 'pending');

INSERT INTO companies (id, merchant_id, code, name, status, require_mfa)
VALUES
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002',
   'RETAIL', 'Acme Retail', 'active', TRUE),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002',
   'WHOLESALE', 'Acme Wholesale', 'active', FALSE),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002',
   'J1', 'J1 (MIDVALLEY)', 'active', FALSE),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002',
   'J2', 'J2 (PARADIGM MALL)', 'active', FALSE),
  ('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000002',
   'TOKYO-I', 'TOKYO IZAKAYA SDN BHD', 'active', FALSE);

COMMIT;

SELECT m.name AS merchant, u.email AS owner_email, c.code, c.name, c.require_mfa
FROM merchants m
JOIN users u ON u.id = m.owner_user_id
JOIN companies c ON c.merchant_id = m.id
WHERE m.id = '00000000-0000-4000-8000-000000000002'
ORDER BY c.code;
