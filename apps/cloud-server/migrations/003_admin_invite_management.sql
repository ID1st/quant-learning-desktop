CREATE TABLE IF NOT EXISTS admin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  email text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_accounts_singleton_check CHECK (singleton),
  CONSTRAINT admin_accounts_email_normalized CHECK (email = lower(btrim(email)))
);

CREATE TABLE IF NOT EXISTS admin_login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  code_digest bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  consumed_at timestamptz,
  requested_ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_login_challenges_attempts_check
    CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 10)
);

CREATE INDEX IF NOT EXISTS admin_login_challenges_active
  ON admin_login_challenges (admin_id, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  token_digest bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text
);

CREATE INDEX IF NOT EXISTS admin_sessions_active
  ON admin_sessions (admin_id, expires_at)
  WHERE revoked_at IS NULL;
